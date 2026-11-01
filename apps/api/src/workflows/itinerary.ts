import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { PLACE_CATEGORIES, tripPreferences, userPreferences, type PlaceCategory, type ProposalDay, type ProposalItem, type TravelLeg } from "@wayfare/shared";
import { getDb, schema } from "../db";
import type { Env } from "../env";
import { aiProvider, chatJson } from "../lib/ai";
import { legsFor, orderByProximity, searchPlaces } from "../lib/geo";
import { notify } from "../lib/notify";
import { broadcast } from "../lib/realtime";

export interface ItineraryWorkflowParams {
  proposalId: string;
}

const PACE_STOPS = { relaxed: 3, balanced: 5, packed: 7 } as const;
const PACE_START = { relaxed: "10:00", balanced: "09:00", packed: "08:30" } as const;

const aiSchema = z.object({
  days: z
    .array(
      z.object({
        dayNumber: z.number().int().min(1),
        title: z.string().max(120).nullish(),
        notes: z.string().max(1000).nullish(),
        items: z
          .array(
            z.object({
              placeId: z.string().max(40).nullish(),
              suggestion: z.object({ name: z.string().min(1).max(200), category: z.string().max(40).nullish() }).nullish(),
              title: z.string().max(200).nullish(),
              durationMinutes: z.number().int().min(10).max(600).nullish(),
              notes: z.string().max(500).nullish(),
            }),
          )
          .max(12),
      }),
    )
    .max(60),
  warnings: z.array(z.string().max(300)).max(20).default([]),
});

/**
 * Durable, retryable itinerary generation. Each step is checkpointed, so a transient AI or geocoding
 * failure retries that step instead of the whole job. The proposal is saved for review; the user's
 * existing itinerary is never modified here.
 */
export class ItineraryWorkflow extends WorkflowEntrypoint<Env, ItineraryWorkflowParams> {
  async run(event: WorkflowEvent<ItineraryWorkflowParams>, step: WorkflowStep) {
    const { proposalId } = event.payload;
    const db = getDb(this.env.DB);

    try {
      // 1–4. Collect trip details, saved places, coordinates and existing plan.
      const ctx = await step.do("load trip context", async () => {
        const proposal = await db.query.itineraryProposals.findFirst({ where: eq(schema.itineraryProposals.id, proposalId) });
        if (!proposal) throw new Error("proposal missing");
        await db.update(schema.itineraryProposals).set({ status: "running", updatedAt: new Date() }).where(eq(schema.itineraryProposals.id, proposalId));
        const trip = (await db.query.trips.findFirst({ where: eq(schema.trips.id, proposal.tripId) }))!;
        const places = await db
          .select({ place: schema.places, mustVisit: schema.tripPlaces.mustVisit })
          .from(schema.tripPlaces)
          .innerJoin(schema.places, eq(schema.places.id, schema.tripPlaces.placeId))
          .where(eq(schema.tripPlaces.tripId, trip.id));
        const days = await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.tripId, trip.id)).orderBy(asc(schema.itineraryDays.dayNumber));
        const items = await db.select().from(schema.itineraryItems).where(eq(schema.itineraryItems.tripId, trip.id));
        const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, proposal.userId) });
        const traveler = userPreferences.safeParse(profile?.preferences ?? {});
        return {
          traveler: traveler.success ? traveler.data.travelProfile : {},
          proposal: { scope: proposal.scope, dayNumber: proposal.dayNumber, instructions: proposal.instructions, userId: proposal.userId },
          trip: {
            id: trip.id,
            name: trip.name,
            destination: trip.destination,
            extraDestinations: trip.extraDestinations,
            lat: trip.destinationLat,
            lng: trip.destinationLng,
            prefs: tripPreferences.parse(trip.preferences ?? {}),
          },
          places: places.map(({ place: p, mustVisit }) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            city: p.city,
            lat: p.lat,
            lng: p.lng,
            mustVisit,
          })),
          days: days.map((d) => ({ id: d.id, dayNumber: d.dayNumber, date: d.date, title: d.title })),
          // For single-day regeneration, places already used on other days are excluded.
          usedElsewhere: items.filter((i) => i.placeId && days.find((d) => d.id === i.dayId)?.dayNumber !== proposal.dayNumber).map((i) => i.placeId!),
        };
      });

      // 5. Ask the model for a draft plan.
      const draft = await step.do("generate with AI", { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" }, timeout: "3 minutes" }, async () => {
        const { trip, places, days, proposal } = ctx;
        const targetDays = proposal.scope === "day" ? days.filter((d) => d.dayNumber === proposal.dayNumber) : days;
        const available = proposal.scope === "day" ? places.filter((p) => !ctx.usedElsewhere.includes(p.id)) : places;
        const prompt = {
          trip: { name: trip.name, destination: trip.destination, alsoVisiting: trip.extraDestinations },
          preferences: trip.prefs,
          days: targetDays.map((d) => ({ dayNumber: d.dayNumber, date: d.date })),
          maxStopsPerDay: PACE_STOPS[trip.prefs.pace],
          savedPlaces: available.map((p) => ({ id: p.id, name: p.name, category: p.category, city: p.city, mustVisit: p.mustVisit, hasLocation: p.lat != null })),
          userInstructions: proposal.instructions ?? null,
          travelerProfile: ctx.traveler,
        };
        if (!aiProvider(this.env)) {
          // Configuration problems won't fix themselves on retry.
          throw new NonRetryableError("AI is not configured (set GROQ_API_KEY or OPENROUTER_API_KEY)");
        }
        return chatJson(this.env, aiSchema, [
          {
            role: "system",
            content:
              "You are a careful travel planner. Build a day-by-day itinerary as JSON: " +
              '{"days":[{"dayNumber":1,"title":"short theme","notes":"optional tip","items":[{"placeId":"<id from savedPlaces>","durationMinutes":90,"notes":"why/what to do"}]}],"warnings":["..."]}. ' +
              "Rules: Prefer savedPlaces and reference them ONLY by their exact id. Include every mustVisit place once. Use each saved place at most once. " +
              "Group places that are geographically close (same city/area) on the same day. Respect maxStopsPerDay. " +
              "Use travelerProfile (who they travel with, budget, what they travel for) to choose suggestions and day themes. " +
              'You may add a few well-known extra stops as {"suggestion":{"name":"Exact Place Name","category":"food"}} when the saved places are not enough, ' +
              'or a free-form activity as {"title":"Lunch break"}. Never invent opening hours, prices or travel times. ' +
              "Add a warning if days are overloaded, places seem to be in a different city than the destination, or there are too few places. Output JSON only.",
          },
          { role: "user", content: JSON.stringify(prompt) },
        ]);
      });

      // 6–7. Validate the structure and check that referenced places exist; geocode AI suggestions.
      const resolved = await step.do("validate and resolve places", async () => {
        const known = new Map(ctx.places.map((p) => [p.id, p]));
        const used = new Set<string>(ctx.usedElsewhere);
        const warnings = [...draft.warnings];
        const near = ctx.trip.lat != null && ctx.trip.lng != null ? { lat: ctx.trip.lat, lng: ctx.trip.lng } : null;
        const dayNumbers = new Set(ctx.days.map((d) => d.dayNumber));
        let dropped = 0;

        const days: { dayNumber: number; title: string | null; notes: string | null; items: (ProposalItem & { lat: number | null; lng: number | null })[] }[] = [];
        for (const d of draft.days) {
          if (!dayNumbers.has(d.dayNumber) || days.some((x) => x.dayNumber === d.dayNumber)) continue;
          if (ctx.proposal.scope === "day" && d.dayNumber !== ctx.proposal.dayNumber) continue;
          const items: (ProposalItem & { lat: number | null; lng: number | null })[] = [];
          for (const it of d.items) {
            const base = { title: null, startTime: null, durationMinutes: it.durationMinutes ?? 60, notes: it.notes ?? null, travelToNext: null };
            if (it.placeId) {
              const p = known.get(it.placeId);
              if (!p || used.has(p.id)) {
                dropped++;
                continue;
              }
              used.add(p.id);
              items.push({ ...base, placeId: p.id, candidate: null, lat: p.lat, lng: p.lng });
            } else if (it.suggestion) {
              const [hit] = await searchPlaces(this.env, `${it.suggestion.name}, ${ctx.trip.destination}`, { near, limit: 1 });
              const category: PlaceCategory = (PLACE_CATEGORIES as readonly string[]).includes(it.suggestion.category ?? "")
                ? (it.suggestion.category as PlaceCategory)
                : (hit?.category ?? "other");
              items.push({
                ...base,
                placeId: null,
                candidate: { name: hit?.name ?? it.suggestion.name, address: hit?.address ?? null, lat: hit?.lat ?? null, lng: hit?.lng ?? null, category },
                lat: hit?.lat ?? null,
                lng: hit?.lng ?? null,
              });
            } else if (it.title) {
              items.push({ ...base, placeId: null, candidate: null, title: it.title, lat: null, lng: null });
            }
          }
          days.push({ dayNumber: d.dayNumber, title: d.title ?? null, notes: d.notes ?? null, items });
        }
        if (dropped) warnings.push(`${dropped} suggested stop(s) referenced unknown or duplicate places and were removed.`);
        const missingMust = ctx.places.filter((p) => p.mustVisit && !used.has(p.id));
        if (missingMust.length && ctx.proposal.scope === "trip") warnings.push(`Not scheduled: ${missingMust.map((p) => p.name).join(", ")}. Add them manually if needed.`);
        if (!days.length) throw new Error("The AI didn't return a usable plan");
        return { days, warnings };
      });

      // 8. Order stops by proximity and attach estimated (or routed) travel legs and time slots.
      const finalDays = await step.do("order stops and compute travel", async () => {
        const mode = ctx.trip.prefs.travelMode;
        const out: ProposalDay[] = [];
        for (const d of resolved.days) {
          // Free-form activities (no location) keep their slot relative to the located stops' order.
          const ordered = orderByProximity(d.items);
          const located = ordered.filter((i) => i.lat != null && i.lng != null);
          const legs: TravelLeg[] = await legsFor(this.env, located.map((i) => ({ lat: i.lat!, lng: i.lng! })), mode);
          const legByItem = new Map(located.slice(0, -1).map((it, idx) => [it, legs[idx]] as const));

          let minutes = toMinutes(PACE_START[ctx.trip.prefs.pace]);
          const items: ProposalItem[] = ordered.map((it, idx) => {
            const startTime = fromMinutes(minutes);
            const leg = legByItem.get(it) ?? null;
            const next = ordered[idx + 1];
            minutes += (it.durationMinutes ?? 60) + (leg && next && next.lat != null ? leg.minutes : 15);
            const { lat: _lat, lng: _lng, ...rest } = it;
            return { ...rest, startTime, travelToNext: next && next.lat != null ? leg : null };
          });
          const warnings: string[] = [];
          if (minutes > toMinutes("21:30")) warnings.push("This day runs late — consider moving a stop to another day.");
          out.push({ dayNumber: d.dayNumber, title: d.title, notes: d.notes, warnings, items });
        }
        return out;
      });

      // 9. Save the proposal for review.
      await step.do("save proposal", async () => {
        await db
          .update(schema.itineraryProposals)
          .set({ status: "ready", payload: { days: finalDays, warnings: resolved.warnings }, updatedAt: new Date() })
          .where(eq(schema.itineraryProposals.id, proposalId));
      });

      // 10. Tell the user.
      await step.do("notify", async () => {
        await broadcast(this.env, ctx.trip.id, { type: "proposal.updated", proposalId, status: "ready" });
        await notify(this.env, ctx.proposal.userId, "itinerary", {
          type: "itinerary.ready",
          title: `Your itinerary for ${ctx.trip.name} is ready to review`,
          link: `/trips/${ctx.trip.id}?tab=itinerary`,
          pushText: "Your itinerary is ready to review.",
        });
      });
    } catch (e) {
      // AI failures never touch the trip or its existing itinerary.
      await step.do("mark failed", async () => {
        const p = await db.query.itineraryProposals.findFirst({ where: eq(schema.itineraryProposals.id, proposalId) });
        await db
          .update(schema.itineraryProposals)
          .set({ status: "failed", error: friendlyError(e), updatedAt: new Date() })
          .where(eq(schema.itineraryProposals.id, proposalId));
        if (p) await broadcast(this.env, p.tripId, { type: "proposal.updated", proposalId, status: "failed" });
      });
    }
  }
}

function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not configured/i.test(msg)) return "AI planning isn't configured on this server.";
  return "We couldn't generate an itinerary right now. Your trip is unchanged — try again or keep planning manually.";
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => {
  const c = Math.min(m, 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

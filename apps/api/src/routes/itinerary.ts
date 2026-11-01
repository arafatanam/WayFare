import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  dayUpdate,
  generateInput,
  itineraryItemInput,
  itineraryItemUpdate,
  reorderInput,
  tripPreferences,
  type ItineraryProposal,
  type ProposalDay,
} from "@wayfare/shared";
import { getDb, schema, type DB } from "../db";
import type { AppEnv, Env } from "../env";
import { requireTripRole } from "../lib/access";
import { track } from "../lib/analytics";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { loadItinerary, nextPosition, normalizeDay, shiftFrom } from "../lib/itinerary";
import { broadcast } from "../lib/realtime";
import { consumeQuota, rateLimit } from "../lib/usage";
import { currentUser } from "../middleware/auth";

/** Mounted at /api/trips/:tripId/itinerary */
export const itineraryRoutes = new Hono<AppEnv>();

const tripIdOf = (c: { req: { param(k: string): string | undefined } }) => c.req.param("tripId")!;

async function travelMode(db: DB, tripId: string) {
  const t = await db.query.trips.findFirst({ where: eq(schema.trips.id, tripId) });
  return tripPreferences.parse(t?.preferences ?? {}).travelMode;
}

async function requireDay(db: DB, tripId: string, dayId: string) {
  const d = await db.query.itineraryDays.findFirst({ where: and(eq(schema.itineraryDays.id, dayId), eq(schema.itineraryDays.tripId, tripId)) });
  if (!d) throw notFound("Day");
  return d;
}

async function requireItem(db: DB, tripId: string, itemId: string) {
  const i = await db.query.itineraryItems.findFirst({ where: and(eq(schema.itineraryItems.id, itemId), eq(schema.itineraryItems.tripId, tripId)) });
  if (!i) throw notFound("Activity");
  return i;
}

async function changed(env: Env, db: DB, tripId: string, actorId: string) {
  await db.update(schema.trips).set({ updatedAt: new Date() }).where(eq(schema.trips.id, tripId));
  await broadcast(env, tripId, { type: "itinerary.updated" }, actorId);
}

itineraryRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "viewer");
  return c.json(await loadItinerary(db, tripId));
});

itineraryRoutes.patch("/days/:dayId", zValidator("json", dayUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const day = await requireDay(db, tripId, c.req.param("dayId"));
  await db.update(schema.itineraryDays).set(c.req.valid("json")).where(eq(schema.itineraryDays.id, day.id));
  await changed(c.env, db, tripId, user.id);
  return c.json({ ok: true });
});

itineraryRoutes.post("/items", zValidator("json", itineraryItemInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const body = c.req.valid("json");
  const day = await requireDay(db, tripId, body.dayId);

  if (body.placeId) {
    const linked = await db.query.tripPlaces.findFirst({ where: and(eq(schema.tripPlaces.tripId, tripId), eq(schema.tripPlaces.placeId, body.placeId)) });
    if (!linked) {
      // Adding a library place directly to a day also adds it to the trip (only your own places).
      const own = await db.query.places.findFirst({ where: and(eq(schema.places.id, body.placeId), eq(schema.places.userId, user.id)) });
      if (!own) throw badRequest("That place isn't part of this trip");
      await db.insert(schema.tripPlaces).values({ tripId, placeId: body.placeId, addedBy: user.id });
    }
  }

  let position = body.position ?? (await nextPosition(db, day.id));
  if (body.position != null) await shiftFrom(db, day.id, position);
  const id = newId();
  await db.insert(schema.itineraryItems).values({
    id,
    tripId,
    dayId: day.id,
    placeId: body.placeId ?? null,
    title: body.title ?? null,
    startTime: body.startTime ?? null,
    durationMinutes: body.durationMinutes ?? null,
    notes: body.notes ?? null,
    position,
  });
  await normalizeDay(c.env, db, day.id, await travelMode(db, tripId));
  await changed(c.env, db, tripId, user.id);
  return c.json({ id }, 201);
});

itineraryRoutes.patch("/items/:itemId", zValidator("json", itineraryItemUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const item = await requireItem(db, tripId, c.req.param("itemId"));
  const body = c.req.valid("json");
  const mode = await travelMode(db, tripId);

  const targetDay = body.dayId ?? item.dayId;
  if (body.dayId && body.dayId !== item.dayId) await requireDay(db, tripId, body.dayId);
  const moving = body.dayId !== undefined || body.position !== undefined;

  if (moving) {
    // Rebuild the target day's order with the item inserted at the requested index.
    const siblings = await db
      .select({ id: schema.itineraryItems.id })
      .from(schema.itineraryItems)
      .where(eq(schema.itineraryItems.dayId, targetDay))
      .orderBy(asc(schema.itineraryItems.position));
    const order = siblings.map((s) => s.id).filter((x) => x !== item.id);
    const at = Math.min(body.position ?? order.length, order.length);
    order.splice(at, 0, item.id);
    await db.update(schema.itineraryItems).set({ dayId: targetDay }).where(eq(schema.itineraryItems.id, item.id));
    await db.batch(order.map((id, i) => db.update(schema.itineraryItems).set({ position: i }).where(eq(schema.itineraryItems.id, id))) as [any, ...any[]]);
  }
  const { dayId: _d, position: _p, ...fields } = body;
  if (Object.keys(fields).length) {
    await db.update(schema.itineraryItems).set({ ...fields, aiGenerated: false, updatedAt: new Date() }).where(eq(schema.itineraryItems.id, item.id));
  }
  if (moving) {
    await normalizeDay(c.env, db, targetDay, mode);
    if (targetDay !== item.dayId) await normalizeDay(c.env, db, item.dayId, mode);
  }
  await changed(c.env, db, tripId, user.id);
  return c.json({ ok: true });
});

itineraryRoutes.delete("/items/:itemId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const item = await requireItem(db, tripId, c.req.param("itemId"));
  await db.delete(schema.itineraryItems).where(eq(schema.itineraryItems.id, item.id));
  await normalizeDay(c.env, db, item.dayId, await travelMode(db, tripId));
  await changed(c.env, db, tripId, user.id);
  return c.json({ ok: true });
});

/** Sets the full order of a day (drag-and-drop); items from other days in the list are moved here. */
itineraryRoutes.put("/order", zValidator("json", reorderInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const { dayId, itemIds } = c.req.valid("json");
  await requireDay(db, tripId, dayId);
  if (!itemIds.length) return c.json({ ok: true });
  const items = await db
    .select()
    .from(schema.itineraryItems)
    .where(and(eq(schema.itineraryItems.tripId, tripId), inArray(schema.itineraryItems.id, itemIds)));
  if (items.length !== itemIds.length) throw badRequest("Unknown activity in order");
  const touchedDays = new Set(items.map((i) => i.dayId));
  await db.batch(itemIds.map((id, i) => db.update(schema.itineraryItems).set({ dayId, position: i }).where(eq(schema.itineraryItems.id, id))) as [any, ...any[]]);
  const mode = await travelMode(db, tripId);
  touchedDays.add(dayId);
  for (const d of touchedDays) await normalizeDay(c.env, db, d, mode);
  await changed(c.env, db, tripId, user.id);
  return c.json({ ok: true });
});

// --- AI proposals -------------------------------------------------------------

function toProposal(p: typeof schema.itineraryProposals.$inferSelect): ItineraryProposal {
  return {
    id: p.id,
    tripId: p.tripId,
    scope: p.scope as "trip" | "day",
    dayNumber: p.dayNumber,
    status: p.status as ItineraryProposal["status"],
    error: p.error,
    days: (p.payload?.days ?? []) as ProposalDay[],
    warnings: p.payload?.warnings ?? [],
    createdAt: p.createdAt.toISOString(),
  };
}

itineraryRoutes.post("/generate", zValidator("json", generateInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const body = c.req.valid("json");
  let dayNumber: number | null = null;
  if (body.scope === "day") {
    if (!body.dayId) throw badRequest("Choose a day to regenerate");
    dayNumber = (await requireDay(db, tripId, body.dayId)).dayNumber;
  }

  const running = await db.query.itineraryProposals.findFirst({
    where: and(eq(schema.itineraryProposals.tripId, tripId), inArray(schema.itineraryProposals.status, ["queued", "running"])),
  });
  if (running && Date.now() - running.createdAt.getTime() < 5 * 60_000) {
    return c.json(toProposal(running), 202);
  }

  await rateLimit(c.env, user.id, "generate", 5, 60);
  await consumeQuota(c.env, user.id, "aiGenerations");

  const id = newId();
  await db.insert(schema.itineraryProposals).values({ id, tripId, userId: user.id, scope: body.scope, dayNumber, instructions: body.instructions ?? null });
  await c.env.ITINERARY_WORKFLOW.create({ id, params: { proposalId: id } });
  c.executionCtx.waitUntil(track(c.env, "itinerary_generate", user.id, { scope: body.scope }));
  const row = (await db.query.itineraryProposals.findFirst({ where: eq(schema.itineraryProposals.id, id) }))!;
  return c.json(toProposal(row), 202);
});

itineraryRoutes.get("/proposals/latest", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "viewer");
  const row = await db.query.itineraryProposals.findFirst({
    where: and(eq(schema.itineraryProposals.tripId, tripId), inArray(schema.itineraryProposals.status, ["queued", "running", "ready", "failed"])),
    orderBy: desc(schema.itineraryProposals.createdAt),
  });
  return c.json(row ? toProposal(row) : null);
});

itineraryRoutes.get("/proposals/:proposalId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "viewer");
  const row = await db.query.itineraryProposals.findFirst({
    where: and(eq(schema.itineraryProposals.id, c.req.param("proposalId")), eq(schema.itineraryProposals.tripId, tripId)),
  });
  if (!row) throw notFound("Proposal");
  return c.json(toProposal(row));
});

/**
 * Applies a ready proposal. Trip scope replaces every day's activities; day scope replaces only that day.
 * AI-suggested places that aren't in the library are saved as new places for the accepting user.
 */
itineraryRoutes.post("/proposals/:proposalId/accept", zValidator("json", z.object({ keepManual: z.boolean().default(false) }).default({ keepManual: false })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  const row = await db.query.itineraryProposals.findFirst({
    where: and(eq(schema.itineraryProposals.id, c.req.param("proposalId")), eq(schema.itineraryProposals.tripId, tripId)),
  });
  if (!row) throw notFound("Proposal");
  if (row.status !== "ready") throw badRequest("This proposal can't be applied");
  const proposal = toProposal(row);

  const days = await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.tripId, tripId)).orderBy(asc(schema.itineraryDays.dayNumber));
  const validPlaceIds = new Set(
    (await db.select({ id: schema.tripPlaces.placeId }).from(schema.tripPlaces).where(eq(schema.tripPlaces.tripId, tripId))).map((r) => r.id),
  );

  for (const pd of proposal.days) {
    const day = days.find((d) => d.dayNumber === pd.dayNumber);
    if (!day) continue;
    if (proposal.scope === "day" && pd.dayNumber !== proposal.dayNumber) continue;
    await db.delete(schema.itineraryItems).where(eq(schema.itineraryItems.dayId, day.id));
    await db.update(schema.itineraryDays).set({ title: pd.title, notes: pd.notes ?? day.notes, warnings: pd.warnings ?? [] }).where(eq(schema.itineraryDays.id, day.id));

    let position = 0;
    for (const it of pd.items) {
      let placeId = it.placeId && validPlaceIds.has(it.placeId) ? it.placeId : null;
      if (!placeId && it.candidate?.name) {
        placeId = newId();
        await db.insert(schema.places).values({
          id: placeId,
          userId: user.id,
          name: it.candidate.name.slice(0, 200),
          address: it.candidate.address ?? null,
          lat: it.candidate.lat ?? null,
          lng: it.candidate.lng ?? null,
          category: it.candidate.category ?? "other",
          sourcePlatform: "search",
          aiDescription: it.notes,
        });
        await db.insert(schema.tripPlaces).values({ tripId, placeId, addedBy: user.id });
        validPlaceIds.add(placeId);
      }
      await db.insert(schema.itineraryItems).values({
        id: newId(),
        tripId,
        dayId: day.id,
        placeId,
        title: placeId ? null : it.title,
        startTime: it.startTime,
        durationMinutes: it.durationMinutes,
        notes: it.notes,
        position: position++,
        aiGenerated: true,
        travelToNext: it.travelToNext as Record<string, unknown> | null,
      });
    }
  }
  await db.update(schema.itineraryProposals).set({ status: "accepted", updatedAt: new Date() }).where(eq(schema.itineraryProposals.id, row.id));
  await changed(c.env, db, tripId, user.id);
  c.executionCtx.waitUntil(track(c.env, "itinerary_accepted", user.id, { scope: proposal.scope }));
  return c.json(await loadItinerary(db, tripId));
});

itineraryRoutes.post("/proposals/:proposalId/discard", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = tripIdOf(c);
  await requireTripRole(db, tripId, user.id, "editor");
  await db
    .update(schema.itineraryProposals)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(schema.itineraryProposals.id, c.req.param("proposalId")), eq(schema.itineraryProposals.tripId, tripId)));
  await broadcast(c.env, tripId, { type: "proposal.updated", proposalId: c.req.param("proposalId"), status: "discarded" }, user.id);
  return c.json({ ok: true });
});

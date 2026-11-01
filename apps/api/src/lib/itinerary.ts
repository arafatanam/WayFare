import { addDays, daysBetween, TRAVEL_MODES, type ItineraryDay } from "@wayfare/shared";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { schema, type DB } from "../db";
import type { Env } from "../env";
import { legsFor } from "./geo";
import { newId } from "./ids";
import { toDay, toItineraryItem } from "./serialize";

/**
 * Keeps itinerary days aligned with the trip's dates. Existing days keep their content (by index);
 * when a trip gets shorter, items from removed days are moved to the new last day rather than deleted.
 */
export async function syncDays(db: DB, trip: { id: string; startDate: string; endDate: string }) {
  const count = daysBetween(trip.startDate, trip.endDate) + 1;
  const days = await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.tripId, trip.id)).orderBy(asc(schema.itineraryDays.dayNumber));

  const ops: Promise<unknown>[] = [];
  for (let i = 0; i < Math.min(count, days.length); i++) {
    const date = addDays(trip.startDate, i);
    if (days[i].date !== date || days[i].dayNumber !== i + 1) {
      ops.push(db.update(schema.itineraryDays).set({ date, dayNumber: i + 1 }).where(eq(schema.itineraryDays.id, days[i].id)));
    }
  }
  for (let i = days.length; i < count; i++) {
    ops.push(db.insert(schema.itineraryDays).values({ id: newId(), tripId: trip.id, dayNumber: i + 1, date: addDays(trip.startDate, i) }));
  }
  await Promise.all(ops);

  if (days.length > count) {
    const lastKept = days[count - 1];
    const removed = days.slice(count).map((d) => d.id);
    const maxPos = await db
      .select({ m: sql<number>`coalesce(max(${schema.itineraryItems.position}), -1)` })
      .from(schema.itineraryItems)
      .where(eq(schema.itineraryItems.dayId, lastKept.id))
      .get();
    const moved = await db.select().from(schema.itineraryItems).where(inArray(schema.itineraryItems.dayId, removed)).orderBy(asc(schema.itineraryItems.position));
    let pos = (maxPos?.m ?? -1) + 1;
    for (const it of moved) {
      await db.update(schema.itineraryItems).set({ dayId: lastKept.id, position: pos++ }).where(eq(schema.itineraryItems.id, it.id));
    }
    await db.delete(schema.itineraryDays).where(inArray(schema.itineraryDays.id, removed));
  }
}

export async function loadItinerary(db: DB, tripId: string): Promise<ItineraryDay[]> {
  const days = await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.tripId, tripId)).orderBy(asc(schema.itineraryDays.dayNumber));
  const rows = await db
    .select({ item: schema.itineraryItems, place: schema.places })
    .from(schema.itineraryItems)
    .leftJoin(schema.places, eq(schema.places.id, schema.itineraryItems.placeId))
    .where(eq(schema.itineraryItems.tripId, tripId))
    .orderBy(asc(schema.itineraryItems.position));
  return days.map((d) =>
    toDay(
      d,
      rows.filter((r) => r.item.dayId === d.id).map((r) => toItineraryItem(r.item, r.place)),
    ),
  );
}

/** Renumbers positions 0..n-1 and recomputes travel legs between consecutive located stops. */
export async function normalizeDay(env: Env, db: DB, dayId: string, travelMode: (typeof TRAVEL_MODES)[number]) {
  const rows = await db
    .select({ item: schema.itineraryItems, place: schema.places })
    .from(schema.itineraryItems)
    .leftJoin(schema.places, eq(schema.places.id, schema.itineraryItems.placeId))
    .where(eq(schema.itineraryItems.dayId, dayId))
    .orderBy(asc(schema.itineraryItems.position), asc(schema.itineraryItems.createdAt));

  const legs: (Record<string, unknown> | null)[] = rows.map(() => null);
  // Compute legs for each pair of consecutive stops that both have coordinates.
  const pairs: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i].place, b = rows[i + 1].place;
    if (a?.lat != null && a.lng != null && b?.lat != null && b.lng != null) pairs.push(i);
  }
  if (pairs.length) {
    for (const i of pairs) {
      const [leg] = await legsFor(env, [{ lat: rows[i].place!.lat!, lng: rows[i].place!.lng! }, { lat: rows[i + 1].place!.lat!, lng: rows[i + 1].place!.lng! }], travelMode);
      legs[i] = leg ? { ...leg } : null;
    }
  }
  const stmts = rows.map((r, i) => db.update(schema.itineraryItems).set({ position: i, travelToNext: legs[i] }).where(eq(schema.itineraryItems.id, r.item.id)));
  if (stmts.length) await db.batch(stmts as [any, ...any[]]);
}

export async function nextPosition(db: DB, dayId: string) {
  const r = await db
    .select({ m: sql<number>`coalesce(max(${schema.itineraryItems.position}), -1)` })
    .from(schema.itineraryItems)
    .where(eq(schema.itineraryItems.dayId, dayId))
    .get();
  return (r?.m ?? -1) + 1;
}

/** Opens a gap at `position` in a day so an item can be inserted there. */
export async function shiftFrom(db: DB, dayId: string, position: number) {
  await db
    .update(schema.itineraryItems)
    .set({ position: sql`${schema.itineraryItems.position} + 1` })
    .where(and(eq(schema.itineraryItems.dayId, dayId), gt(schema.itineraryItems.position, position - 1)));
}

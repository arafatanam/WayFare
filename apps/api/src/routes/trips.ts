import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { daysBetween, tripInput, tripUpdate, type Member, type TripRole } from "@wayfare/shared";
import { getDb, schema, type DB } from "../db";
import type { AppEnv } from "../env";
import { ownedPlaceIds, requireTripRole } from "../lib/access";
import { track } from "../lib/analytics";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import { loadItinerary, syncDays } from "../lib/itinerary";
import { broadcast } from "../lib/realtime";
import { toPlace, toTrip } from "../lib/serialize";
import { currentUser } from "../middleware/auth";

export const tripsRoutes = new Hono<AppEnv>();

export async function tripStats(db: DB, ids: string[]) {
  const map = new Map<string, { placeCount: number; memberCount: number }>();
  for (const id of ids) map.set(id, { placeCount: 0, memberCount: 0 });
  if (!ids.length) return map;
  const [pc, mc] = await Promise.all([
    db.select({ id: schema.tripPlaces.tripId, n: sql<number>`count(*)` }).from(schema.tripPlaces).where(inArray(schema.tripPlaces.tripId, ids)).groupBy(schema.tripPlaces.tripId),
    db.select({ id: schema.tripMembers.tripId, n: sql<number>`count(*)` }).from(schema.tripMembers).where(inArray(schema.tripMembers.tripId, ids)).groupBy(schema.tripMembers.tripId),
  ]);
  for (const r of pc) map.get(r.id)!.placeCount = r.n;
  for (const r of mc) map.get(r.id)!.memberCount = r.n;
  return map;
}

async function getTripDto(db: DB, tripId: string, role: TripRole) {
  const t = (await db.query.trips.findFirst({ where: eq(schema.trips.id, tripId) }))!;
  return toTrip(t, { role, ...(await tripStats(db, [tripId])).get(tripId)! });
}

tripsRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ trip: schema.trips, role: schema.tripMembers.role })
    .from(schema.tripMembers)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.tripMembers.tripId))
    .where(eq(schema.tripMembers.userId, user.id))
    .orderBy(schema.trips.startDate);
  const stats = await tripStats(db, rows.map((r) => r.trip.id));
  return c.json(rows.map((r) => toTrip(r.trip, { role: r.role as TripRole, ...stats.get(r.trip.id)! })));
});

tripsRoutes.post("/", zValidator("json", tripInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const id = newId();

  await db.insert(schema.trips).values({
    id,
    ownerId: user.id,
    name: body.name,
    destination: body.destination,
    destinationLat: body.destinationLat ?? null,
    destinationLng: body.destinationLng ?? null,
    extraDestinations: body.extraDestinations,
    startDate: body.startDate,
    endDate: body.endDate,
    coverImageUrl: body.coverImageUrl ?? null,
    status: body.status,
    preferences: body.preferences,
  });
  await db.insert(schema.tripMembers).values({ tripId: id, userId: user.id, role: "owner" });

  // Places come from explicit picks plus any selected collections; only the user's own places are accepted.
  let placeIds = [...body.placeIds];
  if (body.collectionIds.length) {
    const fromCollections = await db
      .select({ id: schema.collectionPlaces.placeId })
      .from(schema.collectionPlaces)
      .innerJoin(schema.collections, eq(schema.collections.id, schema.collectionPlaces.collectionId))
      .where(and(inArray(schema.collectionPlaces.collectionId, body.collectionIds), eq(schema.collections.ownerId, user.id)));
    placeIds.push(...fromCollections.map((r) => r.id));
  }
  placeIds = await ownedPlaceIds(db, [...new Set([...placeIds, ...body.mustVisitPlaceIds])], user.id);
  if (placeIds.length) {
    await db.insert(schema.tripPlaces).values(placeIds.map((placeId) => ({ tripId: id, placeId, addedBy: user.id, mustVisit: body.mustVisitPlaceIds.includes(placeId) })));
  }
  await syncDays(db, { id, startDate: body.startDate, endDate: body.endDate });

  c.executionCtx.waitUntil(track(c.env, "trip_created", user.id, { days: daysBetween(body.startDate, body.endDate) + 1, places: placeIds.length }));
  return c.json(await getTripDto(db, id, "owner"), 201);
});

tripsRoutes.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const role = await requireTripRole(db, id, user.id, "viewer");
  const [trip, places, members, days] = await Promise.all([getTripDto(db, id, role), tripPlaces(db, id), tripMembers(db, id), loadItinerary(db, id)]);
  return c.json({ trip, places, members, days });
});

export async function tripPlaces(db: DB, tripId: string) {
  const rows = await db
    .select({ place: schema.places, mustVisit: schema.tripPlaces.mustVisit, addedBy: schema.tripPlaces.addedBy })
    .from(schema.tripPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.tripPlaces.placeId))
    .where(eq(schema.tripPlaces.tripId, tripId))
    .orderBy(desc(schema.tripPlaces.addedAt));
  // Collaborators see the place itself but not the owner's private notes.
  return rows.map((r) => ({ ...toPlace(r.place), mustVisit: r.mustVisit, addedBy: r.addedBy }));
}

export async function tripMembers(db: DB, tripId: string): Promise<Member[]> {
  const rows = await db
    .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email, image: schema.user.image, role: schema.tripMembers.role })
    .from(schema.tripMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
    .where(eq(schema.tripMembers.tripId, tripId));
  return rows.map((r) => ({ ...r, role: r.role as TripRole }));
}

tripsRoutes.patch("/:id", zValidator("json", tripUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const ownerOnly = body.visibility !== undefined || body.status === "archived";
  const role = await requireTripRole(db, id, user.id, ownerOnly ? "owner" : "editor");

  const current = (await db.query.trips.findFirst({ where: eq(schema.trips.id, id) }))!;
  const startDate = body.startDate ?? current.startDate;
  const endDate = body.endDate ?? current.endDate;
  if (endDate < startDate) throw badRequest("End date must be on or after start date");

  await db.update(schema.trips).set({ ...body, updatedAt: new Date() }).where(eq(schema.trips.id, id));
  if (body.startDate || body.endDate) await syncDays(db, { id, startDate, endDate });
  if (body.visibility === "private") {
    await db
      .update(schema.shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.shareLinks.resourceType, "trip"), eq(schema.shareLinks.resourceId, id), sql`${schema.shareLinks.revokedAt} is null`));
  }
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "trip.updated" }, user.id));
  return c.json(await getTripDto(db, id, role));
});

tripsRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireTripRole(db, id, user.id, "owner");
  // Cascades remove days, items, members, invites and trip↔place links — never the saved places themselves.
  await db.delete(schema.shareLinks).where(and(eq(schema.shareLinks.resourceType, "trip"), eq(schema.shareLinks.resourceId, id)));
  await db.delete(schema.trips).where(eq(schema.trips.id, id));
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "trip.updated" }, user.id));
  return c.json({ ok: true });
});

/** Copies a trip (own or shared-with-you) into a new private draft owned by you. */
tripsRoutes.post("/:id/duplicate", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const srcId = c.req.param("id");
  await requireTripRole(db, srcId, user.id, "viewer");
  return c.json(await copyTrip(db, srcId, user.id), 201);
});

/**
 * Copies trip + itinerary into a new trip owned by `userId`. Places owned by someone else are
 * copied into the user's library so the new trip only references the user's own data.
 */
export async function copyTrip(db: DB, srcId: string, userId: string) {
  const src = (await db.query.trips.findFirst({ where: eq(schema.trips.id, srcId) }))!;
  const id = newId();
  await db.insert(schema.trips).values({
    ...src,
    id,
    ownerId: userId,
    name: `${src.name}${src.ownerId === userId ? " (copy)" : ""}`.slice(0, 120),
    status: "draft",
    visibility: "private",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.tripMembers).values({ tripId: id, userId, role: "owner" });

  const placeMap = new Map<string, string>();
  const srcPlaces = await db
    .select({ place: schema.places, mustVisit: schema.tripPlaces.mustVisit })
    .from(schema.tripPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.tripPlaces.placeId))
    .where(eq(schema.tripPlaces.tripId, srcId));
  for (const { place, mustVisit } of srcPlaces) {
    let pid = place.id;
    if (place.userId !== userId) {
      pid = newId();
      await db.insert(schema.places).values({ ...place, id: pid, userId, notes: null, visited: false, createdAt: new Date(), updatedAt: new Date() });
    }
    placeMap.set(place.id, pid);
    await db.insert(schema.tripPlaces).values({ tripId: id, placeId: pid, mustVisit, addedBy: userId });
  }

  const days = await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.tripId, srcId));
  const items = await db.select().from(schema.itineraryItems).where(eq(schema.itineraryItems.tripId, srcId));
  for (const d of days) {
    const dayId = newId();
    await db.insert(schema.itineraryDays).values({ ...d, id: dayId, tripId: id });
    for (const it of items.filter((i) => i.dayId === d.id)) {
      await db.insert(schema.itineraryItems).values({
        ...it,
        id: newId(),
        tripId: id,
        dayId,
        placeId: it.placeId ? (placeMap.get(it.placeId) ?? null) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  return toTrip((await db.query.trips.findFirst({ where: eq(schema.trips.id, id) }))!, { role: "owner", ...(await tripStats(db, [id])).get(id)! });
}

// --- Places in a trip -------------------------------------------------------

tripsRoutes.post("/:id/places", zValidator("json", z.object({ placeIds: z.array(z.string()).min(1).max(300), mustVisit: z.boolean().optional() })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireTripRole(db, id, user.id, "editor");
  const { placeIds, mustVisit } = c.req.valid("json");
  const owned = await ownedPlaceIds(db, placeIds, user.id);
  for (const placeId of owned) {
    await db.insert(schema.tripPlaces).values({ tripId: id, placeId, addedBy: user.id, mustVisit: !!mustVisit }).onConflictDoNothing();
  }
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "places.updated" }, user.id));
  return c.json({ added: owned.length });
});

tripsRoutes.patch("/:id/places/:placeId", zValidator("json", z.object({ mustVisit: z.boolean() })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, placeId } = c.req.param();
  await requireTripRole(db, id, user.id, "editor");
  await db.update(schema.tripPlaces).set({ mustVisit: c.req.valid("json").mustVisit }).where(and(eq(schema.tripPlaces.tripId, id), eq(schema.tripPlaces.placeId, placeId)));
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "places.updated" }, user.id));
  return c.json({ ok: true });
});

/** Removes the place from this trip (and its itinerary); the place stays in the owner's library. */
tripsRoutes.delete("/:id/places/:placeId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, placeId } = c.req.param();
  await requireTripRole(db, id, user.id, "editor");
  await db.delete(schema.itineraryItems).where(and(eq(schema.itineraryItems.tripId, id), eq(schema.itineraryItems.placeId, placeId)));
  await db.delete(schema.tripPlaces).where(and(eq(schema.tripPlaces.tripId, id), eq(schema.tripPlaces.placeId, placeId)));
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "places.updated" }, user.id));
  return c.json({ ok: true });
});

// --- Members -----------------------------------------------------------------

tripsRoutes.patch("/:id/members/:userId", zValidator("json", z.object({ role: z.enum(["editor", "viewer"]) })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, userId } = c.req.param();
  await requireTripRole(db, id, user.id, "owner");
  if (userId === user.id) throw badRequest("You can't change your own role");
  await db.update(schema.tripMembers).set({ role: c.req.valid("json").role }).where(and(eq(schema.tripMembers.tripId, id), eq(schema.tripMembers.userId, userId)));
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "members.updated" }, user.id));
  return c.json(await tripMembers(db, id));
});

/** Owner removes a member, or a member leaves. */
tripsRoutes.delete("/:id/members/:userId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, userId } = c.req.param();
  const role = await requireTripRole(db, id, user.id, "viewer");
  if (userId !== user.id && role !== "owner") throw badRequest("Only the owner can remove collaborators");
  if (userId === user.id && role === "owner") throw badRequest("The owner can't leave the trip. Delete it instead.");
  await db.delete(schema.tripMembers).where(and(eq(schema.tripMembers.tripId, id), eq(schema.tripMembers.userId, userId)));
  // Places the member contributed stay on the trip so the shared plan doesn't lose stops.
  c.executionCtx.waitUntil(broadcast(c.env, id, { type: "members.updated" }, user.id));
  return c.json({ ok: true });
});

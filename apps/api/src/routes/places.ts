import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { PLACE_CATEGORIES, placeInput, placeUpdate } from "@wayfare/shared";
import { getDb, schema, type DB } from "../db";
import type { AppEnv } from "../env";
import { canReadPlace, requireOwnedPlace, requireTripRole } from "../lib/access";
import { track } from "../lib/analytics";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { broadcast } from "../lib/realtime";
import { toPlace } from "../lib/serialize";
import { currentUser } from "../middleware/auth";

export const placesRoutes = new Hono<AppEnv>();

const listQuery = z.object({
  q: z.string().max(200).optional(),
  category: z.enum(PLACE_CATEGORIES).optional(),
  collectionId: z.string().optional(),
  tripId: z.string().optional(),
  city: z.string().max(120).optional(),
  visited: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "oldest", "name", "city"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Attaches collection and trip memberships to a list of places. */
export async function withMemberships(db: DB, rows: (typeof schema.places.$inferSelect)[], userId: string) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [cp, tp] = await Promise.all([
    db
      .select({ placeId: schema.collectionPlaces.placeId, collectionId: schema.collectionPlaces.collectionId })
      .from(schema.collectionPlaces)
      .innerJoin(schema.collections, eq(schema.collections.id, schema.collectionPlaces.collectionId))
      .where(and(inArray(schema.collectionPlaces.placeId, ids), eq(schema.collections.ownerId, userId))),
    db
      .select({ placeId: schema.tripPlaces.placeId, tripId: schema.tripPlaces.tripId })
      .from(schema.tripPlaces)
      .innerJoin(schema.tripMembers, and(eq(schema.tripMembers.tripId, schema.tripPlaces.tripId), eq(schema.tripMembers.userId, userId)))
      .where(inArray(schema.tripPlaces.placeId, ids)),
  ]);
  return rows.map((r) =>
    toPlace(r, {
      collectionIds: cp.filter((x) => x.placeId === r.id).map((x) => x.collectionId),
      tripIds: tp.filter((x) => x.placeId === r.id).map((x) => x.tripId),
    }),
  );
}

placesRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const q = c.req.valid("query");

  const conds = [eq(schema.places.userId, user.id)];
  if (q.q) {
    const term = `%${q.q.replace(/[%_]/g, "")}%`;
    conds.push(
      or(like(schema.places.name, term), like(schema.places.address, term), like(schema.places.city, term), like(schema.places.country, term), like(schema.places.notes, term))!,
    );
  }
  if (q.category) conds.push(eq(schema.places.category, q.category));
  if (q.city) conds.push(eq(schema.places.city, q.city));
  if (q.visited) conds.push(eq(schema.places.visited, q.visited === "true"));
  if (q.collectionId) {
    conds.push(sql`exists (select 1 from collection_places cp where cp.place_id = ${schema.places.id} and cp.collection_id = ${q.collectionId})`);
  }
  if (q.tripId) {
    conds.push(sql`exists (select 1 from trip_places tp where tp.place_id = ${schema.places.id} and tp.trip_id = ${q.tripId})`);
  }

  const order = {
    recent: [desc(schema.places.createdAt)],
    oldest: [asc(schema.places.createdAt)],
    name: [asc(schema.places.name)],
    city: [asc(schema.places.city), asc(schema.places.name)],
  }[q.sort];

  const rows = await db.select().from(schema.places).where(and(...conds)).orderBy(...order).limit(q.limit);
  return c.json(await withMemberships(db, rows, user.id));
});

/** Distinct destinations (city/country) for filter chips. */
placesRoutes.get("/destinations", async (c) => {
  const user = currentUser(c);
  const rows = await getDb(c.env.DB)
    .select({ city: schema.places.city, country: schema.places.country, count: sql<number>`count(*)` })
    .from(schema.places)
    .where(and(eq(schema.places.userId, user.id), sql`${schema.places.city} is not null`))
    .groupBy(schema.places.city, schema.places.country)
    .orderBy(desc(sql`count(*)`))
    .limit(50);
  return c.json(rows);
});

placesRoutes.post("/", zValidator("json", placeInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const { collectionIds = [], ...data } = body;
  const id = newId();

  await db.insert(schema.places).values({ id, userId: user.id, ...data });
  if (collectionIds.length) await addToCollections(db, id, collectionIds, user.id);

  c.executionCtx.waitUntil(track(c.env, "place_saved", user.id, { platform: data.sourcePlatform, category: data.category, has_coords: data.lat != null }));
  const row = await requireOwnedPlace(db, id, user.id);
  return c.json((await withMemberships(db, [row], user.id))[0], 201);
});

export async function addToCollections(db: DB, placeId: string, collectionIds: string[], userId: string) {
  const owned = await db
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(and(inArray(schema.collections.id, collectionIds), eq(schema.collections.ownerId, userId)));
  for (const { id } of owned) {
    const max = await db
      .select({ m: sql<number>`coalesce(max(${schema.collectionPlaces.position}), -1)` })
      .from(schema.collectionPlaces)
      .where(eq(schema.collectionPlaces.collectionId, id))
      .get();
    await db.insert(schema.collectionPlaces).values({ collectionId: id, placeId, position: (max?.m ?? -1) + 1 }).onConflictDoNothing();
    await db.update(schema.collections).set({ updatedAt: new Date() }).where(eq(schema.collections.id, id));
  }
}

placesRoutes.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  if (!(await canReadPlace(db, id, user.id))) throw notFound("Place");
  const row = (await db.query.places.findFirst({ where: eq(schema.places.id, id) }))!;
  const [place] = await withMemberships(db, [row], user.id);
  return c.json({ ...place, readOnly: row.userId !== user.id });
});

placesRoutes.patch("/:id", zValidator("json", placeUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedPlace(db, id, user.id);
  const body = c.req.valid("json");
  await db.update(schema.places).set({ ...body, updatedAt: new Date() }).where(eq(schema.places.id, id));
  if (body.visited) c.executionCtx.waitUntil(track(c.env, "place_visited", user.id));
  await broadcastPlaceTrips(c.env, db, id, user.id);
  const row = await requireOwnedPlace(db, id, user.id);
  return c.json((await withMemberships(db, [row], user.id))[0]);
});

placesRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedPlace(db, id, user.id);
  const tripIds = await tripIdsFor(db, id);
  // Itinerary items keep their title so a deleted place doesn't silently vanish from someone's plan.
  await db.run(sql`update itinerary_items set title = coalesce(title, (select name from places where id = ${id})) where place_id = ${id}`);
  await db.delete(schema.places).where(eq(schema.places.id, id));
  for (const t of tripIds) c.executionCtx.waitUntil(broadcast(c.env, t, { type: "places.updated" }, user.id));
  return c.json({ ok: true });
});

placesRoutes.put("/:id/collections", zValidator("json", z.object({ collectionIds: z.array(z.string()).max(100) })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedPlace(db, id, user.id);
  const { collectionIds } = c.req.valid("json");
  const current = await db
    .select({ id: schema.collectionPlaces.collectionId })
    .from(schema.collectionPlaces)
    .innerJoin(schema.collections, eq(schema.collections.id, schema.collectionPlaces.collectionId))
    .where(and(eq(schema.collectionPlaces.placeId, id), eq(schema.collections.ownerId, user.id)));
  const remove = current.map((r) => r.id).filter((x) => !collectionIds.includes(x));
  if (remove.length) {
    await db.delete(schema.collectionPlaces).where(and(eq(schema.collectionPlaces.placeId, id), inArray(schema.collectionPlaces.collectionId, remove)));
  }
  await addToCollections(db, id, collectionIds.filter((x) => !current.some((r) => r.id === x)), user.id);
  const row = await requireOwnedPlace(db, id, user.id);
  return c.json((await withMemberships(db, [row], user.id))[0]);
});

placesRoutes.post("/:id/trips/:tripId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, tripId } = c.req.param();
  await requireOwnedPlace(db, id, user.id);
  await requireTripRole(db, tripId, user.id, "editor");
  await db.insert(schema.tripPlaces).values({ tripId, placeId: id, addedBy: user.id }).onConflictDoNothing();
  c.executionCtx.waitUntil(broadcast(c.env, tripId, { type: "places.updated" }, user.id));
  return c.json({ ok: true });
});

async function tripIdsFor(db: DB, placeId: string) {
  const rows = await db.select({ t: schema.tripPlaces.tripId }).from(schema.tripPlaces).where(eq(schema.tripPlaces.placeId, placeId));
  return rows.map((r) => r.t);
}

async function broadcastPlaceTrips(env: AppEnv["Bindings"], db: DB, placeId: string, actorId: string) {
  for (const t of await tripIdsFor(db, placeId)) await broadcast(env, t, { type: "places.updated" }, actorId);
}

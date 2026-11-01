import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { collectionInput, collectionUpdate } from "@wayfare/shared";
import { getDb, schema, type DB } from "../db";
import type { AppEnv } from "../env";
import { ownedPlaceIds, requireOwnedCollection } from "../lib/access";
import { track } from "../lib/analytics";
import { newId } from "../lib/ids";
import { toCollection } from "../lib/serialize";
import { currentUser } from "../middleware/auth";
import { withMemberships } from "./places";

export const collectionsRoutes = new Hono<AppEnv>();

export async function collectionStats(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, { placeCount: number; previewImages: string[] }>();
  const rows = await db
    .select({ collectionId: schema.collectionPlaces.collectionId, imageUrl: schema.places.imageUrl, position: schema.collectionPlaces.position })
    .from(schema.collectionPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.collectionPlaces.placeId))
    .where(inArray(schema.collectionPlaces.collectionId, ids))
    .orderBy(asc(schema.collectionPlaces.position));
  const map = new Map<string, { placeCount: number; previewImages: string[] }>();
  for (const id of ids) map.set(id, { placeCount: 0, previewImages: [] });
  for (const r of rows) {
    const s = map.get(r.collectionId)!;
    s.placeCount++;
    if (r.imageUrl && s.previewImages.length < 4) s.previewImages.push(r.imageUrl);
  }
  return map;
}

collectionsRoutes.get("/", zValidator("query", z.object({ sort: z.enum(["recent", "opened", "name"]).default("recent") })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { sort } = c.req.valid("query");
  const order = {
    recent: desc(schema.collections.updatedAt),
    opened: sql`coalesce(${schema.collections.lastOpenedAt}, 0) desc`,
    name: asc(schema.collections.name),
  }[sort];
  const rows = await db.select().from(schema.collections).where(eq(schema.collections.ownerId, user.id)).orderBy(order);
  const stats = await collectionStats(db, rows.map((r) => r.id));
  return c.json(rows.map((r) => toCollection(r, stats.get(r.id)!)));
});

collectionsRoutes.post("/", zValidator("json", collectionInput.extend({ placeIds: z.array(z.string()).max(500).optional() })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { placeIds = [], ...data } = c.req.valid("json");
  const id = newId();
  await db.insert(schema.collections).values({ id, ownerId: user.id, ...data });
  const owned = await ownedPlaceIds(db, placeIds, user.id);
  if (owned.length) await db.insert(schema.collectionPlaces).values(owned.map((placeId, position) => ({ collectionId: id, placeId, position })));
  c.executionCtx.waitUntil(track(c.env, "collection_created", user.id, { places: owned.length }));
  const row = await requireOwnedCollection(db, id, user.id);
  return c.json(toCollection(row, (await collectionStats(db, [id])).get(id)!), 201);
});

collectionsRoutes.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const row = await requireOwnedCollection(db, id, user.id);
  await db.update(schema.collections).set({ lastOpenedAt: new Date() }).where(eq(schema.collections.id, id));
  const placeRows = await db
    .select({ place: schema.places })
    .from(schema.collectionPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.collectionPlaces.placeId))
    .where(eq(schema.collectionPlaces.collectionId, id))
    .orderBy(asc(schema.collectionPlaces.position));
  const places = await withMemberships(db, placeRows.map((r) => r.place), user.id);
  return c.json({ ...toCollection(row, (await collectionStats(db, [id])).get(id)!), places });
});

collectionsRoutes.patch("/:id", zValidator("json", collectionUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedCollection(db, id, user.id);
  const body = c.req.valid("json");
  await db.update(schema.collections).set({ ...body, updatedAt: new Date() }).where(eq(schema.collections.id, id));
  // Making a collection private revokes any outstanding share links.
  if (body.visibility === "private") {
    await db
      .update(schema.shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.shareLinks.resourceType, "collection"), eq(schema.shareLinks.resourceId, id), sql`${schema.shareLinks.revokedAt} is null`));
  }
  const row = await requireOwnedCollection(db, id, user.id);
  return c.json(toCollection(row, (await collectionStats(db, [id])).get(id)!));
});

/** Deleting a collection never deletes the places in it. */
collectionsRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedCollection(db, id, user.id);
  await db.delete(schema.shareLinks).where(and(eq(schema.shareLinks.resourceType, "collection"), eq(schema.shareLinks.resourceId, id)));
  await db.delete(schema.collections).where(eq(schema.collections.id, id));
  return c.json({ ok: true });
});

collectionsRoutes.post("/:id/duplicate", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const src = await requireOwnedCollection(db, c.req.param("id"), user.id);
  const id = newId();
  await db.insert(schema.collections).values({
    id,
    ownerId: user.id,
    name: `${src.name} (copy)`.slice(0, 120),
    description: src.description,
    coverImageUrl: src.coverImageUrl,
    visibility: "private",
  });
  await db.run(sql`insert into collection_places (collection_id, place_id, position)
                   select ${id}, place_id, position from collection_places where collection_id = ${src.id}`);
  const row = await requireOwnedCollection(db, id, user.id);
  return c.json(toCollection(row, (await collectionStats(db, [id])).get(id)!), 201);
});

collectionsRoutes.post("/:id/places", zValidator("json", z.object({ placeIds: z.array(z.string()).min(1).max(500) })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedCollection(db, id, user.id);
  const owned = await ownedPlaceIds(db, c.req.valid("json").placeIds, user.id);
  const max = await db
    .select({ m: sql<number>`coalesce(max(${schema.collectionPlaces.position}), -1)` })
    .from(schema.collectionPlaces)
    .where(eq(schema.collectionPlaces.collectionId, id))
    .get();
  let pos = (max?.m ?? -1) + 1;
  for (const placeId of owned) {
    await db.insert(schema.collectionPlaces).values({ collectionId: id, placeId, position: pos++ }).onConflictDoNothing();
  }
  await db.update(schema.collections).set({ updatedAt: new Date() }).where(eq(schema.collections.id, id));
  return c.json({ added: owned.length });
});

/** Removes a place from this collection only; it stays in the library. */
collectionsRoutes.delete("/:id/places/:placeId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { id, placeId } = c.req.param();
  await requireOwnedCollection(db, id, user.id);
  await db.delete(schema.collectionPlaces).where(and(eq(schema.collectionPlaces.collectionId, id), eq(schema.collectionPlaces.placeId, placeId)));
  await db.update(schema.collections).set({ updatedAt: new Date() }).where(eq(schema.collections.id, id));
  return c.json({ ok: true });
});

collectionsRoutes.put("/:id/order", zValidator("json", z.object({ placeIds: z.array(z.string()).max(1000) })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await requireOwnedCollection(db, id, user.id);
  const { placeIds } = c.req.valid("json");
  if (!placeIds.length) return c.json({ ok: true });
  await db.batch(
    placeIds.map((placeId, position) =>
      db.update(schema.collectionPlaces).set({ position }).where(and(eq(schema.collectionPlaces.collectionId, id), eq(schema.collectionPlaces.placeId, placeId))),
    ) as [any, ...any[]],
  );
  return c.json({ ok: true });
});

import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { TripRole } from "@wayfare/shared";
import { schema, type DB } from "../db";
import { forbidden, notFound } from "./errors";

const rank: Record<TripRole, number> = { viewer: 1, editor: 2, owner: 3 };

export async function getTripRole(db: DB, tripId: string, userId: string): Promise<TripRole | null> {
  const row = await db.query.tripMembers.findFirst({
    where: and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)),
  });
  return (row?.role as TripRole) ?? null;
}

/** Throws 404 (not 403) when the user has no access at all, so private trips are not discoverable. */
export async function requireTripRole(db: DB, tripId: string, userId: string, min: TripRole): Promise<TripRole> {
  const role = await getTripRole(db, tripId, userId);
  if (!role) throw notFound("Trip");
  if (rank[role] < rank[min]) throw forbidden(min === "owner" ? "Only the trip owner can do that" : "You have view-only access to this trip");
  return role;
}

export async function requireOwnedPlace(db: DB, placeId: string, userId: string) {
  const place = await db.query.places.findFirst({ where: and(eq(schema.places.id, placeId), eq(schema.places.userId, userId)) });
  if (!place) throw notFound("Place");
  return place;
}

/** Read access to a place: you own it, or it is part of a trip you are a member of. */
export async function canReadPlace(db: DB, placeId: string, userId: string): Promise<boolean> {
  const row = await db
    .select({ id: schema.places.id })
    .from(schema.places)
    .where(
      and(
        eq(schema.places.id, placeId),
        or(
          eq(schema.places.userId, userId),
          sql`exists (select 1 from trip_places tp join trip_members tm on tm.trip_id = tp.trip_id
                      where tp.place_id = ${schema.places.id} and tm.user_id = ${userId})`,
        ),
      ),
    )
    .get();
  return !!row;
}

export async function requireOwnedCollection(db: DB, collectionId: string, userId: string) {
  const c = await db.query.collections.findFirst({
    where: and(eq(schema.collections.id, collectionId), eq(schema.collections.ownerId, userId)),
  });
  if (!c) throw notFound("Collection");
  return c;
}

/** Filters ids down to places the user owns. */
export async function ownedPlaceIds(db: DB, ids: string[], userId: string): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: schema.places.id })
    .from(schema.places)
    .where(and(inArray(schema.places.id, ids), eq(schema.places.userId, userId)));
  return rows.map((r) => r.id);
}

/** Resolves a share token to its resource if the link is active (not revoked, not expired). */
export async function resolveShareToken(db: DB, token: string) {
  return db.query.shareLinks.findFirst({
    where: and(
      eq(schema.shareLinks.token, token),
      isNull(schema.shareLinks.revokedAt),
      or(isNull(schema.shareLinks.expiresAt), gt(schema.shareLinks.expiresAt, new Date())),
    ),
  });
}

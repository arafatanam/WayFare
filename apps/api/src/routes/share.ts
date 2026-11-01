import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { inviteInput, type Invite, type ShareLink, type TripRole } from "@wayfare/shared";
import { getDb, schema, type DB } from "../db";
import type { AppEnv } from "../env";
import { requireOwnedCollection, requireTripRole, resolveShareToken } from "../lib/access";
import { track } from "../lib/analytics";
import { sendEmail } from "../lib/email";
import { ApiError, badRequest, forbidden, notFound } from "../lib/errors";
import { newId, newToken } from "../lib/ids";
import { loadItinerary } from "../lib/itinerary";
import { notify } from "../lib/notify";
import { broadcast } from "../lib/realtime";
import { toCollection, toPlace, toTrip } from "../lib/serialize";
import { currentUser } from "../middleware/auth";
import { collectionStats } from "./collections";
import { copyTrip, tripStats } from "./trips";

// ---------------------------------------------------------------------------
// Share links (authenticated)
// ---------------------------------------------------------------------------

export const shareRoutes = new Hono<AppEnv>();

const toLink = (l: typeof schema.shareLinks.$inferSelect): ShareLink => ({
  id: l.id,
  token: l.token,
  resourceType: l.resourceType as ShareLink["resourceType"],
  resourceId: l.resourceId,
  createdAt: l.createdAt.toISOString(),
  expiresAt: l.expiresAt?.toISOString() ?? null,
  revokedAt: l.revokedAt?.toISOString() ?? null,
});

async function requireShareOwner(db: DB, type: "trip" | "collection", id: string, userId: string) {
  if (type === "trip") await requireTripRole(db, id, userId, "owner");
  else await requireOwnedCollection(db, id, userId);
}

const resource = z.object({ resourceType: z.enum(["trip", "collection"]), resourceId: z.string() });

shareRoutes.get("/", zValidator("query", resource), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { resourceType, resourceId } = c.req.valid("query");
  await requireShareOwner(db, resourceType, resourceId, user.id);
  const rows = await db
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.resourceType, resourceType), eq(schema.shareLinks.resourceId, resourceId), isNull(schema.shareLinks.revokedAt)))
    .orderBy(desc(schema.shareLinks.createdAt));
  return c.json(rows.map(toLink));
});

/** Creates a view-only link. Links never grant edit access; editors must be invited. */
shareRoutes.post("/", zValidator("json", resource.extend({ expiresInDays: z.number().int().min(1).max(365).nullish() })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const { resourceType, resourceId, expiresInDays } = c.req.valid("json");
  await requireShareOwner(db, resourceType, resourceId, user.id);
  const id = newId();
  await db.insert(schema.shareLinks).values({
    id,
    token: newToken(),
    resourceType,
    resourceId,
    createdBy: user.id,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
  });
  const table = resourceType === "trip" ? schema.trips : schema.collections;
  await db.update(table).set({ visibility: sql`case when visibility = 'private' then 'link' else visibility end` }).where(eq(table.id, resourceId));
  c.executionCtx.waitUntil(track(c.env, "share_link_created", user.id, { type: resourceType }));
  return c.json(toLink((await db.query.shareLinks.findFirst({ where: eq(schema.shareLinks.id, id) }))!), 201);
});

shareRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const link = await db.query.shareLinks.findFirst({ where: eq(schema.shareLinks.id, c.req.param("id")) });
  if (!link) throw notFound("Link");
  await requireShareOwner(db, link.resourceType as "trip" | "collection", link.resourceId, user.id);
  await db.update(schema.shareLinks).set({ revokedAt: new Date() }).where(eq(schema.shareLinks.id, link.id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const tripInviteRoutes = new Hono<AppEnv>(); // mounted at /api/trips/:tripId/invites
export const inviteRoutes = new Hono<AppEnv>(); // mounted at /api/invites

const INVITE_TTL = 14 * 86_400_000;

const toInvite = (i: typeof schema.tripInvites.$inferSelect, extra: Partial<Invite> = {}): Invite => ({
  id: i.id,
  tripId: i.tripId,
  email: i.email,
  role: i.role as TripRole,
  status: i.status as Invite["status"],
  createdAt: i.createdAt.toISOString(),
  ...extra,
});

tripInviteRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = c.req.param("tripId")!;
  await requireTripRole(db, tripId, user.id, "owner");
  const rows = await db
    .select()
    .from(schema.tripInvites)
    .where(and(eq(schema.tripInvites.tripId, tripId), eq(schema.tripInvites.status, "pending")))
    .orderBy(desc(schema.tripInvites.createdAt));
  return c.json(rows.map((r) => toInvite(r)));
});

tripInviteRoutes.post("/", zValidator("json", inviteInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = c.req.param("tripId")!;
  await requireTripRole(db, tripId, user.id, "owner");
  const { email, role } = c.req.valid("json");
  if (email === user.email.toLowerCase()) throw badRequest("You're already on this trip");

  const existingUser = await db.query.user.findFirst({ where: eq(sql`lower(${schema.user.email})`, email) });
  if (existingUser) {
    const member = await db.query.tripMembers.findFirst({ where: and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, existingUser.id)) });
    if (member) throw badRequest("That person is already a collaborator");
  }
  // Replace any previous pending invite for the same email.
  await db
    .update(schema.tripInvites)
    .set({ status: "revoked" })
    .where(and(eq(schema.tripInvites.tripId, tripId), eq(schema.tripInvites.email, email), eq(schema.tripInvites.status, "pending")));

  const id = newId();
  await db.insert(schema.tripInvites).values({ id, tripId, email, role, invitedBy: user.id, expiresAt: new Date(Date.now() + INVITE_TTL) });
  const trip = (await db.query.trips.findFirst({ where: eq(schema.trips.id, tripId) }))!;

  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: email,
      subject: `${user.name} invited you to plan "${trip.name}" on Wayfare`,
      text: `${user.name} invited you to join their trip "${trip.name}" as ${role === "editor" ? "an editor" : "a viewer"}.\n\nOpen Wayfare to accept: ${c.env.APP_URL}/invites\n\nSign in or create an account with ${email} to see the invitation. It expires in 14 days.`,
    }),
  );
  if (existingUser) {
    c.executionCtx.waitUntil(
      notify(c.env, existingUser.id, "collaboration", {
        type: "invite.received",
        title: `${user.name} invited you to "${trip.name}"`,
        link: "/invites",
        pushText: "You have a new trip invitation.",
      }),
    );
  }
  c.executionCtx.waitUntil(track(c.env, "invite_sent", user.id, { role }));
  return c.json(toInvite((await db.query.tripInvites.findFirst({ where: eq(schema.tripInvites.id, id) }))!), 201);
});

tripInviteRoutes.delete("/:inviteId", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const tripId = c.req.param("tripId")!;
  await requireTripRole(db, tripId, user.id, "owner");
  await db
    .update(schema.tripInvites)
    .set({ status: "revoked" })
    .where(and(eq(schema.tripInvites.id, c.req.param("inviteId")), eq(schema.tripInvites.tripId, tripId)));
  return c.json({ ok: true });
});

inviteRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ invite: schema.tripInvites, tripName: schema.trips.name, invitedByName: schema.user.name })
    .from(schema.tripInvites)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.tripInvites.tripId))
    .leftJoin(schema.user, eq(schema.user.id, schema.tripInvites.invitedBy))
    .where(and(eq(schema.tripInvites.email, user.email.toLowerCase()), eq(schema.tripInvites.status, "pending"), gt(schema.tripInvites.expiresAt, new Date())))
    .orderBy(desc(schema.tripInvites.createdAt));
  return c.json({
    emailVerified: await isEmailVerified(db, user.id),
    invites: rows.map((r) => toInvite(r.invite, { tripName: r.tripName, invitedByName: r.invitedByName ?? undefined })),
  });
});

/** Read from the DB: the session cookie cache can lag a few minutes behind a fresh verification. */
async function isEmailVerified(db: DB, userId: string) {
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  return !!u?.emailVerified;
}

async function requireMyInvite(db: DB, id: string, email: string) {
  const inv = await db.query.tripInvites.findFirst({
    where: and(eq(schema.tripInvites.id, id), eq(schema.tripInvites.email, email.toLowerCase()), eq(schema.tripInvites.status, "pending"), gt(schema.tripInvites.expiresAt, new Date())),
  });
  if (!inv) throw notFound("Invitation");
  return inv;
}

inviteRoutes.post("/:id/accept", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  // Accepting requires a verified email, otherwise anyone could sign up with the invitee's address.
  if (!(await isEmailVerified(db, user.id))) throw forbidden("Verify your email address to accept invitations");
  const inv = await requireMyInvite(db, c.req.param("id"), user.email);
  await db.insert(schema.tripMembers).values({ tripId: inv.tripId, userId: user.id, role: inv.role }).onConflictDoNothing();
  await db.update(schema.tripInvites).set({ status: "accepted" }).where(eq(schema.tripInvites.id, inv.id));
  c.executionCtx.waitUntil(broadcast(c.env, inv.tripId, { type: "members.updated" }, user.id));
  if (inv.invitedBy) {
    c.executionCtx.waitUntil(
      notify(c.env, inv.invitedBy, "collaboration", { type: "invite.accepted", title: `${user.name} joined your trip`, link: `/trips/${inv.tripId}`, pushText: "Someone joined your trip." }),
    );
  }
  return c.json({ tripId: inv.tripId });
});

inviteRoutes.post("/:id/decline", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const inv = await requireMyInvite(db, c.req.param("id"), user.email);
  await db.update(schema.tripInvites).set({ status: "declined" }).where(eq(schema.tripInvites.id, inv.id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Public (unauthenticated) views: share-link tokens and explicitly public content.
// Private notes and member emails are never included.
// ---------------------------------------------------------------------------

export const publicRoutes = new Hono<AppEnv>();

const publicPlace = (p: typeof schema.places.$inferSelect) => {
  const { notes: _n, userId: _u, sourceText: _s, ...rest } = toPlace(p);
  return { ...rest, notes: null, userId: "", sourceText: null };
};

export async function publicTripView(db: DB, tripId: string) {
  const t = await db.query.trips.findFirst({ where: eq(schema.trips.id, tripId) });
  if (!t) return null;
  const owner = await db.query.user.findFirst({ where: eq(schema.user.id, t.ownerId) });
  const places = await db
    .select({ place: schema.places })
    .from(schema.tripPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.tripPlaces.placeId))
    .where(eq(schema.tripPlaces.tripId, tripId));
  const days = await loadItinerary(db, tripId);
  const trip = toTrip(t, { role: "viewer", ...(await tripStats(db, [tripId])).get(tripId)! });
  return {
    kind: "trip" as const,
    trip: { ...trip, preferences: { ...trip.preferences, notes: null, accessibility: null, startLocation: null } },
    ownerName: owner?.name ?? "A traveler",
    places: places.map((r) => publicPlace(r.place)),
    days: days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, notes: i.notes })) })),
  };
}

export async function publicCollectionView(db: DB, collectionId: string) {
  const col = await db.query.collections.findFirst({ where: eq(schema.collections.id, collectionId) });
  if (!col) return null;
  const owner = await db.query.user.findFirst({ where: eq(schema.user.id, col.ownerId) });
  const rows = await db
    .select({ place: schema.places })
    .from(schema.collectionPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.collectionPlaces.placeId))
    .where(eq(schema.collectionPlaces.collectionId, collectionId))
    .orderBy(asc(schema.collectionPlaces.position));
  return {
    kind: "collection" as const,
    collection: toCollection(col, (await collectionStats(db, [collectionId])).get(collectionId)!),
    ownerName: owner?.name ?? "A traveler",
    places: rows.map((r) => publicPlace(r.place)),
  };
}

publicRoutes.get("/s/:token", async (c) => {
  const db = getDb(c.env.DB);
  const link = await resolveShareToken(db, c.req.param("token"));
  if (!link) throw new ApiError(404, "not_found", "This link is no longer active");
  const view = link.resourceType === "trip" ? await publicTripView(db, link.resourceId) : await publicCollectionView(db, link.resourceId);
  if (!view) throw new ApiError(404, "not_found", "This link is no longer active");
  c.header("Cache-Control", "private, no-store");
  return c.json(view);
});

publicRoutes.get("/trips/:id", async (c) => {
  const db = getDb(c.env.DB);
  const t = await db.query.trips.findFirst({ where: and(eq(schema.trips.id, c.req.param("id")), eq(schema.trips.visibility, "public")) });
  if (!t) throw notFound("Trip");
  return c.json(await publicTripView(db, t.id));
});

publicRoutes.get("/collections/:id", async (c) => {
  const db = getDb(c.env.DB);
  const col = await db.query.collections.findFirst({ where: and(eq(schema.collections.id, c.req.param("id")), eq(schema.collections.visibility, "public")) });
  if (!col) throw notFound("Collection");
  return c.json(await publicCollectionView(db, col.id));
});

/** Copy a shared/public trip or collection into your own account. */
export const copyRoutes = new Hono<AppEnv>();

copyRoutes.post("/", zValidator("json", z.object({ token: z.string().optional(), tripId: z.string().optional(), collectionId: z.string().optional() })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  let type: "trip" | "collection";
  let id: string;
  if (body.token) {
    const link = await resolveShareToken(db, body.token);
    if (!link) throw new ApiError(404, "not_found", "This link is no longer active");
    type = link.resourceType as "trip" | "collection";
    id = link.resourceId;
  } else if (body.tripId) {
    const t = await db.query.trips.findFirst({ where: and(eq(schema.trips.id, body.tripId), eq(schema.trips.visibility, "public")) });
    if (!t) throw notFound("Trip");
    type = "trip";
    id = t.id;
  } else if (body.collectionId) {
    const col = await db.query.collections.findFirst({ where: and(eq(schema.collections.id, body.collectionId), eq(schema.collections.visibility, "public")) });
    if (!col) throw notFound("Collection");
    type = "collection";
    id = col.id;
  } else throw badRequest("Nothing to copy");

  c.executionCtx.waitUntil(track(c.env, "public_copied", user.id, { type }));
  if (type === "trip") return c.json({ type, trip: await copyTrip(db, id, user.id) }, 201);

  const src = (await db.query.collections.findFirst({ where: eq(schema.collections.id, id) }))!;
  const newCol = newId();
  await db.insert(schema.collections).values({ id: newCol, ownerId: user.id, name: src.name, description: src.description, coverImageUrl: src.coverImageUrl });
  const rows = await db
    .select({ place: schema.places, position: schema.collectionPlaces.position })
    .from(schema.collectionPlaces)
    .innerJoin(schema.places, eq(schema.places.id, schema.collectionPlaces.placeId))
    .where(eq(schema.collectionPlaces.collectionId, id));
  for (const { place, position } of rows) {
    let pid = place.id;
    if (place.userId !== user.id) {
      pid = newId();
      await db.insert(schema.places).values({ ...place, id: pid, userId: user.id, notes: null, visited: false, createdAt: new Date(), updatedAt: new Date() });
    }
    await db.insert(schema.collectionPlaces).values({ collectionId: newCol, placeId: pid, position }).onConflictDoNothing();
  }
  return c.json({ type, collectionId: newCol }, 201);
});

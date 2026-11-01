import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray, isNull, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { profileUpdate, tripPhase, userPreferences, type Me, type TripRole } from "@wayfare/shared";
import { getDb, schema } from "../db";
import type { AppEnv } from "../env";
import { track } from "../lib/analytics";
import { getPlan, getSubscription, getUsage, limitsFor } from "../lib/usage";
import { toCollection, toImport, toTrip } from "../lib/serialize";
import { currentUser } from "../middleware/auth";
import { collectionStats } from "./collections";
import { withMemberships } from "./places";
import { tripStats } from "./trips";

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  let profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  if (!profile) {
    await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
    profile = (await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }))!;
  }
  const [plan, usage, sub, row] = await Promise.all([
    getPlan(c.env, user.id),
    getUsage(c.env, user.id),
    getSubscription(c.env, user.id),
    db.query.user.findFirst({ where: eq(schema.user.id, user.id) }),
  ]);
  const me: Me = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    emailVerified: row?.emailVerified ?? user.emailVerified,
    onboarded: profile.onboarded,
    onboardingStep: profile.onboardingStep,
    preferences: userPreferences.parse(profile.preferences ?? {}),
    plan,
    subscription: sub ? { status: sub.status, provider: sub.provider, currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null } : null,
    usage: { ...usage, limits: limitsFor(plan) },
  };
  return c.json(me);
});

meRoutes.patch("/profile", zValidator("json", profileUpdate), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const current = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const merged = userPreferences.parse({ ...(current?.preferences ?? {}), ...(body.preferences ?? {}) });
  await db
    .insert(schema.profiles)
    .values({ userId: user.id, preferences: merged, onboarded: body.onboarded ?? false, onboardingStep: body.onboardingStep ?? 0 })
    .onConflictDoUpdate({
      target: schema.profiles.userId,
      set: {
        preferences: merged,
        ...(body.onboarded !== undefined ? { onboarded: body.onboarded } : {}),
        ...(body.onboardingStep !== undefined ? { onboardingStep: body.onboardingStep } : {}),
        updatedAt: new Date(),
      },
    });
  if (body.onboarded) c.executionCtx.waitUntil(track(c.env, "onboarding_completed", user.id, { interests: merged.interests.length }));
  return c.json({ ok: true });
});

/** Everything the Home screen needs in one round trip. */
meRoutes.get("/home", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const today = new Date().toISOString().slice(0, 10);

  const [tripRows, recentPlaces, recentCollections, pendingImports, counts] = await Promise.all([
    db
      .select({ trip: schema.trips, role: schema.tripMembers.role })
      .from(schema.tripMembers)
      .innerJoin(schema.trips, eq(schema.trips.id, schema.tripMembers.tripId))
      .where(and(eq(schema.tripMembers.userId, user.id), gte(schema.trips.endDate, today), sql`${schema.trips.status} != 'archived'`))
      .orderBy(schema.trips.startDate)
      .limit(6),
    db.select().from(schema.places).where(eq(schema.places.userId, user.id)).orderBy(desc(schema.places.createdAt)).limit(8),
    db
      .select()
      .from(schema.collections)
      .where(eq(schema.collections.ownerId, user.id))
      .orderBy(sql`coalesce(${schema.collections.lastOpenedAt}, ${schema.collections.updatedAt}) desc`)
      .limit(6),
    db
      .select()
      .from(schema.imports)
      .where(and(eq(schema.imports.userId, user.id), inArray(schema.imports.status, ["queued", "processing", "needs_review", "failed"])))
      .orderBy(desc(schema.imports.createdAt))
      .limit(5),
    db
      .select({
        places: sql<number>`(select count(*) from places where user_id = ${user.id})`,
        collections: sql<number>`(select count(*) from collections where owner_id = ${user.id})`,
        trips: sql<number>`(select count(*) from trip_members where user_id = ${user.id})`,
      })
      .from(sql`(select 1)`)
      .get(),
  ]);
  const tStats = await tripStats(db, tripRows.map((r) => r.trip.id));
  const cStats = await collectionStats(db, recentCollections.map((r) => r.id));
  // "Continue planning": most recently edited trip that isn't completed.
  const continueTrip = [...tripRows].sort((a, b) => b.trip.updatedAt.getTime() - a.trip.updatedAt.getTime())[0];

  return c.json({
    upcomingTrips: tripRows.map((r) => toTrip(r.trip, { role: r.role as TripRole, ...tStats.get(r.trip.id)! })),
    continueTripId: continueTrip?.trip.id ?? null,
    recentPlaces: await withMemberships(db, recentPlaces, user.id),
    recentCollections: recentCollections.map((r) => toCollection(r, cStats.get(r.id)!)),
    pendingImports: pendingImports.map(toImport),
    counts: counts ?? { places: 0, collections: 0, trips: 0 },
  });
});

/** Cross-entity search across places, collections and trips. */
meRoutes.get("/search", zValidator("query", z.object({ q: z.string().trim().min(1).max(200) })), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const term = `%${c.req.valid("query").q.replace(/[%_]/g, "")}%`;
  const [places, collections, trips] = await Promise.all([
    db
      .select()
      .from(schema.places)
      .where(
        and(
          eq(schema.places.userId, user.id),
          or(like(schema.places.name, term), like(schema.places.address, term), like(schema.places.city, term), like(schema.places.country, term), like(schema.places.notes, term)),
        ),
      )
      .limit(20),
    db
      .select()
      .from(schema.collections)
      .where(and(eq(schema.collections.ownerId, user.id), or(like(schema.collections.name, term), like(schema.collections.description, term))))
      .limit(10),
    db
      .select({ trip: schema.trips, role: schema.tripMembers.role })
      .from(schema.tripMembers)
      .innerJoin(schema.trips, eq(schema.trips.id, schema.tripMembers.tripId))
      .where(and(eq(schema.tripMembers.userId, user.id), or(like(schema.trips.name, term), like(schema.trips.destination, term))))
      .limit(10),
  ]);
  const placesDto = await withMemberships(db, places, user.id);
  const colNames = new Map(
    (await db.select({ id: schema.collections.id, name: schema.collections.name }).from(schema.collections).where(eq(schema.collections.ownerId, user.id))).map((r) => [r.id, r.name]),
  );
  const cStats = await collectionStats(db, collections.map((r) => r.id));
  const tStats = await tripStats(db, trips.map((r) => r.trip.id));
  return c.json({
    places: placesDto.map((p) => ({ ...p, context: (p.collectionIds ?? []).map((id) => colNames.get(id)).filter(Boolean) })),
    collections: collections.map((r) => toCollection(r, cStats.get(r.id)!)),
    trips: trips.map((r) => ({ ...toTrip(r.trip, { role: r.role as TripRole, ...tStats.get(r.trip.id)! }), phase: tripPhase(r.trip) })),
  });
});

/** Data export: everything the user owns, as JSON. */
meRoutes.get("/export", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const ownedTrips = await db.select().from(schema.trips).where(eq(schema.trips.ownerId, user.id));
  const tripIds = ownedTrips.map((t) => t.id);
  const [profile, places, collections, collectionPlaces, days, items, imports, notifications] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }),
    db.select().from(schema.places).where(eq(schema.places.userId, user.id)),
    db.select().from(schema.collections).where(eq(schema.collections.ownerId, user.id)),
    db
      .select({ collectionId: schema.collectionPlaces.collectionId, placeId: schema.collectionPlaces.placeId, position: schema.collectionPlaces.position })
      .from(schema.collectionPlaces)
      .innerJoin(schema.collections, eq(schema.collections.id, schema.collectionPlaces.collectionId))
      .where(eq(schema.collections.ownerId, user.id)),
    tripIds.length ? db.select().from(schema.itineraryDays).where(inArray(schema.itineraryDays.tripId, tripIds)) : [],
    tripIds.length ? db.select().from(schema.itineraryItems).where(inArray(schema.itineraryItems.tripId, tripIds)) : [],
    db.select().from(schema.imports).where(eq(schema.imports.userId, user.id)),
    db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
  ]);
  c.header("Content-Disposition", `attachment; filename="wayfare-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email: user.email },
    profile,
    places,
    collections,
    collectionPlaces,
    trips: ownedTrips,
    itineraryDays: days,
    itineraryItems: items,
    imports: imports.map(toImport),
    unreadNotifications: notifications,
  });
});

meRoutes.post("/push-tokens", zValidator("json", z.object({ token: z.string().min(10).max(300), platform: z.enum(["ios", "android", "web"]) })), async (c) => {
  const user = currentUser(c);
  const { token, platform } = c.req.valid("json");
  await getDb(c.env.DB)
    .insert(schema.pushTokens)
    .values({ token, platform, userId: user.id })
    .onConflictDoUpdate({ target: schema.pushTokens.token, set: { userId: user.id, platform } });
  return c.json({ ok: true });
});

meRoutes.delete("/push-tokens/:token", async (c) => {
  const user = currentUser(c);
  await getDb(c.env.DB)
    .delete(schema.pushTokens)
    .where(and(eq(schema.pushTokens.token, c.req.param("token")), eq(schema.pushTokens.userId, user.id)));
  return c.json({ ok: true });
});

// --- Notifications -------------------------------------------------------------

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await getDb(c.env.DB)
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);
  return c.json(
    rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
  );
});

notificationRoutes.post("/read", zValidator("json", z.object({ ids: z.array(z.string()).max(100).optional() })), async (c) => {
  const user = currentUser(c);
  const { ids } = c.req.valid("json");
  const conds = [eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)];
  if (ids?.length) conds.push(inArray(schema.notifications.id, ids));
  await getDb(c.env.DB).update(schema.notifications).set({ readAt: new Date() }).where(and(...conds));
  return c.json({ ok: true });
});

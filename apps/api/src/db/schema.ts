import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const created = () => ts("created_at").notNull().default(now);
const updated = () => ts("updated_at").notNull().default(now);

// ---------------------------------------------------------------------------
// Better Auth core tables
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: updated(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: created(),
  updatedAt: updated(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updated(),
});

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    lat: real("lat"),
    lng: real("lng"),
    category: text("category").notNull().default("other"),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url"),
    sourcePlatform: text("source_platform").notNull().default("manual"),
    sourceText: text("source_text"),
    notes: text("notes"),
    aiDescription: text("ai_description"),
    externalId: text("external_id"),
    visited: integer("visited", { mode: "boolean" }).notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("places_user_idx").on(t.userId, t.createdAt), index("places_user_city_idx").on(t.userId, t.city)],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    visibility: text("visibility").notNull().default("private"),
    lastOpenedAt: ts("last_opened_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("collections_owner_idx").on(t.ownerId), index("collections_visibility_idx").on(t.visibility)],
);

export const collectionPlaces = sqliteTable(
  "collection_places",
  {
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.placeId] }), index("collection_places_place_idx").on(t.placeId)],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    destination: text("destination").notNull(),
    destinationLat: real("destination_lat"),
    destinationLng: real("destination_lng"),
    extraDestinations: text("extra_destinations", { mode: "json" }).$type<string[]>().notNull().default([]),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    coverImageUrl: text("cover_image_url"),
    status: text("status").notNull().default("planned"),
    visibility: text("visibility").notNull().default("private"),
    preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("trips_owner_idx").on(t.ownerId), index("trips_visibility_idx").on(t.visibility)],
);

export const tripMembers = sqliteTable(
  "trip_members",
  {
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] }), index("trip_members_user_idx").on(t.userId)],
);

export const tripPlaces = sqliteTable(
  "trip_places",
  {
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull().references(() => places.id, { onDelete: "cascade" }),
    mustVisit: integer("must_visit", { mode: "boolean" }).notNull().default(false),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    addedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.placeId] }), index("trip_places_place_idx").on(t.placeId)],
);

export const tripInvites = sqliteTable(
  "trip_invites",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("trip_invites_email_idx").on(t.email, t.status), index("trip_invites_trip_idx").on(t.tripId)],
);

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("share_links_token_idx").on(t.token), index("share_links_resource_idx").on(t.resourceType, t.resourceId)],
);

export const itineraryDays = sqliteTable(
  "itinerary_days",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    date: text("date").notNull(),
    title: text("title"),
    notes: text("notes"),
    warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull().default([]),
  },
  (t) => [index("itinerary_days_trip_idx").on(t.tripId, t.dayNumber)],
);

export const itineraryItems = sqliteTable(
  "itinerary_items",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    dayId: text("day_id").notNull().references(() => itineraryDays.id, { onDelete: "cascade" }),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    title: text("title"),
    startTime: text("start_time"),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
    travelToNext: text("travel_to_next", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("itinerary_items_day_idx").on(t.dayId, t.position), index("itinerary_items_trip_idx").on(t.tripId)],
);

/** AI proposals are kept separate so the user can review, accept or discard them without losing their itinerary. */
export const itineraryProposals = sqliteTable(
  "itinerary_proposals",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    dayNumber: integer("day_number"),
    instructions: text("instructions"),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    payload: text("payload", { mode: "json" }).$type<{ days: unknown[]; warnings: string[] } | null>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("itinerary_proposals_trip_idx").on(t.tripId, t.createdAt)],
);

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    input: text("input").notNull(),
    mediaKey: text("media_key"),
    platform: text("platform").notNull().default("web"),
    status: text("status").notNull().default("queued"),
    title: text("title"),
    caption: text("caption"),
    imageUrl: text("image_url"),
    candidates: text("candidates", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    error: text("error"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("imports_user_idx").on(t.userId, t.createdAt)],
);

export const subscriptions = sqliteTable("subscriptions", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  plan: text("plan").notNull().default("pro"),
  status: text("status").notNull(),
  externalCustomerId: text("external_customer_id"),
  externalSubscriptionId: text("external_subscription_id"),
  currentPeriodEnd: ts("current_period_end"),
  updatedAt: updated(),
});

export const billingEvents = sqliteTable("billing_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  userId: text("user_id"),
  receivedAt: created(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const pushTokens = sqliteTable("push_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  createdAt: created(),
});

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLACE_CATEGORIES = [
  "food",
  "cafe",
  "bar",
  "nature",
  "beach",
  "history",
  "museum",
  "architecture",
  "shopping",
  "nightlife",
  "outdoors",
  "viewpoint",
  "hotel",
  "other",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const CATEGORY_META: Record<PlaceCategory, { label: string; emoji: string }> = {
  food: { label: "Food", emoji: "🍜" },
  cafe: { label: "Cafés", emoji: "☕" },
  bar: { label: "Bars", emoji: "🍸" },
  nature: { label: "Nature", emoji: "🌿" },
  beach: { label: "Beaches", emoji: "🏖️" },
  history: { label: "History", emoji: "🏛️" },
  museum: { label: "Museums", emoji: "🖼️" },
  architecture: { label: "Architecture", emoji: "🏙️" },
  shopping: { label: "Shopping", emoji: "🛍️" },
  nightlife: { label: "Nightlife", emoji: "🌙" },
  outdoors: { label: "Outdoors", emoji: "🥾" },
  viewpoint: { label: "Viewpoints", emoji: "🌄" },
  hotel: { label: "Stays", emoji: "🛏️" },
  other: { label: "Other", emoji: "📍" },
};

export const SOURCE_PLATFORMS = ["instagram", "tiktok", "google_maps", "web", "screenshot", "manual", "search"] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const PACES = ["relaxed", "balanced", "packed"] as const;
export const TRAVEL_MODES = ["walking", "transit", "driving", "cycling"] as const;
export const BUDGETS = ["budget", "moderate", "premium"] as const;
export const VISIBILITIES = ["private", "link", "public"] as const;
export const TRIP_ROLES = ["owner", "editor", "viewer"] as const;
export type TripRole = (typeof TRIP_ROLES)[number];
export const TRIP_STATUSES = ["draft", "planned", "archived"] as const;
/** Derived from dates for non-draft, non-archived trips. */
export type TripPhase = "draft" | "upcoming" | "active" | "completed" | "archived";

export const FREE_LIMITS = { aiGenerationsPerMonth: 5, importsPerMonth: 30 } as const;
export const PRO_LIMITS = { aiGenerationsPerMonth: 200, importsPerMonth: 1000 } as const;

// ---------------------------------------------------------------------------
// Input schemas (validated on server, reused by clients for forms)
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are supported");

/** Absolute http(s) URL, or a path to an image stored by the API in R2. */
const imageRef = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u) || u.startsWith("/api/media/"), "Invalid image URL");

export const placeInput = z.object({
  name: trimmed(200).min(1, "Name is required"),
  address: trimmed(400).optional().nullable(),
  city: trimmed(120).optional().nullable(),
  country: trimmed(120).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  category: z.enum(PLACE_CATEGORIES).default("other"),
  imageUrl: imageRef.optional().nullable(),
  sourceUrl: httpUrl.optional().nullable(),
  sourcePlatform: z.enum(SOURCE_PLATFORMS).default("manual"),
  sourceText: trimmed(4000).optional().nullable(),
  notes: trimmed(5000).optional().nullable(),
  externalId: trimmed(300).optional().nullable(),
  collectionIds: z.array(z.string()).max(50).optional(),
});
export type PlaceInput = z.infer<typeof placeInput>;

export const placeUpdate = placeInput
  .omit({ collectionIds: true, sourcePlatform: true })
  .partial()
  .extend({ visited: z.boolean().optional() });
export type PlaceUpdate = z.infer<typeof placeUpdate>;

export const collectionInput = z.object({
  name: trimmed(120).min(1, "Name is required"),
  description: trimmed(1000).optional().nullable(),
  coverImageUrl: z.string().max(2048).optional().nullable(),
  visibility: z.enum(VISIBILITIES).default("private"),
});
export const collectionUpdate = collectionInput.partial();

export const tripPreferences = z.object({
  interests: z.array(z.enum(PLACE_CATEGORIES)).max(20).default([]),
  budget: z.enum(BUDGETS).optional(),
  pace: z.enum(PACES).default("balanced"),
  travelMode: z.enum(TRAVEL_MODES).default("walking"),
  startLocation: trimmed(300).optional().nullable(),
  accessibility: trimmed(500).optional().nullable(),
  notes: trimmed(3000).optional().nullable(),
});
export type TripPreferences = z.infer<typeof tripPreferences>;

export const tripInput = z
  .object({
    name: trimmed(120).min(1, "Trip name is required"),
    destination: trimmed(200).min(1, "Destination is required"),
    destinationLat: z.number().min(-90).max(90).optional().nullable(),
    destinationLng: z.number().min(-180).max(180).optional().nullable(),
    extraDestinations: z.array(trimmed(200)).max(10).default([]),
    startDate: isoDate,
    endDate: isoDate,
    coverImageUrl: z.string().max(2048).optional().nullable(),
    status: z.enum(TRIP_STATUSES).default("planned"),
    preferences: tripPreferences.default({ interests: [], pace: "balanced", travelMode: "walking" }),
    placeIds: z.array(z.string()).max(300).default([]),
    mustVisitPlaceIds: z.array(z.string()).max(100).default([]),
    collectionIds: z.array(z.string()).max(20).default([]),
  })
  .refine((t) => t.endDate >= t.startDate, { message: "End date must be on or after start date", path: ["endDate"] })
  .refine((t) => daysBetween(t.startDate, t.endDate) <= 60, { message: "Trips can be at most 60 days", path: ["endDate"] });
export type TripInput = z.infer<typeof tripInput>;

export const tripUpdate = z
  .object({
    name: trimmed(120).min(1),
    destination: trimmed(200).min(1),
    destinationLat: z.number().min(-90).max(90).nullable(),
    destinationLng: z.number().min(-180).max(180).nullable(),
    extraDestinations: z.array(trimmed(200)).max(10),
    startDate: isoDate,
    endDate: isoDate,
    coverImageUrl: z.string().max(2048).nullable(),
    status: z.enum(TRIP_STATUSES),
    preferences: tripPreferences,
    visibility: z.enum(VISIBILITIES),
  })
  .partial();

export const itineraryItemInput = z
  .object({
    dayId: z.string(),
    placeId: z.string().optional().nullable(),
    title: trimmed(200).optional().nullable(),
    startTime: hhmm.optional().nullable(),
    durationMinutes: z.number().int().min(0).max(24 * 60).optional().nullable(),
    notes: trimmed(2000).optional().nullable(),
    position: z.number().int().min(0).optional(),
  })
  .refine((i) => i.placeId || i.title, { message: "Choose a place or enter a title" });

export const itineraryItemUpdate = z
  .object({
    dayId: z.string(),
    position: z.number().int().min(0),
    startTime: hhmm.nullable(),
    durationMinutes: z.number().int().min(0).max(24 * 60).nullable(),
    notes: trimmed(2000).nullable(),
    title: trimmed(200).nullable(),
  })
  .partial();

export const dayUpdate = z.object({ title: trimmed(120).nullable(), notes: trimmed(2000).nullable() }).partial();

export const reorderInput = z.object({ dayId: z.string(), itemIds: z.array(z.string()).max(200) });

export const generateInput = z.object({
  scope: z.enum(["trip", "day"]).default("trip"),
  dayId: z.string().optional(),
  instructions: trimmed(1000).optional(),
});

export const importInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: httpUrl }),
  z.object({ type: z.literal("text"), text: trimmed(2000).min(2) }),
]);

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});

// Onboarding quiz answers. They personalise Explore and the AI itinerary prompt.
export const TRAVEL_FREQUENCIES = ["few_times_year", "once_year", "every_couple_years", "rarely_dreaming"] as const;
export const TRAVEL_PURPOSES = ["relax", "explore_cities", "food", "adventure", "culture", "nightlife", "family", "romance", "work"] as const;
export const COMPANIONS = ["solo", "partner", "friends", "family", "mixed"] as const;
export const INSPIRATION_SOURCES = ["tiktok", "instagram", "youtube", "google_maps", "blogs", "friends", "pinterest", "screenshots"] as const;
export const PAIN_POINTS = ["scattered", "forget", "too_long", "routing", "group", "overwhelmed", "missing_gems"] as const;
export const PLANNING_TIMES = ["hours", "days", "weeks", "dont_plan"] as const;

export const travelProfile = z.object({
  hasUpcomingTrip: z.boolean().optional(),
  upcomingDestination: trimmed(120).optional(),
  upcomingWhen: trimmed(40).optional(),
  frequency: z.enum(TRAVEL_FREQUENCIES).optional(),
  purposes: z.array(z.enum(TRAVEL_PURPOSES)).max(10).optional(),
  companions: z.enum(COMPANIONS).optional(),
  budget: z.enum(BUDGETS).optional(),
  inspirationSources: z.array(z.enum(INSPIRATION_SOURCES)).max(10).optional(),
  painPoints: z.array(z.enum(PAIN_POINTS)).max(10).optional(),
  planningTime: z.enum(PLANNING_TIMES).optional(),
  tripsGoal: z.number().int().min(0).max(24).optional(),
  dreamDestinations: z.array(trimmed(80)).max(10).optional(),
});
export type TravelProfile = z.infer<typeof travelProfile>;

export const userPreferences = z.object({
  travelProfile: travelProfile.default({}),
  interests: z.array(z.enum(PLACE_CATEGORIES)).max(20).default([]),
  pace: z.enum(PACES).default("balanced"),
  travelMode: z.enum(TRAVEL_MODES).default("walking"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  timeFormat: z.enum(["24h", "12h"]).default("24h"),
  notifications: z
    .object({
      tripReminders: z.boolean().default(true),
      collaboration: z.boolean().default(true),
      imports: z.boolean().default(true),
      itinerary: z.boolean().default(true),
    })
    .default({ tripReminders: true, collaboration: true, imports: true, itinerary: true }),
  analyticsOptIn: z.boolean().default(true),
});
export type UserPreferences = z.infer<typeof userPreferences>;

export const profileUpdate = z.object({
  onboardingStep: z.number().int().min(0).max(10).optional(),
  onboarded: z.boolean().optional(),
  preferences: userPreferences.partial().optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface Place {
  id: string;
  userId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  category: PlaceCategory;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourcePlatform: SourcePlatform;
  sourceText: string | null;
  notes: string | null;
  aiDescription: string | null;
  externalId: string | null;
  visited: boolean;
  createdAt: string;
  updatedAt: string;
  collectionIds?: string[];
  tripIds?: string[];
}

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: (typeof VISIBILITIES)[number];
  placeCount: number;
  previewImages: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface Trip {
  id: string;
  ownerId: string;
  name: string;
  destination: string;
  destinationLat: number | null;
  destinationLng: number | null;
  extraDestinations: string[];
  startDate: string;
  endDate: string;
  coverImageUrl: string | null;
  status: (typeof TRIP_STATUSES)[number];
  phase: TripPhase;
  visibility: (typeof VISIBILITIES)[number];
  preferences: TripPreferences;
  role: TripRole;
  placeCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TravelLeg {
  distanceKm: number;
  minutes: number;
  mode: (typeof TRAVEL_MODES)[number];
  /** "routing" when from a routing service, "estimate" when straight-line based. */
  source: "routing" | "estimate";
}

export interface ItineraryItem {
  id: string;
  dayId: string;
  placeId: string | null;
  place: Pick<Place, "id" | "name" | "lat" | "lng" | "category" | "imageUrl" | "address" | "city"> | null;
  title: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  position: number;
  aiGenerated: boolean;
  travelToNext: TravelLeg | null;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string;
  title: string | null;
  notes: string | null;
  warnings: string[];
  items: ItineraryItem[];
}

export interface ProposalItem {
  placeId: string | null;
  candidate: { name: string; address?: string | null; lat?: number | null; lng?: number | null; category?: PlaceCategory } | null;
  title: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  travelToNext: TravelLeg | null;
}
export interface ProposalDay {
  dayNumber: number;
  title: string | null;
  notes: string | null;
  warnings: string[];
  items: ProposalItem[];
}
export interface ItineraryProposal {
  id: string;
  tripId: string;
  scope: "trip" | "day";
  dayNumber: number | null;
  status: "queued" | "running" | "ready" | "failed" | "accepted" | "discarded";
  error: string | null;
  days: ProposalDay[];
  warnings: string[];
  createdAt: string;
}

export interface ImportCandidate {
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  category: PlaceCategory;
  externalId: string | null;
  confidence: number;
  reason: string | null;
}

export interface ImportJob {
  id: string;
  type: "url" | "screenshot" | "text";
  input: string;
  platform: SourcePlatform;
  status: "queued" | "processing" | "needs_review" | "completed" | "failed";
  title: string | null;
  caption: string | null;
  imageUrl: string | null;
  candidates: ImportCandidate[];
  error: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: TripRole;
}

export interface Invite {
  id: string;
  tripId: string;
  email: string;
  role: TripRole;
  status: "pending" | "accepted" | "declined" | "revoked";
  createdAt: string;
  tripName?: string;
  invitedByName?: string;
}

export interface ShareLink {
  id: string;
  token: string;
  resourceType: "trip" | "collection";
  resourceId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  onboarded: boolean;
  onboardingStep: number;
  preferences: UserPreferences;
  plan: "free" | "pro";
  subscription: { status: string; provider: string; currentPeriodEnd: string | null } | null;
  usage: { aiGenerations: number; imports: number; limits: { aiGenerationsPerMonth: number; importsPerMonth: number } };
}

export interface GeoResult {
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  category: PlaceCategory;
  externalId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function tripPhase(t: { status: string; startDate: string; endDate: string }, today = new Date().toISOString().slice(0, 10)): TripPhase {
  if (t.status === "draft") return "draft";
  if (t.status === "archived") return "archived";
  if (today < t.startDate) return "upcoming";
  if (today > t.endDate) return "completed";
  return "active";
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function mapsUrl(p: { name: string; lat: number | null; lng: number | null; address?: string | null }): string {
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(", "))}`;
}

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, like, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { PLACE_CATEGORIES, CATEGORY_META, type PlaceCategory } from "@wayfare/shared";
import { getDb, schema } from "../db";
import type { AppEnv } from "../env";
import { searchPlaces } from "../lib/geo";
import { toCollection, toTrip } from "../lib/serialize";
import { currentUser } from "../middleware/auth";
import { collectionStats } from "./collections";
import { tripStats } from "./trips";

export const exploreRoutes = new Hono<AppEnv>();

/** Curated starting points; the app doesn't claim these are rankings. */
const DESTINATIONS = [
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, emoji: "🗼", tags: ["food", "architecture", "shopping"] },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522, emoji: "🥐", tags: ["museum", "food", "architecture"] },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, emoji: "🚋", tags: ["viewpoint", "food", "history"] },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332, emoji: "🌮", tags: ["food", "museum", "history"] },
  { name: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784, emoji: "🕌", tags: ["history", "food", "shopping"] },
  { name: "Bali", country: "Indonesia", lat: -8.3405, lng: 115.092, emoji: "🌴", tags: ["beach", "nature", "cafe"] },
  { name: "New York", country: "USA", lat: 40.7128, lng: -74.006, emoji: "🗽", tags: ["food", "museum", "nightlife"] },
  { name: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241, emoji: "⛰️", tags: ["outdoors", "beach", "viewpoint"] },
  { name: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681, emoji: "⛩️", tags: ["history", "nature", "food"] },
  { name: "Dhaka", country: "Bangladesh", lat: 23.8103, lng: 90.4125, emoji: "🛺", tags: ["food", "history", "shopping"] },
  { name: "Reykjavík", country: "Iceland", lat: 64.1466, lng: -21.9426, emoji: "🌋", tags: ["nature", "outdoors", "viewpoint"] },
  { name: "Marrakech", country: "Morocco", lat: 31.6295, lng: -7.9811, emoji: "🕌", tags: ["shopping", "architecture", "food"] },
];

exploreRoutes.get("/destinations", (c) => c.json(DESTINATIONS));

exploreRoutes.get("/categories", (c) => c.json(PLACE_CATEGORIES.filter((k) => k !== "other").map((k) => ({ id: k, ...CATEGORY_META[k] }))));

const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(PLACE_CATEGORIES).optional(),
  near: z.string().max(200).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** Place search (by name, or category within a destination). */
exploreRoutes.get("/search", zValidator("query", searchQuery), async (c) => {
  currentUser(c);
  const { q, category, near, lat, lng } = c.req.valid("query");
  const categoryWord: Partial<Record<PlaceCategory, string>> = { food: "restaurant", cafe: "cafe", bar: "bar", beach: "beach", museum: "museum", nature: "park", hotel: "hotel" };
  const text = [q || (category ? (categoryWord[category] ?? CATEGORY_META[category].label) : ""), near && `in ${near}`].filter(Boolean).join(" ");
  if (!text) return c.json([]);
  const results = await searchPlaces(c.env, text, { near: lat != null && lng != null ? { lat, lng } : null, limit: 12 });
  return c.json(category ? results.filter((r) => r.category === category || r.category === "other") : results);
});

exploreRoutes.get("/collections", zValidator("query", z.object({ q: z.string().max(100).optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const { q } = c.req.valid("query");
  const conds = [eq(schema.collections.visibility, "public")];
  if (q) conds.push(or(like(schema.collections.name, `%${q}%`), like(schema.collections.description, `%${q}%`))!);
  const rows = await db
    .select({ col: schema.collections, ownerName: schema.user.name })
    .from(schema.collections)
    .innerJoin(schema.user, eq(schema.user.id, schema.collections.ownerId))
    .where(and(...conds))
    .orderBy(desc(schema.collections.updatedAt))
    .limit(30);
  const stats = await collectionStats(db, rows.map((r) => r.col.id));
  return c.json(rows.map((r) => ({ ...toCollection(r.col, stats.get(r.col.id)!), ownerName: r.ownerName })).filter((x) => x.placeCount > 0));
});

exploreRoutes.get("/trips", zValidator("query", z.object({ q: z.string().max(100).optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const { q } = c.req.valid("query");
  const conds = [eq(schema.trips.visibility, "public")];
  if (q) conds.push(or(like(schema.trips.name, `%${q}%`), like(schema.trips.destination, `%${q}%`))!);
  const rows = await db
    .select({ trip: schema.trips, ownerName: schema.user.name })
    .from(schema.trips)
    .innerJoin(schema.user, eq(schema.user.id, schema.trips.ownerId))
    .where(and(...conds))
    .orderBy(desc(schema.trips.updatedAt))
    .limit(30);
  const stats = await tripStats(db, rows.map((r) => r.trip.id));
  return c.json(
    rows.map((r) => {
      const t = toTrip(r.trip, { role: "viewer", ...stats.get(r.trip.id)! });
      return { ...t, preferences: { ...t.preferences, notes: null, accessibility: null, startLocation: null }, ownerName: r.ownerName };
    }),
  );
});

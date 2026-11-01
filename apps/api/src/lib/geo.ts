import { haversineKm, type GeoResult, type PlaceCategory, type TravelLeg, TRAVEL_MODES } from "@wayfare/shared";
import type { Env } from "../env";
import { sha256Hex } from "./ids";

type Mode = (typeof TRAVEL_MODES)[number];

// ---------------------------------------------------------------------------
// Place search / geocoding. Google Places when a key is configured, otherwise OpenStreetMap Photon.
// Results are cached in KV for a week to keep third-party usage low.
// ---------------------------------------------------------------------------

export async function searchPlaces(
  env: Env,
  query: string,
  opts: { near?: { lat: number; lng: number } | null; limit?: number } = {},
): Promise<GeoResult[]> {
  const q = query.trim().slice(0, 300);
  if (q.length < 2) return [];
  const limit = opts.limit ?? 8;
  const cacheKey = `geo:${await sha256Hex(JSON.stringify([q.toLowerCase(), opts.near, limit, !!env.GOOGLE_PLACES_API_KEY]))}`;
  const cached = await env.KV.get<GeoResult[]>(cacheKey, "json");
  if (cached) return cached;

  let results: GeoResult[] = [];
  try {
    results = env.GOOGLE_PLACES_API_KEY ? await googleSearch(env.GOOGLE_PLACES_API_KEY, q, opts.near, limit) : await photonSearch(q, opts.near, limit);
  } catch (e) {
    console.error("geocode failed", e);
    return [];
  }
  await env.KV.put(cacheKey, JSON.stringify(results), { expirationTtl: 60 * 60 * 24 * 7 });
  return results;
}

async function googleSearch(key: string, q: string, near: { lat: number; lng: number } | null | undefined, limit: number): Promise<GeoResult[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery: q,
      pageSize: limit,
      ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`google places ${res.status}`);
  const data = (await res.json()) as { places?: any[] };
  return (data.places ?? []).map((p) => {
    const comp = (t: string) => p.addressComponents?.find((c: any) => c.types?.includes(t))?.longText ?? null;
    return {
      name: p.displayName?.text ?? q,
      address: p.formattedAddress ?? null,
      city: comp("locality") ?? comp("postal_town") ?? comp("administrative_area_level_1"),
      country: comp("country"),
      lat: p.location.latitude,
      lng: p.location.longitude,
      category: categoryFromTags(p.types ?? []),
      externalId: `google:${p.id}`,
    };
  });
}

async function photonSearch(q: string, near: { lat: number; lng: number } | null | undefined, limit: number): Promise<GeoResult[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  const res = await fetch(url, { headers: { "User-Agent": "Wayfare/1.0 (trip planner)" } });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: any[] };
  return (data.features ?? []).map((f) => {
    const p = f.properties ?? {};
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const city = p.city ?? p.town ?? p.village ?? p.county ?? p.state ?? null;
    return {
      name: p.name ?? street ?? q,
      address: [street, p.postcode, city, p.country].filter(Boolean).join(", ") || null,
      city,
      country: p.country ?? null,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      category: categoryFromTags([p.osm_key, p.osm_value].filter(Boolean)),
      externalId: `osm:${p.osm_type}${p.osm_id}`,
    };
  });
}

const CATEGORY_HINTS: [PlaceCategory, RegExp][] = [
  ["cafe", /cafe|coffee|bakery/],
  ["bar", /\bbar\b|pub|biergarten|wine/],
  ["food", /restaurant|food|meal|fast_food|ice_cream/],
  ["museum", /museum|gallery|art_gallery/],
  ["beach", /beach/],
  ["nature", /park|garden|natural|forest|wood|lake|national_park|zoo/],
  ["viewpoint", /viewpoint|observation|peak/],
  ["history", /historic|monument|memorial|castle|ruins|place_of_worship|church|temple|mosque|shrine/],
  ["architecture", /tower|building|bridge|landmark|attraction/],
  ["shopping", /shop|mall|market|store|clothing/],
  ["nightlife", /night_club|nightclub|casino/],
  ["outdoors", /hiking|trail|sport|stadium|climbing/],
  ["hotel", /hotel|lodging|hostel|guest_house|motel/],
];

export function categoryFromTags(tags: string[]): PlaceCategory {
  const s = tags.join(" ").toLowerCase();
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(s)) return cat;
  return "other";
}

// ---------------------------------------------------------------------------
// Travel legs. Uses an OSRM-compatible server when ROUTING_URL is set; otherwise a clearly-labelled
// straight-line estimate. Transit is always an estimate (no public transit routing is integrated).
// ---------------------------------------------------------------------------

const SPEED_KMH: Record<Mode, number> = { walking: 4.5, cycling: 14, driving: 30, transit: 20 };
const DETOUR = 1.3;

export function estimateLeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: Mode): TravelLeg {
  const km = haversineKm(a, b) * DETOUR;
  const minutes = Math.round((km / SPEED_KMH[mode]) * 60 + (mode === "transit" ? 8 : 0));
  return { distanceKm: Math.round(km * 10) / 10, minutes: Math.max(1, minutes), mode, source: "estimate" };
}

export async function legsFor(env: Env, points: { lat: number; lng: number }[], mode: Mode): Promise<TravelLeg[]> {
  if (points.length < 2) return [];
  const profile = { walking: "foot", cycling: "bike", driving: "driving", transit: null }[mode];
  if (env.ROUTING_URL && profile) {
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
      const res = await fetch(`${env.ROUTING_URL.replace(/\/$/, "")}/route/v1/${profile}/${coords}?overview=false`);
      if (res.ok) {
        const data = (await res.json()) as { routes?: { legs: { distance: number; duration: number }[] }[] };
        const legs = data.routes?.[0]?.legs;
        if (legs?.length === points.length - 1) {
          return legs.map((l) => ({ distanceKm: Math.round(l.distance / 100) / 10, minutes: Math.max(1, Math.round(l.duration / 60)), mode, source: "routing" as const }));
        }
      }
    } catch (e) {
      console.error("routing failed, falling back to estimate", e);
    }
  }
  return points.slice(1).map((p, i) => estimateLeg(points[i], p, mode));
}

/** Greedy nearest-neighbour ordering, keeping the first stop fixed. Stops without coords keep their relative order at the end. */
export function orderByProximity<T extends { lat: number | null; lng: number | null }>(stops: T[], start?: { lat: number; lng: number } | null): T[] {
  const located = stops.filter((s) => s.lat != null && s.lng != null) as (T & { lat: number; lng: number })[];
  const unlocated = stops.filter((s) => s.lat == null || s.lng == null);
  if (located.length < 3 && !start) return [...located, ...unlocated];
  const out: (T & { lat: number; lng: number })[] = [];
  const remaining = [...located];
  let cur = start ?? remaining.shift()!;
  if (!start) out.push(cur as T & { lat: number; lng: number });
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) if (haversineKm(cur, remaining[i]) < haversineKm(cur, remaining[best])) best = i;
    cur = remaining.splice(best, 1)[0];
    out.push(cur as T & { lat: number; lng: number });
  }
  return [...out, ...unlocated];
}

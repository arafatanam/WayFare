import type { SourcePlatform } from "@wayfare/shared";

export interface ExtractedSource {
  platform: SourcePlatform;
  finalUrl: string;
  title: string | null;
  caption: string | null;
  imageUrl: string | null;
  text: string;
  /** Structured hints found directly in the source (Google Maps URL coordinates, schema.org JSON-LD). */
  hints: { name?: string; lat?: number; lng?: number; address?: string }[];
}

export function detectPlatform(url: string): SourcePlatform {
  const h = safeHost(url);
  if (/(^|\.)instagram\.com$|(^|\.)instagr\.am$/.test(h)) return "instagram";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/^maps\.app\.goo\.gl$|^goo\.gl$/.test(h) || (/(^|\.)google\.[a-z.]+$/.test(h) && url.includes("/maps"))) return "google_maps";
  return "web";
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Basic SSRF guard: only public http(s) hosts. */
export function assertFetchable(url: string) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) links are supported");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith("[")
  ) {
    throw new Error("That link points to a private address");
  }
}

const UA = "Mozilla/5.0 (compatible; WayfareBot/1.0; +https://wayfare.example/bot)";

export async function extractFromUrl(input: string): Promise<ExtractedSource> {
  assertFetchable(input);
  let url = input;
  let platform = detectPlatform(url);

  // Expand Google Maps short links so coordinates in the full URL can be read.
  if (platform === "google_maps" && /maps\.app\.goo\.gl|goo\.gl/.test(url)) {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA } });
    const loc = res.headers.get("location");
    if (loc) url = new URL(loc, url).toString();
  }

  const out: ExtractedSource = { platform, finalUrl: url, title: null, caption: null, imageUrl: null, text: "", hints: [] };

  if (platform === "google_maps") {
    const hint = parseGoogleMapsUrl(url);
    if (hint) out.hints.push(hint);
    out.title = hint?.name ?? null;
    return out;
  }

  if (platform === "tiktok") {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const o = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      out.title = o.author_name ? `TikTok by @${o.author_name}` : "TikTok video";
      out.caption = o.title ?? null;
      out.imageUrl = o.thumbnail_url ?? null;
      out.text = o.title ?? "";
      return out;
    }
  }

  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, redirect: "follow" });
  if (!res.ok) throw new Error(`The page could not be opened (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new Error("That link doesn't point to a web page");
  const html = (await readLimited(res, 1_500_000)).replace(/\u0000/g, "");
  out.finalUrl = res.url || url;
  platform = detectPlatform(out.finalUrl);
  out.platform = platform;

  const meta = (prop: string) =>
    decode(
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1] ??
        "",
    ) || null;

  out.title = meta("og:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "") ?? null;
  out.caption = meta("og:description") ?? meta("description");
  const img = meta("og:image");
  out.imageUrl = img && /^https?:\/\//.test(img) ? img : null;

  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJsonLd(JSON.parse(block[1]), out.hints);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  out.text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  return out;
}

export function parseGoogleMapsUrl(url: string): { name?: string; lat?: number; lng?: number } | null {
  try {
    const u = new URL(url);
    const hint: { name?: string; lat?: number; lng?: number } = {};
    const placeName = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
    if (placeName) hint.name = decodeURIComponent(placeName.replace(/\+/g, " "));
    const precise = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const m = precise ?? at;
    if (m) {
      hint.lat = Number(m[1]);
      hint.lng = Number(m[2]);
    }
    const q = u.searchParams.get("q") ?? u.searchParams.get("query");
    if (q) {
      const ll = q.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
      if (ll) {
        hint.lat = Number(ll[1]);
        hint.lng = Number(ll[2]);
      } else hint.name ??= q;
    }
    return hint.name || hint.lat != null ? hint : null;
  } catch {
    return null;
  }
}

const PLACE_TYPES = /Place|Restaurant|LocalBusiness|TouristAttraction|Museum|Hotel|LodgingBusiness|CafeOrCoffeeShop|BarOrPub|Park|Landmark|FoodEstablishment/;

function collectJsonLd(node: unknown, hints: ExtractedSource["hints"], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6 || hints.length > 20) return;
  if (Array.isArray(node)) return node.forEach((n) => collectJsonLd(n, hints, depth + 1));
  const n = node as Record<string, any>;
  const type = [n["@type"]].flat().join(" ");
  if (PLACE_TYPES.test(type) && typeof n.name === "string") {
    const addr = n.address;
    const address =
      typeof addr === "string" ? addr : addr ? [addr.streetAddress, addr.addressLocality, addr.addressCountry?.name ?? addr.addressCountry].filter(Boolean).join(", ") : undefined;
    const lat = Number(n.geo?.latitude);
    const lng = Number(n.geo?.longitude);
    hints.push({ name: n.name.slice(0, 200), address, ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}) });
  }
  for (const v of Object.values(n)) if (v && typeof v === "object") collectJsonLd(v, hints, depth + 1);
}

async function readLimited(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c.subarray(0, Math.min(c.byteLength, size - off)), off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

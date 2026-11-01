import { CATEGORY_META, type PlaceCategory, type TravelLeg, type TripPhase } from "@wayfare/shared";

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString(undefined, opts);
}

export function fmtRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameYear = s.getFullYear() === e.getFullYear();
  const a = s.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  const b = e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return start === end ? b : `${a} – ${b}`;
}

export function tripLength(start: string, end: string) {
  const n = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00:00").getTime() - today.getTime()) / 86_400_000);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtTime(hhmm: string | null, format: "24h" | "12h" = "24h") {
  if (!hhmm) return null;
  if (format === "24h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDuration(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function fmtLeg(leg: TravelLeg, units: "metric" | "imperial" = "metric") {
  const dist = units === "metric" ? `${leg.distanceKm} km` : `${(leg.distanceKm * 0.621).toFixed(1)} mi`;
  const verb = { walking: "walk", cycling: "ride", driving: "drive", transit: "by transit" }[leg.mode];
  return `${leg.source === "estimate" ? "~" : ""}${leg.minutes} min ${verb} · ${dist}`;
}

export const catEmoji = (c: PlaceCategory) => CATEGORY_META[c]?.emoji ?? "📍";
export const catLabel = (c: PlaceCategory) => CATEGORY_META[c]?.label ?? "Other";

export const PHASE_LABEL: Record<TripPhase, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "On the road",
  completed: "Completed",
  archived: "Archived",
};

/** Deterministic gradient for places/trips without an image. */
export function gradientFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [168, 190, 24, 340, 260, 140, 210, 12];
  const a = hues[h % hues.length];
  const b = (a + 40) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 75% 60%))`;
}

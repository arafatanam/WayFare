import type { Collection, Place, Trip } from "@wayfare/shared";
import clsx from "clsx";
import { Check, Lock, Globe, Link2, MapPin, Users } from "lucide-react";
import { Link } from "react-router";
import { catEmoji, catLabel, daysUntil, fmtRange, PHASE_LABEL, tripLength } from "@/lib/format";
import { Badge, Cover } from "./ui";

export function PlaceCard({ place, onClick, selected, compact, action }: { place: Place; onClick?: () => void; selected?: boolean; compact?: boolean; action?: React.ReactNode }) {
  const body = (
    <>
      <div className={clsx("relative shrink-0 overflow-hidden", compact ? "size-16 rounded-xl" : "aspect-[4/3] w-full")}>
        <Cover src={place.imageUrl} seed={place.name} emoji={catEmoji(place.category)} className="size-full" />
        {place.visited && !compact && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
            <Check className="size-3" /> Visited
          </span>
        )}
      </div>
      <div className={clsx("min-w-0", compact ? "flex-1 py-0.5" : "p-3")}>
        <div className="truncate font-semibold">{place.name}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{[place.city, place.country].filter(Boolean).join(", ") || place.address || "No location yet"}</span>
        </div>
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge>
              {catEmoji(place.category)} {catLabel(place.category)}
            </Badge>
            {place.sourcePlatform !== "manual" && place.sourcePlatform !== "search" && <Badge tone="violet">{platformLabel(place.sourcePlatform)}</Badge>}
          </div>
        )}
      </div>
    </>
  );
  const cls = clsx(
    "group card overflow-hidden text-left transition hover:shadow-md",
    compact ? "flex items-center gap-3 p-2" : "flex flex-col",
    selected && "ring-2 ring-sun-500",
  );
  if (onClick) {
    return (
      <div className={clsx(cls, "relative")}>
        <button className={clsx("min-w-0 flex-1 text-left", compact ? "flex items-center gap-3" : "flex flex-col")} onClick={onClick}>
          {body}
        </button>
        {action}
      </div>
    );
  }
  return (
    <div className={clsx(cls, "relative")}>
      <Link to={`/places/${place.id}`} className={clsx("min-w-0 flex-1", compact ? "flex items-center gap-3" : "flex flex-col")}>
        {body}
      </Link>
      {action}
    </div>
  );
}

export function platformLabel(p: string) {
  return { instagram: "Instagram", tiktok: "TikTok", google_maps: "Google Maps", web: "Web", screenshot: "Screenshot", manual: "Manual", search: "Search" }[p] ?? p;
}

export function VisibilityIcon({ v, className = "size-3.5" }: { v: string; className?: string }) {
  return v === "public" ? <Globe className={className} /> : v === "link" ? <Link2 className={className} /> : <Lock className={className} />;
}

export function CollectionCard({ c, to }: { c: Collection; to?: string }) {
  const imgs = c.coverImageUrl ? [c.coverImageUrl] : c.previewImages;
  return (
    <Link to={to ?? `/collections/${c.id}`} className="group card flex flex-col overflow-hidden transition hover:shadow-md">
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-slate-100">
        {imgs.length >= 3 ? (
          <>
            <Cover src={imgs[0]} seed={c.id + 0} className="row-span-2 size-full" />
            <Cover src={imgs[1]} seed={c.id + 1} className="size-full" />
            <Cover src={imgs[2]} seed={c.id + 2} className="size-full" />
          </>
        ) : (
          <Cover src={imgs[0]} seed={c.name} emoji="📚" className="col-span-2 row-span-2 size-full" />
        )}
      </div>
      <div className="p-3">
        <div className="truncate font-semibold">{c.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <VisibilityIcon v={c.visibility} className="size-3" />
          {c.placeCount} place{c.placeCount === 1 ? "" : "s"}
        </div>
      </div>
    </Link>
  );
}

export function TripCard({ trip, to }: { trip: Trip; to?: string }) {
  const until = daysUntil(trip.startDate);
  return (
    <Link to={to ?? `/trips/${trip.id}`} className="group card relative flex flex-col overflow-hidden transition hover:shadow-md">
      <div className="relative aspect-[16/9]">
        <Cover src={trip.coverImageUrl} seed={trip.destination} emoji="✈️" className="size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone={trip.phase === "active" ? "amber" : trip.phase === "draft" ? "slate" : "brand"}>{PHASE_LABEL[trip.phase]}</Badge>
          {trip.role !== "owner" && <Badge tone="violet">Shared · {trip.role}</Badge>}
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <div className="truncate font-display text-xl font-bold">{trip.name}</div>
          <div className="truncate text-xs opacity-90">{trip.destination}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-3 text-xs text-muted">
        <span>
          {fmtRange(trip.startDate, trip.endDate)} · {tripLength(trip.startDate, trip.endDate)}
        </span>
        <span className="flex items-center gap-2">
          {trip.phase === "upcoming" && until <= 30 && <span className="font-semibold text-brand-700">in {until}d</span>}
          {trip.memberCount > 1 && (
            <span className="flex items-center gap-0.5">
              <Users className="size-3" />
              {trip.memberCount}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function CardGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton aspect-[4/5]" />
      ))}
    </div>
  );
}

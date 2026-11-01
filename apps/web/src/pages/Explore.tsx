import { PLACE_CATEGORIES, type Collection, type GeoResult, type PlaceCategory, type Trip } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bookmark, Check, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CollectionCard, TripCard } from "@/components/cards";
import { MapView } from "@/components/MapView";
import { useDebounced } from "@/components/PlaceForm";
import { EmptyState, Spinner } from "@/components/ui";
import { get, qs } from "@/lib/api";
import { catEmoji, catLabel } from "@/lib/format";
import { useCreatePlace } from "@/lib/queries";

interface Destination {
  name: string;
  country: string;
  lat: number;
  lng: number;
  emoji: string;
  tags: PlaceCategory[];
}

export function Explore() {
  const [q, setQ] = useState("");
  const [dest, setDest] = useState<Destination | null>(null);
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const debounced = useDebounced(q.trim(), 400);

  const { data: destinations } = useQuery({ queryKey: ["explore", "destinations"], queryFn: () => get<Destination[]>("/explore/destinations"), staleTime: Infinity });
  const { data: publicCollections } = useQuery({ queryKey: ["explore", "collections"], queryFn: () => get<(Collection & { ownerName: string })[]>("/explore/collections") });
  const { data: publicTrips } = useQuery({ queryKey: ["explore", "trips"], queryFn: () => get<(Trip & { ownerName: string })[]>("/explore/trips") });

  const searching = debounced.length >= 2 || (!!dest && !!category);
  const { data: results, isFetching } = useQuery({
    queryKey: ["explore", "search", debounced, dest?.name, category],
    queryFn: () => get<GeoResult[]>(`/explore/search${qs({ q: debounced || undefined, category: category ?? undefined, near: dest?.name, lat: dest?.lat, lng: dest?.lng })}`),
    enabled: searching,
  });

  return (
    <div className="page space-y-8">
      <div>
        <h1 className="page-title">Explore</h1>
        <p className="mt-1 text-muted">Find places to save, or borrow ideas from public collections and itineraries.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <input className="input h-12 pl-11 text-base" placeholder={dest ? `Search in ${dest.name}…` : "Search any place, landmark or restaurant"} value={q} onChange={(e) => setQ(e.target.value)} />
        {isFetching && <Spinner className="absolute right-4 top-1/2 size-5 -translate-y-1/2" />}
      </div>

      <section>
        <h2 className="section-title mb-3">Destinations</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
          {destinations?.map((d) => (
            <button
              key={d.name}
              onClick={() => {
                setDest(dest?.name === d.name ? null : d);
                setCategory(category ?? d.tags[0]);
              }}
              className={clsx("chip h-10 px-4 text-sm", dest?.name === d.name && "chip-active")}
            >
              <span className="text-base">{d.emoji}</span> {d.name}
            </button>
          ))}
        </div>
        {dest && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PLACE_CATEGORIES.filter((c) => c !== "other").map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={clsx("chip", category === c && "chip-active")}>
                {catEmoji(c)} {catLabel(c)}
              </button>
            ))}
          </div>
        )}
      </section>

      {searching && (
        <section>
          <h2 className="section-title mb-3">{dest && !debounced ? `${category ? catLabel(category) : "Places"} in ${dest.name}` : "Results"}</h2>
          {results && results.length === 0 && <EmptyState title="No places found" body="Try another search term or category." />}
          {results && results.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <ul className="space-y-2">
                {results.map((r) => (
                  <ResultRow key={r.externalId} r={r} />
                ))}
              </ul>
              <MapView className="hidden h-[480px] lg:block" markers={results.map((r) => ({ id: r.externalId, lat: r.lat, lng: r.lng, label: r.name, emoji: catEmoji(r.category) }))} />
            </div>
          )}
        </section>
      )}

      {publicCollections && publicCollections.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Public collections</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {publicCollections.map((c) => (
              <div key={c.id}>
                <CollectionCard c={c} to={`/p/collections/${c.id}`} />
                <p className="mt-1 px-1 text-xs text-muted">by {c.ownerName}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {publicTrips && publicTrips.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Public itineraries</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicTrips.map((t) => (
              <div key={t.id}>
                <TripCard trip={t} to={`/p/trips/${t.id}`} />
                <p className="mt-1 px-1 text-xs text-muted">by {t.ownerName}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!searching && !publicCollections?.length && !publicTrips?.length && (
        <p className="text-sm text-muted">
          Nothing public yet. Make one of your collections public from its page to share it here — or{" "}
          <Link to="/saved" className="font-semibold text-brand-700">
            browse your saved places
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function ResultRow({ r }: { r: GeoResult }) {
  const create = useCreatePlace();
  const [saved, setSaved] = useState(false);
  return (
    <li className="card flex items-center gap-3 p-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">{catEmoji(r.category)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{r.name}</span>
        <span className="block truncate text-xs text-muted">{r.address ?? [r.city, r.country].filter(Boolean).join(", ")}</span>
      </span>
      <button
        className={saved ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        disabled={saved || create.isPending}
        onClick={async () => {
          await create.mutateAsync({ ...r, sourcePlatform: "search" });
          setSaved(true);
          toast.success(`Saved ${r.name}`);
        }}
      >
        {saved ? <Check className="size-3.5" /> : <Bookmark className="size-3.5" />} {saved ? "Saved" : "Save"}
      </button>
    </li>
  );
}

import type { Collection, ItineraryDay, Place, Trip } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import { Copy, MapPin } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/Layout";
import { MapView } from "@/components/MapView";
import { Cover, ErrorState, PageLoader, Segmented } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { catEmoji, fmtDate, fmtDuration, fmtRange, tripLength } from "@/lib/format";

type View =
  | { kind: "trip"; trip: Trip; ownerName: string; places: Place[]; days: ItineraryDay[] }
  | { kind: "collection"; collection: Collection; ownerName: string; places: Place[] };

/** Read-only view for share links (/s/:token) and public content (/p/trips/:id, /p/collections/:id). */
export function SharedView() {
  const { token, kind, id } = useParams();
  const path = token ? `/public/s/${token}` : `/public/${kind}/${id}`;
  const { data, isLoading, error } = useQuery({ queryKey: ["public", path], queryFn: () => get<View>(path), retry: false });
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    if (!session) return navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
    setCopying(true);
    try {
      const body = token ? { token } : kind === "trips" ? { tripId: id } : { collectionId: id };
      const res = await post<{ type: string; trip?: { id: string }; collectionId?: string }>("/copy", body);
      toast.success("Copied to your account");
      navigate(res.trip ? `/trips/${res.trip.id}` : `/collections/${res.collectionId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          {session ? (
            <Link to="/" className="btn-ghost btn-sm">
              Open app
            </Link>
          ) : (
            <Link to="/sign-up" className="btn-primary btn-sm">
              Sign up free
            </Link>
          )}
        </div>
      </header>
      {isLoading ? (
        <PageLoader />
      ) : error || !data ? (
        <div className="mx-auto max-w-lg px-4 py-16">
          <ErrorState error={new Error("This link isn't active anymore, or the content is private.")} />
        </div>
      ) : (
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-16">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Shared {data.kind} · by {data.ownerName} · view only
          </div>
          {data.kind === "trip" ? <TripView v={data} /> : <CollectionView v={data} />}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-slate-600">Like this {data.kind}? Copy it into your own account and make it yours.</p>
            <button className="btn-primary" onClick={copy} disabled={copying}>
              <Copy className="size-4" /> {session ? "Copy to my account" : "Sign up to copy"}
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function TripView({ v }: { v: Extract<View, { kind: "trip" }> }) {
  const [tab, setTab] = useState<"days" | "map">("days");
  const located = v.places.filter((p) => p.lat != null);
  return (
    <>
      <div className="card overflow-hidden">
        <div className="relative h-48">
          <Cover src={v.trip.coverImageUrl} seed={v.trip.destination} emoji="✈️" className="size-full text-6xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-4 left-5 text-white">
            <h1 className="font-display text-3xl font-bold">{v.trip.name}</h1>
            <p className="text-sm opacity-90">
              {v.trip.destination} · {fmtRange(v.trip.startDate, v.trip.endDate)} · {tripLength(v.trip.startDate, v.trip.endDate)}
            </p>
          </div>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: "days", label: "Itinerary" }, { value: "map", label: "Map" }]} />
      {tab === "map" ? (
        <MapView className="h-[480px]" markers={located.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.name, emoji: catEmoji(p.category) }))} />
      ) : (
        <div className="space-y-6">
          {v.days.map((d) => (
            <section key={d.id}>
              <h2 className="font-semibold">
                Day {d.dayNumber} · {fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" })}
                {d.title && <span className="font-normal text-muted"> — {d.title}</span>}
              </h2>
              {d.items.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Free day.</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {d.items.map((i, n) => (
                    <li key={i.id} className="card flex items-center gap-3 p-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{n + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.place?.name ?? i.title}</span>
                        <span className="block text-xs text-muted">
                          {[i.startTime, fmtDuration(i.durationMinutes), i.place?.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function CollectionView({ v }: { v: Extract<View, { kind: "collection" }> }) {
  const located = v.places.filter((p) => p.lat != null);
  return (
    <>
      <div>
        <h1 className="page-title">{v.collection.name}</h1>
        {v.collection.description && <p className="mt-2 text-slate-600">{v.collection.description}</p>}
      </div>
      {located.length > 0 && <MapView className="h-80" markers={located.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.name, emoji: catEmoji(p.category) }))} />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {v.places.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 p-3">
            <Cover src={p.imageUrl} seed={p.name} emoji={catEmoji(p.category)} className="size-14 shrink-0 rounded-xl text-xl" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="flex items-center gap-1 truncate text-xs text-muted">
                <MapPin className="size-3" /> {[p.city, p.country].filter(Boolean).join(", ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

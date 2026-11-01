import { ArrowRight, Bookmark, Camera, Link2, Loader2, MapPin, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { CollectionCard, PlaceCard, TripCard } from "@/components/cards";
import { useImportDialog } from "@/components/ImportDialog";
import { EmptyState, ErrorState } from "@/components/ui";
import { daysUntil, fmtRange } from "@/lib/format";
import { useHome, useMe } from "@/lib/queries";

export function HomePage() {
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useHome();
  const openImport = useImportDialog();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (error) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const isEmpty = data && data.counts.places === 0 && data.counts.trips === 0 && data.counts.collections === 0;
  const next = data?.upcomingTrips[0];
  const continueTrip = data?.upcomingTrips.find((t) => t.id === data.continueTripId);

  return (
    <div className="page space-y-10">
      <div>
        <p className="text-sm text-muted">{greeting}{me ? `, ${me.name.split(" ")[0]}` : ""}</p>
        <h1 className="page-title mt-1">{next ? (daysUntil(next.startDate) > 0 ? `${daysUntil(next.startDate)} days until ${next.destination}` : `Enjoy ${next.destination}!`) : "Where to next?"}</h1>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction icon={<Link2 className="size-5" />} label="Paste a link" onClick={() => openImport({ tab: "link" })} />
        <QuickAction icon={<Camera className="size-5" />} label="Upload screenshot" onClick={() => openImport({ tab: "screenshot" })} />
        <QuickAction icon={<MapPin className="size-5" />} label="Search a place" onClick={() => openImport({ tab: "search" })} />
        <QuickAction icon={<Plus className="size-5" />} label="New trip" to="/trips/new" />
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="skeleton h-40" />
          <div className="skeleton h-56" />
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="Let's start your first plan"
          body="Save a place you saw online, organize places into a collection, or jump straight into creating a trip."
          action={
            <>
              <button className="btn-primary" onClick={() => openImport()}>
                <Bookmark className="size-4" /> Save a place
              </button>
              <Link to="/trips/new" className="btn-secondary">
                Create a trip
              </Link>
            </>
          }
        />
      )}

      {data && data.pendingImports.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Imports</h2>
          <div className="space-y-2">
            {data.pendingImports.map((j) => (
              <button key={j.id} onClick={() => openImport({ importId: j.id })} className="card flex w-full items-center gap-3 p-3 text-left hover:shadow-md">
                {["queued", "processing"].includes(j.status) ? (
                  <Loader2 className="size-5 animate-spin text-brand-700" />
                ) : j.status === "failed" ? (
                  <span className="text-lg">⚠️</span>
                ) : (
                  <span className="text-lg">✨</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{j.title ?? j.input}</span>
                  <span className="block text-xs text-muted">
                    {j.status === "needs_review" ? `${j.candidates.length} place(s) found — tap to review` : j.status === "failed" ? "Needs attention — add manually or retry" : "Finding places…"}
                  </span>
                </span>
                <ArrowRight className="size-4 text-slate-400" />
              </button>
            ))}
          </div>
        </section>
      )}

      {continueTrip && (
        <Link to={`/trips/${continueTrip.id}`} className="card flex items-center gap-4 bg-gradient-to-r from-brand-700 to-brand-600 p-5 text-white">
          <Sparkles className="size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">Continue planning</span>
            <span className="block truncate font-display text-xl font-bold">{continueTrip.name}</span>
            <span className="block text-sm opacity-90">
              {continueTrip.destination} · {fmtRange(continueTrip.startDate, continueTrip.endDate)}
            </span>
          </span>
          <ArrowRight className="size-5" />
        </Link>
      )}

      {data && data.upcomingTrips.length > 0 && (
        <Section title="Upcoming trips" to="/trips">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.upcomingTrips.slice(0, 3).map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </div>
        </Section>
      )}

      {data && data.recentPlaces.length > 0 && (
        <Section title="Recently saved" to="/saved">
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-4">
            {data.recentPlaces.map((p) => (
              <div key={p.id} className="w-44 shrink-0 snap-start sm:w-auto">
                <PlaceCard place={p} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {data && data.recentCollections.length > 0 && (
        <Section title="Your collections" to="/saved?tab=collections">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.recentCollections.slice(0, 4).map((c) => (
              <CollectionCard key={c.id} c={c} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
        <Link to={to} className="text-sm font-semibold text-brand-700 hover:underline">
          See all
        </Link>
      </div>
      {children}
    </section>
  );
}

function QuickAction({ icon, label, onClick, to }: { icon: React.ReactNode; label: string; onClick?: () => void; to?: string }) {
  const cls = "card flex flex-col items-start gap-3 p-4 text-left text-sm font-semibold transition hover:shadow-md hover:border-brand-200";
  const inner = (
    <>
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      {label}
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

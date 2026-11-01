import type { TripPhase } from "@wayfare/shared";
import clsx from "clsx";
import { Luggage, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CardGridSkeleton, TripCard } from "@/components/cards";
import { EmptyState, ErrorState } from "@/components/ui";
import { PHASE_LABEL } from "@/lib/format";
import { useInvites, useTrips } from "@/lib/queries";

const TABS: ("all" | TripPhase | "shared")[] = ["all", "upcoming", "active", "draft", "completed", "shared", "archived"];

export function Trips() {
  const { data, isLoading, error, refetch } = useTrips();
  const { data: inv } = useInvites();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");

  const list =
    data?.filter((t) => (tab === "all" ? t.phase !== "archived" : tab === "shared" ? t.role !== "owner" : t.phase === tab)) ?? [];
  // Upcoming/active first by date; completed most recent first.
  list.sort((a, b) => (tab === "completed" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)));
  const count = (t: (typeof TABS)[number]) =>
    data?.filter((x) => (t === "all" ? x.phase !== "archived" : t === "shared" ? x.role !== "owner" : x.phase === t)).length ?? 0;

  return (
    <div className="page space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="page-title">Trips</h1>
        <Link to="/trips/new" className="btn-primary">
          <Plus className="size-4" /> New trip
        </Link>
      </div>

      {inv && inv.invites.length > 0 && (
        <Link to="/invites" className="card flex items-center gap-3 border-brand-200 bg-brand-50 p-4">
          <Mail className="size-5 text-brand-700" />
          <span className="flex-1 text-sm font-medium text-brand-900">
            You have {inv.invites.length} trip invitation{inv.invites.length > 1 ? "s" : ""}
          </span>
          <span className="text-sm font-semibold text-brand-700">View</span>
        </Link>
      )}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("chip", tab === t && "chip-active")}>
            {t === "all" ? "All" : t === "shared" ? "Shared with me" : PHASE_LABEL[t]}
            {data && <span className="text-slate-400">{count(t)}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <CardGridSkeleton n={3} />
      ) : list.length === 0 ? (
        tab === "all" ? (
          <EmptyState
            icon={<Luggage className="size-6" />}
            title="No trips yet"
            body="Create a trip with a destination and dates, add your saved places, and let AI suggest a day-by-day plan."
            action={<Link to="/trips/new" className="btn-primary">Plan a trip</Link>}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted">No {tab === "shared" ? "shared" : PHASE_LABEL[tab as TripPhase].toLowerCase()} trips.</p>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </div>
  );
}

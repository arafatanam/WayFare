import { BUDGETS, PACES, TRAVEL_MODES, type TripPreferences } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, ArrowLeft, CalendarDays, Copy, ImagePlus, LogOut, MoreHorizontal, Pencil, Plus, Share2, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PlaceCard, VisibilityIcon } from "@/components/cards";
import { PlacePickerDialog } from "@/components/dialogs";
import { useImportDialog } from "@/components/ImportDialog";
import { ItineraryView } from "@/components/Itinerary";
import { MapView } from "@/components/MapView";
import { ShareDialog } from "@/components/ShareDialog";
import { Avatar, Badge, Cover, EmptyState, ErrorState, Field, Modal, PageLoader, Segmented, useConfirm } from "@/components/ui";
import { del, patch, post, upload } from "@/lib/api";
import { catEmoji, fmtRange, PHASE_LABEL, tripLength } from "@/lib/format";
import { useTripLive } from "@/lib/realtime";
import { keys, useAddPlacesToTrip, useMe, useTrip, useUpdateTrip, type TripDetail } from "@/lib/queries";

type Tab = "itinerary" | "places" | "map";
const DAY_COLORS = ["#0f766e", "#f97316", "#7c3aed", "#0284c7", "#db2777", "#65a30d", "#ca8a04", "#dc2626"];

export function TripPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "itinerary";
  const { data, isLoading, error, refetch } = useTrip(id);
  const { data: me } = useMe();
  const presence = useTripLive(data ? id : undefined);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <div className="page"><ErrorState error={error ?? new Error("Trip not found")} onRetry={refetch} /></div>;

  const { trip, members } = data;
  const canEdit = trip.role !== "viewer" && trip.status !== "archived";
  const others = presence.filter((p) => p.userId !== me?.id);

  return (
    <div className="page space-y-6">
      <Link to="/trips" className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" /> Trips
      </Link>

      <header className="card overflow-hidden">
        <div className="relative h-44 sm:h-56">
          <Cover src={trip.coverImageUrl} seed={trip.destination} emoji="✈️" className="size-full text-6xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {trip.role === "owner" && <CoverUpload tripId={id} />}
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={trip.phase === "active" ? "amber" : "brand"}>{PHASE_LABEL[trip.phase]}</Badge>
              <span className="flex items-center gap-1 text-xs opacity-90">
                <VisibilityIcon v={trip.visibility} className="size-3" /> {trip.visibility === "private" ? "Private" : trip.visibility === "link" ? "Link sharing on" : "Public"}
              </span>
              {trip.role !== "owner" && <Badge tone="violet">You're a {trip.role}</Badge>}
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{trip.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm opacity-90">
              <CalendarDays className="size-4" /> {trip.destination} · {fmtRange(trip.startDate, trip.endDate)} · {tripLength(trip.startDate, trip.endDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => (
              <div key={m.userId} className="relative">
                <Avatar name={m.name} image={m.image} size={32} />
                {presence.some((p) => p.userId === m.userId) && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-white" title="Viewing now" />}
              </div>
            ))}
          </div>
          {others.length > 0 && <span className="text-xs text-muted">{others.map((o) => o.name.split(" ")[0]).join(", ")} viewing now</span>}
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" onClick={() => setSharing(true)}>
              <Share2 className="size-4" /> Share
            </button>
            {canEdit && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </button>
            )}
            <TripMenu data={data} />
          </div>
        </div>
      </header>

      {trip.status === "archived" && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">This trip is archived and read-only. Unarchive it from the ⋯ menu to make changes.</p>}

      <Segmented
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: "itinerary", label: "Itinerary" },
          { value: "places", label: `Places (${data.places.length})` },
          { value: "map", label: "Map" },
        ]}
      />

      {tab === "itinerary" && <ItineraryView tripId={id} days={data.days} places={data.places} canEdit={canEdit} />}
      {tab === "places" && <PlacesTab data={data} canEdit={canEdit} />}
      {tab === "map" && <TripMap data={data} />}

      <ShareDialog open={sharing} onClose={() => setSharing(false)} type="trip" id={id} visibility={trip.visibility} members={members} isOwner={trip.role === "owner"} currentUserId={me?.id} />
      {editing && <EditTripDialog data={data} onClose={() => setEditing(false)} />}
    </div>
  );
}

function CoverUpload({ tripId }: { tripId: string }) {
  const update = useUpdateTrip(tripId);
  return (
    <label className="absolute right-3 top-3 btn-secondary btn-sm cursor-pointer bg-white/90">
      <ImagePlus className="size-3.5" /> Cover
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const { url } = await upload<{ url: string }>("/media", f);
            await update.mutateAsync({ coverImageUrl: url });
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </label>
  );
}

function TripMenu({ data }: { data: TripDetail }) {
  const { trip } = data;
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.trips });
    qc.invalidateQueries({ queryKey: keys.trip(trip.id) });
    qc.invalidateQueries({ queryKey: keys.home });
  };
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button
      className={clsx("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50", danger && "text-red-600")}
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      {icon} {label}
    </button>
  );
  return (
    <div className="relative">
      <button className="icon-btn border border-line" onClick={() => setOpen(!open)} aria-label="More actions" aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-line bg-white p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {item(<Copy className="size-4" />, "Duplicate trip", async () => {
            const t = await post<{ id: string }>(`/trips/${trip.id}/duplicate`);
            refresh();
            toast.success("Trip duplicated as a draft");
            navigate(`/trips/${t.id}`);
          })}
          {trip.role === "owner" &&
            item(<Archive className="size-4" />, trip.status === "archived" ? "Unarchive" : "Archive", async () => {
              await patch(`/trips/${trip.id}`, { status: trip.status === "archived" ? "planned" : "archived" });
              refresh();
            })}
          {trip.role === "owner"
            ? item(
                <Trash2 className="size-4" />,
                "Delete trip",
                async () => {
                  const ok = await confirm({
                    title: `Delete “${trip.name}”?`,
                    body: "The itinerary and sharing settings will be deleted for everyone. Your saved places stay in your library.",
                    confirmLabel: "Delete trip",
                    danger: true,
                  });
                  if (!ok) return;
                  await del(`/trips/${trip.id}`);
                  refresh();
                  toast.success("Trip deleted");
                  navigate("/trips", { replace: true });
                },
                true,
              )
            : item(
                <LogOut className="size-4" />,
                "Leave trip",
                async () => {
                  if (!(await confirm({ title: "Leave this trip?", body: "You'll lose access until you're invited again.", confirmLabel: "Leave", danger: true }))) return;
                  await del(`/trips/${trip.id}/members/${me?.id}`);
                  refresh();
                  navigate("/trips", { replace: true });
                },
                true,
              )}
        </div>
      )}
    </div>
  );
}

function PlacesTab({ data, canEdit }: { data: TripDetail; canEdit: boolean }) {
  const { trip, places, days } = data;
  const [picking, setPicking] = useState(false);
  const add = useAddPlacesToTrip(trip.id);
  const openImport = useImportDialog();
  const qc = useQueryClient();
  const dayOf = new Map<string, number>();
  for (const d of days) for (const i of d.items) if (i.placeId) dayOf.set(i.placeId, d.dayNumber);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.trip(trip.id) });

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" /> Add from library
          </button>
          <button className="btn-secondary" onClick={() => openImport({ tripId: trip.id })}>
            Save a new place
          </button>
        </div>
      )}
      {places.length === 0 ? (
        <EmptyState title="No places in this trip yet" body="Add places from your library or save new ones. The AI planner uses them to build your itinerary." />
      ) : (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id}>
              <PlaceCard
                place={p}
                compact
                action={
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    <span className="hidden text-xs text-muted sm:inline">{dayOf.has(p.id) ? `Day ${dayOf.get(p.id)}` : "Unscheduled"}</span>
                    {canEdit && (
                      <>
                        <button
                          className={clsx("icon-btn size-8", p.mustVisit && "text-sun-500")}
                          aria-pressed={p.mustVisit}
                          aria-label={`${p.mustVisit ? "Unmark" : "Mark"} ${p.name} as must-visit`}
                          onClick={async () => {
                            await patch(`/trips/${trip.id}/places/${p.id}`, { mustVisit: !p.mustVisit });
                            refresh();
                          }}
                        >
                          <Star className={clsx("size-4", p.mustVisit && "fill-current")} />
                        </button>
                        <button
                          className="icon-btn size-8 hover:text-red-600"
                          aria-label={`Remove ${p.name} from trip`}
                          onClick={async () => {
                            await del(`/trips/${trip.id}/places/${p.id}`);
                            toast.success("Removed from trip", { description: "It's still in your library." });
                            refresh();
                          }}
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <PlacePickerDialog open={picking} onClose={() => setPicking(false)} exclude={places.map((p) => p.id)} title="Add places to trip" onConfirm={(ids) => add.mutateAsync(ids)} />
    </div>
  );
}

function TripMap({ data }: { data: TripDetail }) {
  const [dayFilter, setDayFilter] = useState<number | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();
  const dayOf = new Map<string, number>();
  for (const d of data.days) for (const i of d.items) if (i.placeId) dayOf.set(i.placeId, d.dayNumber);
  const visible = data.places.filter((p) => p.lat != null && (dayFilter === "all" || dayOf.get(p.id) === dayFilter));
  const day = dayFilter === "all" ? null : data.days.find((d) => d.dayNumber === dayFilter);
  const route = day?.items.filter((i) => i.place?.lat != null).map((i) => [i.place!.lng!, i.place!.lat!] as [number, number]);

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none">
        <button className={clsx("chip", dayFilter === "all" && "chip-active")} onClick={() => setDayFilter("all")}>
          All places
        </button>
        {data.days.map((d) => (
          <button key={d.id} className={clsx("chip", dayFilter === d.dayNumber && "chip-active")} onClick={() => setDayFilter(d.dayNumber)}>
            <span className="size-2 rounded-full" style={{ background: DAY_COLORS[(d.dayNumber - 1) % DAY_COLORS.length] }} /> Day {d.dayNumber}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MapView
          className="h-[420px] lg:h-[560px]"
          center={data.trip.destinationLat != null ? { lat: data.trip.destinationLat, lng: data.trip.destinationLng! } : null}
          markers={visible.map((p) => {
            const dn = dayOf.get(p.id);
            return { id: p.id, lat: p.lat!, lng: p.lng!, label: p.name, emoji: catEmoji(p.category), color: dn ? DAY_COLORS[(dn - 1) % DAY_COLORS.length] : "#94a3b8" };
          })}
          selectedId={selected}
          onSelect={setSelected}
          route={route}
        />
        <ul className="max-h-[560px] space-y-2 overflow-y-auto">
          {visible.map((p) => (
            <li key={p.id}>
              <PlaceCard place={p} compact selected={selected === p.id} onClick={() => (selected === p.id ? navigate(`/places/${p.id}`) : setSelected(p.id))} />
            </li>
          ))}
          {data.places.some((p) => p.lat == null) && <li className="text-xs text-muted">Places without a location aren't shown on the map.</li>}
        </ul>
      </div>
    </div>
  );
}

function EditTripDialog({ data, onClose }: { data: TripDetail; onClose: () => void }) {
  const { trip } = data;
  const update = useUpdateTrip(trip.id);
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, status: trip.status });
  const [prefs, setPrefs] = useState<TripPreferences>(trip.preferences);
  const error = form.endDate < form.startDate ? "End date must be on or after the start date" : null;

  const save = async () => {
    const newLen = (Date.parse(form.endDate) - Date.parse(form.startDate)) / 86_400_000 + 1;
    const dropped = data.days.slice(newLen).filter((d) => d.items.length).length;
    if (dropped && !(await confirm({ title: "Shorten trip?", body: `Activities from ${dropped} removed day(s) will be moved to the new last day.`, confirmLabel: "Continue" }))) return;
    await update.mutateAsync({ ...form, preferences: prefs });
    toast.success("Trip updated");
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit trip"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!!error || !form.name.trim() || update.isPending} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Trip name">
          <input className="input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Destination">
          <input className="input" value={form.destination} maxLength={200} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End date" error={error}>
            <input className="input" type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        {trip.role === "owner" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-700" checked={form.status === "draft"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "draft" : "planned" })} />
            Draft (dates not final)
          </label>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Pace">
            <select className="input" value={prefs.pace} onChange={(e) => setPrefs({ ...prefs, pace: e.target.value as TripPreferences["pace"] })}>
              {PACES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Travel mode">
            <select className="input" value={prefs.travelMode} onChange={(e) => setPrefs({ ...prefs, travelMode: e.target.value as TripPreferences["travelMode"] })}>
              {TRAVEL_MODES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Budget">
            <select className="input" value={prefs.budget ?? ""} onChange={(e) => setPrefs({ ...prefs, budget: (e.target.value || undefined) as TripPreferences["budget"] })}>
              <option value="">—</option>
              {BUDGETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes for the planner">
          <textarea className="input" maxLength={3000} value={prefs.notes ?? ""} onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || null })} />
        </Field>
      </div>
    </Modal>
  );
}

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ItineraryDay, ItineraryItem, ItineraryProposal } from "@wayfare/shared";
import clsx from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Footprints, GripVertical, Loader2, MapPin, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { catEmoji, fmtDate, fmtDuration, fmtLeg, fmtTime } from "@/lib/format";
import { useItineraryMutations, useLatestProposal, useMe, type TripPlace } from "@/lib/queries";
import { MapView } from "./MapView";
import { Badge, Cover, Field, Modal, Spinner, useConfirm } from "./ui";

export function ItineraryView({ tripId, days, places, canEdit }: { tripId: string; days: ItineraryDay[]; places: TripPlace[]; canEdit: boolean }) {
  const [dayIdx, setDayIdx] = useState(0);
  const day = days[Math.min(dayIdx, days.length - 1)];
  const m = useItineraryMutations(tripId);
  const { data: me } = useMe();
  const { data: proposal } = useLatestProposal(tripId);
  const [genOpen, setGenOpen] = useState<null | { scope: "trip" | "day" }>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ItineraryItem | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>(day?.items ?? []);
  const timeFormat = me?.preferences.timeFormat ?? "24h";
  const units = me?.preferences.units ?? "metric";

  useEffect(() => setItems(day?.items ?? []), [day]);

  const scheduled = useMemo(() => new Set(days.flatMap((d) => d.items.map((i) => i.placeId).filter(Boolean))), [days]);
  const unscheduled = places.filter((p) => !scheduled.has(p.id));
  const totalItems = days.reduce((n, d) => n + d.items.length, 0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!day) return null;

  const reorder = (next: ItineraryItem[]) => {
    setItems(next);
    m.reorder.mutate({ dayId: day.id, itemIds: next.map((i) => i.id) });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    reorder(arrayMove(items, from, to));
  };

  const route = items.filter((i) => i.place?.lat != null).map((i) => [i.place!.lng!, i.place!.lat!] as [number, number]);
  const busy = proposal && ["queued", "running"].includes(proposal.status);

  return (
    <div className="space-y-4">
      {/* AI proposal status */}
      {proposal && proposal.status !== "accepted" && proposal.status !== "discarded" && (
        <div
          className={clsx(
            "flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm",
            proposal.status === "failed" ? "bg-amber-50 text-amber-900" : "bg-gradient-to-r from-violet-50 to-brand-50 text-slate-800",
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin text-violet-600" /> : proposal.status === "failed" ? <AlertTriangle className="size-5" /> : <Sparkles className="size-5 text-violet-600" />}
          <span className="min-w-0 flex-1">
            {busy && <>Building your {proposal.scope === "day" ? `day ${proposal.dayNumber}` : "itinerary"}… you can keep editing meanwhile.</>}
            {proposal.status === "ready" && <>A suggested {proposal.scope === "day" ? `plan for day ${proposal.dayNumber}` : "itinerary"} is ready to review.</>}
            {proposal.status === "failed" && <>{proposal.error ?? "Generation failed."} Your itinerary wasn't changed.</>}
          </span>
          {proposal.status === "ready" && (
            <button className="btn-primary btn-sm" onClick={() => setReviewOpen(true)}>
              Review
            </button>
          )}
          {proposal.status === "failed" && canEdit && (
            <button className="btn-secondary btn-sm" onClick={() => setGenOpen({ scope: proposal.scope })}>
              <RefreshCw className="size-3.5" /> Try again
            </button>
          )}
          {(proposal.status === "failed" || proposal.status === "ready") && canEdit && (
            <button className="icon-btn size-8" aria-label="Dismiss" onClick={() => m.discard.mutate(proposal.id)}>
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Day selector */}
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none" role="tablist" aria-label="Days">
          {days.map((d, i) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={i === dayIdx}
              onClick={() => setDayIdx(i)}
              className={clsx("flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 transition", i === dayIdx ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white hover:border-slate-300")}
            >
              <span className="text-[11px] font-semibold uppercase opacity-80">Day {d.dayNumber}</span>
              <span className="text-xs">{fmtDate(d.date, { weekday: "short", day: "numeric" })}</span>
              {d.items.length > 0 && <span className={clsx("mt-0.5 size-1.5 rounded-full", i === dayIdx ? "bg-white" : "bg-brand-500")} />}
            </button>
          ))}
        </div>
        {canEdit && (
          <button className="btn-primary shrink-0" disabled={!!busy} onClick={() => setGenOpen({ scope: "trip" })}>
            <Sparkles className="size-4" /> <span className="hidden sm:inline">{totalItems ? "Regenerate" : "Generate itinerary"}</span>
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <DayHeader key={day.id} day={day} canEdit={canEdit} onSave={(title, notes) => m.updateDay.mutate({ id: day.id, title, notes })} onRegenerate={() => setGenOpen({ scope: "day" })} busy={!!busy} />

          {day.warnings.length > 0 && (
            <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {day.warnings.map((w, i) => (
                <p key={i} className="flex gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <div className="card flex flex-col items-center p-8 text-center">
              <div className="text-3xl">🗓️</div>
              <p className="mt-2 font-semibold">Nothing planned for day {day.dayNumber}</p>
              <p className="mt-1 text-sm text-muted">Add stops from your trip places, or let AI suggest a plan for this day.</p>
              {canEdit && (
                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary" onClick={() => setAdding(true)}>
                    <Plus className="size-4" /> Add stop
                  </button>
                  <button className="btn-secondary" disabled={!!busy} onClick={() => setGenOpen({ scope: "day" })}>
                    <Sparkles className="size-4" /> Plan this day
                  </button>
                </div>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <ol className="relative space-y-0">
                  {items.map((it, idx) => (
                    <SortableItem
                      key={it.id}
                      item={it}
                      index={idx}
                      last={idx === items.length - 1}
                      canEdit={canEdit}
                      days={days}
                      currentDayId={day.id}
                      timeFormat={timeFormat}
                      units={units}
                      onUp={() => reorder(arrayMove(items, idx, idx - 1))}
                      onDown={() => reorder(arrayMove(items, idx, idx + 1))}
                      onMoveDay={(dayId) => m.updateItem.mutate({ id: it.id, dayId })}
                      onEdit={() => setEditing(it)}
                      onRemove={() => m.removeItem.mutate(it.id)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
          {canEdit && items.length > 0 && (
            <button className="btn-secondary w-full border-dashed" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add stop
            </button>
          )}
        </div>

        <aside className="space-y-3">
          <MapView
            className="h-72 lg:sticky lg:top-20 lg:h-[420px]"
            markers={items
              .filter((i) => i.place?.lat != null)
              .map((i) => ({ id: i.id, lat: i.place!.lat!, lng: i.place!.lng!, label: i.place!.name, number: items.indexOf(i) + 1 }))}
            route={route}
          />
          <p className="text-xs text-muted">Travel times marked “~” are straight-line estimates, not live routes. Check opening hours before you go.</p>
          {unscheduled.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold">Not scheduled yet ({unscheduled.length})</h3>
              <ul className="mt-2 space-y-1">
                {unscheduled.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span>{catEmoji(p.category)}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    {canEdit && (
                      <button className="btn-ghost btn-sm" onClick={() => m.addItem.mutate({ dayId: day.id, placeId: p.id })}>
                        + Day {day.dayNumber}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {genOpen && (
        <GenerateDialog
          scope={genOpen.scope}
          dayNumber={day.dayNumber}
          hasItinerary={totalItems > 0}
          noPlaces={places.length === 0}
          remaining={me ? me.usage.limits.aiGenerationsPerMonth - me.usage.aiGenerations : null}
          onClose={() => setGenOpen(null)}
          onGenerate={async (instructions) => {
            await m.generate.mutateAsync({ scope: genOpen.scope, dayId: genOpen.scope === "day" ? day.id : undefined, instructions: instructions || undefined });
            setGenOpen(null);
          }}
        />
      )}
      {reviewOpen && proposal?.status === "ready" && (
        <ProposalReview
          proposal={proposal}
          places={places}
          days={days}
          timeFormat={timeFormat}
          onClose={() => setReviewOpen(false)}
          onAccept={async () => {
            await m.accept.mutateAsync(proposal.id);
            setReviewOpen(false);
            toast.success("Itinerary updated");
          }}
          onDiscard={async () => {
            await m.discard.mutateAsync(proposal.id);
            setReviewOpen(false);
          }}
        />
      )}
      {adding && <AddStopDialog places={places} dayNumber={day.dayNumber} onClose={() => setAdding(false)} onAdd={(b) => m.addItem.mutateAsync({ dayId: day.id, ...b }).then(() => setAdding(false))} />}
      {editing && <EditItemDialog item={editing} onClose={() => setEditing(null)} onSave={(b) => m.updateItem.mutateAsync({ id: editing.id, ...b }).then(() => setEditing(null))} />}
    </div>
  );
}

function DayHeader({ day, canEdit, onSave, onRegenerate, busy }: { day: ItineraryDay; canEdit: boolean; onSave: (title: string | null, notes: string | null) => void; onRegenerate: () => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(day.title ?? "");
  const [notes, setNotes] = useState(day.notes ?? "");
  if (editing) {
    return (
      <div className="card space-y-2 p-4">
        <input className="input" placeholder={`Day ${day.dayNumber} title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <textarea className="input" placeholder="Notes for the day" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              onSave(title.trim() || null, notes.trim() || null);
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{fmtDate(day.date, { weekday: "long", month: "long", day: "numeric" })}</div>
        <h2 className="font-display text-2xl font-bold">{day.title ?? `Day ${day.dayNumber}`}</h2>
        {day.notes && <p className="mt-1 text-sm text-slate-600">{day.notes}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <button className="icon-btn size-9" onClick={() => setEditing(true)} aria-label="Edit day title and notes">
            <Pencil className="size-4" />
          </button>
          <button className="icon-btn size-9" onClick={onRegenerate} disabled={busy} aria-label={`Regenerate day ${day.dayNumber}`} title="Regenerate this day with AI">
            <RefreshCw className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function SortableItem({
  item,
  index,
  last,
  canEdit,
  days,
  currentDayId,
  timeFormat,
  units,
  onUp,
  onDown,
  onMoveDay,
  onEdit,
  onRemove,
}: {
  item: ItineraryItem;
  index: number;
  last: boolean;
  canEdit: boolean;
  days: ItineraryDay[];
  currentDayId: string;
  timeFormat: "24h" | "12h";
  units: "metric" | "imperial";
  onUp: () => void;
  onDown: () => void;
  onMoveDay: (dayId: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canEdit });
  const name = item.place?.name ?? item.title ?? "Activity";
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx("relative pl-10", isDragging && "z-10 opacity-80")}>
      {/* Timeline rail */}
      <span className="absolute left-[15px] top-0 h-full w-0.5 bg-line" aria-hidden />
      <span className="absolute left-0 top-4 flex size-8 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white ring-4 ring-canvas">{index + 1}</span>

      <div className="card mb-2 flex gap-3 p-3">
        {canEdit && (
          <button className="-ml-1 hidden cursor-grab touch-none text-slate-300 hover:text-slate-500 sm:block" {...attributes} {...listeners} aria-label={`Drag to reorder ${name}`}>
            <GripVertical className="size-4" />
          </button>
        )}
        {item.place ? (
          <Link to={`/places/${item.place.id}`} className="shrink-0">
            <Cover src={item.place.imageUrl} seed={item.place.name} emoji={catEmoji(item.place.category)} className="size-16 rounded-xl text-xl" />
          </Link>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">📝</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                {item.startTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {fmtTime(item.startTime, timeFormat)}
                    {item.durationMinutes ? ` · ${fmtDuration(item.durationMinutes)}` : ""}
                  </span>
                )}
                {item.place?.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {item.place.city}
                  </span>
                )}
                {item.aiGenerated && <Badge tone="violet">AI</Badge>}
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center">
                <button className="icon-btn size-7" onClick={onUp} disabled={index === 0} aria-label={`Move ${name} earlier`}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button className="icon-btn size-7" onClick={onDown} disabled={last} aria-label={`Move ${name} later`}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button className="icon-btn size-7" onClick={onEdit} aria-label={`Edit ${name}`}>
                  <Pencil className="size-3.5" />
                </button>
                <button className="icon-btn size-7 hover:text-red-600" onClick={onRemove} aria-label={`Remove ${name}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          {item.notes && <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{item.notes}</p>}
          {canEdit && days.length > 1 && (
            <select
              className="mt-2 h-7 rounded-lg border border-line bg-white px-2 text-xs text-slate-600"
              value={currentDayId}
              onChange={(e) => onMoveDay(e.target.value)}
              aria-label={`Move ${name} to another day`}
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === currentDayId ? `Day ${d.dayNumber} (current)` : `Move to day ${d.dayNumber}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {item.travelToNext && !last && (
        <div className="mb-2 flex items-center gap-1.5 pl-1 text-xs text-muted">
          <Footprints className="size-3.5" /> {fmtLeg(item.travelToNext, units)}
        </div>
      )}
    </li>
  );
}

function GenerateDialog({
  scope,
  dayNumber,
  hasItinerary,
  noPlaces,
  remaining,
  onClose,
  onGenerate,
}: {
  scope: "trip" | "day";
  dayNumber: number;
  hasItinerary: boolean;
  noPlaces: boolean;
  remaining: number | null;
  onClose: () => void;
  onGenerate: (instructions: string) => Promise<void>;
}) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={scope === "day" ? `Plan day ${dayNumber} with AI` : hasItinerary ? "Regenerate itinerary" : "Generate itinerary"}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || remaining === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onGenerate(instructions.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner className="size-4 text-white" /> : <Sparkles className="size-4" />} Generate
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          {scope === "day"
            ? `We'll suggest a plan for day ${dayNumber} using places not already scheduled on other days. The rest of your trip won't change.`
            : "We'll build a day-by-day plan from your trip places and preferences."}{" "}
          You'll review the suggestion before it replaces anything.
        </p>
        {noPlaces && <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">This trip has no places yet, so suggestions will be generic. Add saved places for a better plan.</p>}
        <Field label="Anything specific? (optional)">
          <textarea className="input" maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Start late, keep it near the old town, include a sunset spot…" />
        </Field>
        {remaining != null && <p className="text-xs text-muted">{remaining > 0 ? `${remaining} generation${remaining === 1 ? "" : "s"} left this month.` : "You've reached this month's limit. Upgrade to Pro for more."}</p>}
      </div>
    </Modal>
  );
}

function ProposalReview({
  proposal,
  places,
  days,
  timeFormat,
  onClose,
  onAccept,
  onDiscard,
}: {
  proposal: ItineraryProposal;
  places: TripPlace[];
  days: ItineraryDay[];
  timeFormat: "24h" | "12h";
  onClose: () => void;
  onAccept: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const byId = new Map(places.map((p) => [p.id, p]));
  const replacing = proposal.scope === "trip" ? days.some((d) => d.items.length) : days.find((d) => d.dayNumber === proposal.dayNumber)?.items.length;
  return (
    <Modal
      open
      onClose={onClose}
      title="Review suggested itinerary"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onDiscard}>
            Discard
          </button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              if (replacing && !(await confirm({ title: "Replace current plan?", body: proposal.scope === "trip" ? "This replaces the activities on every day." : `This replaces the activities on day ${proposal.dayNumber}.`, confirmLabel: "Replace" }))) return;
              setBusy(true);
              try {
                await onAccept();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner className="size-4 text-white" />} Use this plan
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          AI suggestions can be wrong. Times and travel estimates aren't verified — check opening hours. You can edit everything after accepting. Suggested places not in your library will be saved for you.
        </p>
        {proposal.warnings.length > 0 && (
          <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            {proposal.warnings.map((w, i) => (
              <p key={i} className="flex gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
        {proposal.days.map((d) => (
          <section key={d.dayNumber}>
            <h3 className="font-semibold">
              Day {d.dayNumber}
              {d.title && <span className="font-normal text-muted"> · {d.title}</span>}
            </h3>
            <ol className="mt-2 space-y-1.5">
              {d.items.map((it, i) => {
                const p = it.placeId ? byId.get(it.placeId) : null;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-line p-2.5 text-sm">
                    <span className="w-12 shrink-0 text-xs font-semibold text-muted">{fmtTime(it.startTime, timeFormat)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{p?.name ?? it.candidate?.name ?? it.title}</span>
                      {it.candidate && (
                        <Badge tone="violet">
                          <Sparkles className="size-3" /> New suggestion
                        </Badge>
                      )}
                      {it.notes && <span className="block text-xs text-muted">{it.notes}</span>}
                      {it.travelToNext && <span className="block text-[11px] text-slate-400">then {fmtLeg(it.travelToNext)}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{fmtDuration(it.durationMinutes)}</span>
                  </li>
                );
              })}
            </ol>
            {d.warnings.map((w, i) => (
              <p key={i} className="mt-1 text-xs text-amber-700">
                {w}
              </p>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}

function AddStopDialog({ places, dayNumber, onClose, onAdd }: { places: TripPlace[]; dayNumber: number; onClose: () => void; onAdd: (b: { placeId?: string; title?: string; startTime?: string | null }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const list = places.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onClose={onClose} title={`Add a stop to day ${dayNumber}`}>
      <div className="space-y-4">
        <input className="input" placeholder="Filter trip places" value={q} onChange={(e) => setQ(e.target.value)} />
        {places.length === 0 ? (
          <p className="text-sm text-muted">This trip has no places yet. Add places from the Places tab, or add a free-form activity below.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {list.map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50" onClick={() => onAdd({ placeId: p.id })}>
                  <Cover src={p.imageUrl} seed={p.name} emoji={catEmoji(p.category)} className="size-10 rounded-lg text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.city}</span>
                  </span>
                  <Plus className="size-4 text-brand-700" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) onAdd({ title: title.trim() });
          }}
        >
          <input className="input h-10" placeholder="Or a custom activity, e.g. “Lunch break”" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-secondary h-10" disabled={!title.trim()}>
            Add
          </button>
        </form>
      </div>
    </Modal>
  );
}

function EditItemDialog({ item, onClose, onSave }: { item: ItineraryItem; onClose: () => void; onSave: (b: { startTime: string | null; durationMinutes: number | null; notes: string | null; title?: string | null }) => Promise<void> }) {
  const [startTime, setStartTime] = useState(item.startTime ?? "");
  const [duration, setDuration] = useState(item.durationMinutes?.toString() ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [title, setTitle] = useState(item.title ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${item.place?.name ?? item.title ?? "activity"}`}
      size="sm"
      footer={
        <button
          className="btn-primary"
          onClick={() =>
            onSave({
              startTime: startTime || null,
              durationMinutes: duration ? Math.max(0, Math.min(1440, Number(duration))) : null,
              notes: notes.trim() || null,
              ...(item.place ? {} : { title: title.trim() || null }),
            })
          }
        >
          Save
        </button>
      }
    >
      <div className="space-y-4">
        {!item.place && (
          <Field label="Title">
            <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Planned time">
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Duration (min)">
            <input className="input" type="number" min={0} max={1440} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

import type { Place } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { catEmoji, fmtRange } from "@/lib/format";
import { keys, useCollections, useCreateCollection, usePlaces, useSetPlaceCollections, useTrips } from "@/lib/queries";
import { Cover, Modal, Spinner } from "./ui";

export function CollectionsDialog({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { data: cols, isLoading } = useCollections();
  const [sel, setSel] = useState<string[]>(place.collectionIds ?? []);
  const [newName, setNewName] = useState("");
  const save = useSetPlaceCollections(place.id);
  const create = useCreateCollection();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Collections"
      footer={
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={async () => {
            await save.mutateAsync(sel);
            toast.success("Collections updated");
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-1">
          {cols?.map((c) => {
            const on = sel.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  className={clsx("flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50", on && "bg-brand-50")}
                  onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}
                >
                  <span className={clsx("flex size-5 items-center justify-center rounded-md border", on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted">{c.placeCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const c = await create.mutateAsync({ name: newName.trim() });
          setSel([...sel, c.id]);
          setNewName("");
        }}
      >
        <input className="input h-10" placeholder="New collection name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />
        <button className="btn-secondary" disabled={!newName.trim() || create.isPending}>
          <Plus className="size-4" /> Create
        </button>
      </form>
    </Modal>
  );
}

export function AddToTripDialog({ placeIds, open, onClose }: { placeIds: string[]; open: boolean; onClose: () => void }) {
  const { data: trips, isLoading } = useTrips();
  const qc = useQueryClient();
  const editable = trips?.filter((t) => t.role !== "viewer" && t.phase !== "archived" && t.phase !== "completed") ?? [];
  const add = async (tripId: string, name: string) => {
    try {
      await post(`/trips/${tripId}/places`, { placeIds });
      qc.invalidateQueries({ queryKey: keys.trip(tripId) });
      qc.invalidateQueries({ queryKey: ["places"] });
      qc.invalidateQueries({ queryKey: ["place"] });
      toast.success(`Added to ${name}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add to a trip">
      {isLoading ? (
        <Spinner />
      ) : editable.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted">
          No trips to add to yet.{" "}
          <Link to="/trips/new" className="font-semibold text-brand-700" onClick={onClose}>
            Create a trip
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {editable.map((t) => (
            <li key={t.id}>
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50" onClick={() => add(t.id, t.name)}>
                <Cover src={t.coverImageUrl} seed={t.destination} emoji="✈️" className="size-11 rounded-lg text-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.destination} · {fmtRange(t.startDate, t.endDate)}
                  </span>
                </span>
                <Plus className="size-4 text-brand-700" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Multi-select from the user's library. */
export function PlacePickerDialog({
  open,
  onClose,
  onConfirm,
  exclude = [],
  title = "Choose places",
  confirmLabel = "Add",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<unknown> | void;
  exclude?: string[];
  title?: string;
  confirmLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = usePlaces({ sort: "recent" });
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((p) => !exclude.includes(p.id) && (!term || [p.name, p.city, p.country].some((s) => s?.toLowerCase().includes(term))));
  }, [data, q, exclude]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <button
          className="btn-primary"
          disabled={!sel.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(sel);
              setSel([]);
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel} {sel.length || ""}
        </button>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Filter saved places" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{data?.length ? "No matching places." : "Your library is empty. Save some places first."}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((p) => {
            const on = sel.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  className={clsx("flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50", on && "bg-brand-50")}
                  onClick={() => setSel(on ? sel.filter((x) => x !== p.id) : [...sel, p.id])}
                >
                  <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <Cover src={p.imageUrl} seed={p.name} emoji={catEmoji(p.category)} className="size-10 shrink-0 rounded-lg text-base" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{[p.city, p.country].filter(Boolean).join(", ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

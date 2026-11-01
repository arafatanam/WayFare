import type { Place } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, ImagePlus, Luggage, Map as MapIcon, MoreHorizontal, Pencil, Plus, Search, Share2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PlaceCard, VisibilityIcon } from "@/components/cards";
import { PlacePickerDialog } from "@/components/dialogs";
import { useImportDialog } from "@/components/ImportDialog";
import { MapView } from "@/components/MapView";
import { ShareDialog } from "@/components/ShareDialog";
import { Cover, EmptyState, ErrorState, Field, Modal, PageLoader, useConfirm } from "@/components/ui";
import { del, post, put, upload } from "@/lib/api";
import { catEmoji, timeAgo } from "@/lib/format";
import { keys, useCollection, useUpdateCollection } from "@/lib/queries";

export function CollectionPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = useCollection(id);
  const update = useUpdateCollection(id);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const openImport = useImportDialog();
  const [q, setQ] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [order, setOrder] = useState<Place[] | null>(null);

  const places = order ?? data?.places ?? [];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? places.filter((p) => [p.name, p.city, p.country, p.notes].some((s) => s?.toLowerCase().includes(t))) : places;
  }, [places, q]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <div className="page"><ErrorState error={error ?? new Error("Not found")} onRetry={refetch} /></div>;

  const refresh = () => {
    setOrder(null);
    qc.invalidateQueries({ queryKey: keys.collection(id) });
    qc.invalidateQueries({ queryKey: keys.collections });
    qc.invalidateQueries({ queryKey: ["places"] });
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...places];
    const [p] = next.splice(idx, 1);
    next.splice(idx + dir, 0, p);
    setOrder(next);
    try {
      await put(`/collections/${id}/order`, { placeIds: next.map((x) => x.id) });
    } catch (e) {
      toast.error((e as Error).message);
      setOrder(null);
    }
  };

  const located = filtered.filter((p) => p.lat != null && p.lng != null);

  return (
    <div className="page space-y-6">
      <Link to="/saved?tab=collections" className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" /> Collections
      </Link>

      <div className="card overflow-hidden">
        <div className="relative h-40 sm:h-52">
          <Cover src={data.coverImageUrl ?? data.previewImages[0]} seed={data.name} emoji="📚" className="size-full text-5xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
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
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div className="flex items-center gap-1.5 text-xs opacity-90">
              <VisibilityIcon v={data.visibility} className="size-3" />
              {data.visibility === "private" ? "Private" : data.visibility === "link" ? "Shared by link" : "Public"} · {data.placeCount} places · updated {timeAgo(data.updatedAt)}
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold">{data.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {data.description && <p className="w-full text-sm text-slate-600">{data.description}</p>}
          <button className="btn-primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" /> Add places
          </button>
          <button className="btn-secondary" onClick={() => openImport({ collectionId: id })}>
            Save new place
          </button>
          <button className="btn-secondary" onClick={() => setSharing(true)}>
            <Share2 className="size-4" /> Share
          </button>
          <button className="btn-secondary" onClick={() => navigate(`/trips/new?collection=${id}`)}>
            <Luggage className="size-4" /> Plan a trip
          </button>
          <div className="relative ml-auto">
            <button className="icon-btn border border-line" onClick={() => setMenu(!menu)} aria-label="More actions" aria-expanded={menu}>
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <div className="absolute right-0 top-11 z-10 w-48 rounded-xl border border-line bg-white p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                <MenuItem icon={<Pencil className="size-4" />} onClick={() => { setMenu(false); setEditing(true); }}>
                  Rename & describe
                </MenuItem>
                <MenuItem
                  icon={<Copy className="size-4" />}
                  onClick={async () => {
                    setMenu(false);
                    const c = await post<{ id: string }>(`/collections/${id}/duplicate`);
                    qc.invalidateQueries({ queryKey: keys.collections });
                    toast.success("Collection duplicated");
                    navigate(`/collections/${c.id}`);
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  icon={<Trash2 className="size-4" />}
                  danger
                  onClick={async () => {
                    setMenu(false);
                    const ok = await confirm({ title: "Delete collection?", body: "The places in it stay in your library. Share links will stop working.", confirmLabel: "Delete", danger: true });
                    if (!ok) return;
                    await del(`/collections/${id}`);
                    qc.invalidateQueries({ queryKey: keys.collections });
                    toast.success("Collection deleted");
                    navigate("/saved?tab=collections", { replace: true });
                  }}
                >
                  Delete collection
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {places.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-6" />}
          title="This collection is empty"
          body="Add places from your library or save a new one straight into it."
          action={
            <>
              <button className="btn-primary" onClick={() => setPicking(true)}>Add from library</button>
              <button className="btn-secondary" onClick={() => openImport({ collectionId: id })}>Save new place</button>
            </>
          }
        />
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search in this collection" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className={showMap ? "btn-primary" : "btn-secondary"} onClick={() => setShowMap(!showMap)}>
              <MapIcon className="size-4" /> Map
            </button>
          </div>
          {showMap && (
            <MapView className="h-80" markers={located.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.name, emoji: catEmoji(p.category) }))} onSelect={(pid) => navigate(`/places/${pid}`)} />
          )}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No places match “{q}”.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => {
                const idx = places.indexOf(p);
                return (
                  <li key={p.id}>
                    <PlaceCard
                      place={p}
                      compact
                      action={
                        <div className="flex shrink-0 items-center pr-1">
                          {!q && (
                            <>
                              <button className="icon-btn size-8" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label={`Move ${p.name} up`}>
                                <ArrowUp className="size-4" />
                              </button>
                              <button className="icon-btn size-8" disabled={idx === places.length - 1} onClick={() => move(idx, 1)} aria-label={`Move ${p.name} down`}>
                                <ArrowDown className="size-4" />
                              </button>
                            </>
                          )}
                          <button
                            className="icon-btn size-8 hover:text-red-600"
                            aria-label={`Remove ${p.name} from collection`}
                            onClick={async () => {
                              await del(`/collections/${id}/places/${p.id}`);
                              toast.success(`Removed from ${data.name}`, { description: "It's still in your library." });
                              refresh();
                            }}
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <PlacePickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        exclude={places.map((p) => p.id)}
        title={`Add to ${data.name}`}
        onConfirm={async (ids) => {
          await post(`/collections/${id}/places`, { placeIds: ids });
          refresh();
        }}
      />
      {editing && <EditCollectionDialog id={id} name={data.name} description={data.description} onClose={() => setEditing(false)} />}
      <ShareDialog open={sharing} onClose={() => setSharing(false)} type="collection" id={id} visibility={data.visibility} isOwner />
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${danger ? "text-red-600" : ""}`} onClick={onClick}>
      {icon} {children}
    </button>
  );
}

function EditCollectionDialog({ id, name, description, onClose }: { id: string; name: string; description: string | null; onClose: () => void }) {
  const [n, setN] = useState(name);
  const [d, setD] = useState(description ?? "");
  const update = useUpdateCollection(id);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit collection"
      size="sm"
      footer={
        <button
          className="btn-primary"
          disabled={!n.trim() || update.isPending}
          onClick={async () => {
            await update.mutateAsync({ name: n.trim(), description: d.trim() || null });
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={n} maxLength={120} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className="input" value={d} maxLength={1000} onChange={(e) => setD(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

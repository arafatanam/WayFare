import { PLACE_CATEGORIES, type ImportCandidate, type ImportJob } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertCircle, Camera, Check, Link2, MapPin, PenLine, RotateCcw, Search, Sparkles, Upload } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { post, upload } from "@/lib/api";
import { catEmoji, catLabel } from "@/lib/format";
import { keys, useCollections, useCreatePlace, useImportJob } from "@/lib/queries";
import { platformLabel } from "./cards";
import { emptyPlace, fromGeo, PlaceForm, PlaceSearch, type PlaceFormValue } from "./PlaceForm";
import { Modal, Segmented, Spinner } from "./ui";

type Tab = "link" | "screenshot" | "search" | "manual";
interface OpenOptions {
  tab?: Tab;
  importId?: string;
  collectionId?: string;
  tripId?: string;
  url?: string;
}

const Ctx = createContext<(o?: OpenOptions) => void>(() => {});
export const useImportDialog = () => useContext(Ctx);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  return (
    <Ctx.Provider value={(o) => setOpts(o ?? {})}>
      {children}
      {opts && <ImportDialog opts={opts} onClose={() => setOpts(null)} />}
    </Ctx.Provider>
  );
}

function ImportDialog({ opts, onClose }: { opts: OpenOptions; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(opts.tab ?? "link");
  const [jobId, setJobId] = useState<string | null>(opts.importId ?? null);
  const [manualSeed, setManualSeed] = useState<Partial<PlaceFormValue> | null>(null);
  const [collectionIds, setCollectionIds] = useState<string[]>(opts.collectionId ? [opts.collectionId] : []);

  const goManual = (seed: Partial<PlaceFormValue>) => {
    setManualSeed(seed);
    setJobId(null);
    setTab("manual");
  };

  return (
    <Modal open onClose={onClose} title="Save a place" size="md">
      {!jobId && (
        <div className="mb-4 overflow-x-auto scrollbar-none">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "link", label: <><Link2 className="size-3.5" /> Link</> },
              { value: "screenshot", label: <><Camera className="size-3.5" /> Screenshot</> },
              { value: "search", label: <><Search className="size-3.5" /> Search</> },
              { value: "manual", label: <><PenLine className="size-3.5" /> Manual</> },
            ]}
          />
        </div>
      )}

      {jobId ? (
        <ImportProgress jobId={jobId} collectionIds={collectionIds} setCollectionIds={setCollectionIds} tripId={opts.tripId} onDone={onClose} onManual={goManual} />
      ) : tab === "link" ? (
        <LinkTab initial={opts.url} onStarted={setJobId} />
      ) : tab === "screenshot" ? (
        <ScreenshotTab onStarted={setJobId} />
      ) : tab === "search" ? (
        <PlaceSearch autoFocus onPick={(g) => goManual(fromGeo(g))} />
      ) : (
        <ManualTab seed={manualSeed} collectionIds={collectionIds} setCollectionIds={setCollectionIds} tripId={opts.tripId} onDone={onClose} />
      )}
    </Modal>
  );
}

function LinkTab({ initial, onStarted }: { initial?: string; onStarted: (id: string) => void }) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const job = await post<ImportJob>("/imports", { type: "url", url: url.trim() });
      onStarted(job.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Paste a link from Instagram, TikTok, Google Maps or any travel article. We'll find the places in it for you to review.</p>
      <input className="input" type="url" required autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…" />
      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
        {["Instagram", "TikTok", "Google Maps", "Websites & blogs"].map((s) => (
          <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5">
            {s}
          </span>
        ))}
      </div>
      <button className="btn-primary w-full" disabled={busy || !url}>
        {busy ? <Spinner className="size-4 text-white" /> : <Sparkles className="size-4" />} Find places
      </button>
    </form>
  );
}

function ScreenshotTab({ onStarted }: { onStarted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const send = async (file: File | undefined | null) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const job = await upload<ImportJob>("/imports/screenshot", file);
      onStarted(job.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => send(e.clipboardData?.files?.[0]);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        send(e.dataTransfer.files[0]);
      }}
      className={clsx(
        "flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
        drag ? "border-brand-500 bg-brand-50" : "border-line hover:border-slate-300",
      )}
    >
      {busy ? <Spinner className="size-8" /> : <Upload className="size-8 text-brand-700" />}
      <span className="mt-3 font-semibold">Upload a screenshot</span>
      <span className="mt-1 text-sm text-muted">Drop, paste or choose an image of a post, map or article. PNG, JPEG or WebP up to 6 MB.</span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="sr-only" onChange={(e) => send(e.target.files?.[0])} />
    </label>
  );
}

function CollectionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useCollections();
  if (!data?.length) return null;
  return (
    <div>
      <div className="label">Add to collections</div>
      <div className="flex flex-wrap gap-1.5">
        {data.map((c) => {
          const on = value.includes(c.id);
          return (
            <button type="button" key={c.id} className={on ? "chip chip-active" : "chip"} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}>
              {on && <Check className="size-3" />} {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ManualTab({
  seed,
  collectionIds,
  setCollectionIds,
  tripId,
  onDone,
}: {
  seed: Partial<PlaceFormValue> | null;
  collectionIds: string[];
  setCollectionIds: (v: string[]) => void;
  tripId?: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState<PlaceFormValue>({ ...emptyPlace, ...seed });
  const create = useCreatePlace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const place = await create.mutateAsync({ ...value, sourcePlatform: seed?.externalId ? "search" : "manual", collectionIds });
    if (tripId) {
      await post(`/trips/${tripId}/places`, { placeIds: [place.id] });
      qc.invalidateQueries({ queryKey: keys.trip(tripId) });
    }
    toast.success(`Saved ${place.name}`, { action: { label: "View", onClick: () => navigate(`/places/${place.id}`) } });
    onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <PlaceForm value={value} onChange={setValue} />
      <CollectionPicker value={collectionIds} onChange={setCollectionIds} />
      <button className="btn-primary w-full" disabled={create.isPending || !value.name.trim()}>
        {create.isPending && <Spinner className="size-4 text-white" />} Save place
      </button>
    </form>
  );
}

function ImportProgress({
  jobId,
  collectionIds,
  setCollectionIds,
  tripId,
  onDone,
  onManual,
}: {
  jobId: string;
  collectionIds: string[];
  setCollectionIds: (v: string[]) => void;
  tripId?: string;
  onDone: () => void;
  onManual: (seed: Partial<PlaceFormValue>) => void;
}) {
  const { data: job, error, refetch } = useImportJob(jobId);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, Partial<ImportCandidate>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (job?.status === "needs_review") {
      // Preselect confident matches.
      setSelected(Object.fromEntries(job.candidates.map((c, i) => [i, c.confidence >= 0.6 || job.candidates.length === 1])));
    }
  }, [job?.status, job?.candidates]);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!job || job.status === "queued" || job.status === "processing") {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="relative">
          <Spinner className="size-10" />
          <Sparkles className="absolute -right-2 -top-2 size-4 text-sun-500" />
        </div>
        <p className="mt-4 font-semibold">Looking for places…</p>
        <p className="mt-1 text-sm text-muted">Reading the {job?.platform === "screenshot" ? "screenshot" : "link"} and matching locations on the map. You can close this — we'll keep working and notify you.</p>
      </div>
    );
  }

  const sourceUrl = job.type === "url" ? job.input : null;

  if (job.status === "failed") {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">We couldn't extract a place automatically</p>
            <p className="mt-1">{job.error}</p>
            {sourceUrl && <p className="mt-2 break-all text-xs opacity-80">{sourceUrl}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {job.type !== "text" && (
            <button
              className="btn-secondary flex-1"
              onClick={async () => {
                await post(`/imports/${job.id}/retry`).catch((e) => toast.error(e.message));
                refetch();
              }}
            >
              <RotateCcw className="size-4" /> Retry
            </button>
          )}
          <button className="btn-primary flex-1" onClick={() => onManual({ sourceUrl, name: job.title && job.title !== "Screenshot" ? job.title.slice(0, 200) : "" })}>
            <PenLine className="size-4" /> Add manually
          </button>
        </div>
      </div>
    );
  }

  if (job.status === "completed") {
    return <p className="py-6 text-center text-sm text-muted">This import has already been saved.</p>;
  }

  const confirm = async () => {
    const chosen = job.candidates.map((c, i) => ({ ...c, ...edits[i], i })).filter((c) => selected[c.i]);
    if (!chosen.length) return toast.error("Select at least one place");
    setSaving(true);
    try {
      const places = await post<unknown[]>(`/imports/${job.id}/confirm`, {
        places: chosen.map((c) => ({
          name: c.name,
          address: c.address,
          city: c.city,
          country: c.country,
          lat: c.lat,
          lng: c.lng,
          category: c.category,
          externalId: c.externalId,
        })),
        collectionIds,
        tripId,
      });
      qc.invalidateQueries({ queryKey: ["places"] });
      qc.invalidateQueries({ queryKey: keys.home });
      qc.invalidateQueries({ queryKey: keys.collections });
      if (tripId) qc.invalidateQueries({ queryKey: keys.trip(tripId) });
      toast.success(`Saved ${places.length} place${places.length > 1 ? "s" : ""}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {job.imageUrl && <img src={job.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">{platformLabel(job.platform)}</div>
          <div className="truncate font-semibold">{job.title ?? "Imported content"}</div>
          {job.caption && <p className="line-clamp-2 text-xs text-muted">{job.caption}</p>}
        </div>
      </div>
      <p className="text-sm text-muted">Review what we found. Uncheck anything wrong and fix names or categories before saving.</p>
      <ul className="space-y-2">
        {job.candidates.map((c, i) => {
          const v = { ...c, ...edits[i] };
          return (
            <li key={i} className={clsx("rounded-xl border p-3 transition", selected[i] ? "border-brand-500 bg-brand-50/40" : "border-line")}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-2.5 size-4 accent-brand-700" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} aria-label={`Include ${v.name}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <input className="input h-9" value={v.name} onChange={(e) => setEdits({ ...edits, [i]: { ...edits[i], name: e.target.value } })} aria-label="Place name" />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <select
                      className="h-7 rounded-lg border border-line bg-white px-2 text-xs"
                      value={v.category}
                      onChange={(e) => setEdits({ ...edits, [i]: { ...edits[i], category: e.target.value as ImportCandidate["category"] } })}
                      aria-label="Category"
                    >
                      {PLACE_CATEGORIES.map((k) => (
                        <option key={k} value={k}>
                          {catEmoji(k)} {catLabel(k)}
                        </option>
                      ))}
                    </select>
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{v.lat != null ? (v.address ?? [v.city, v.country].filter(Boolean).join(", ")) : "Location not found — you can set it later"}</span>
                    </span>
                    {c.confidence < 0.6 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Unsure</span>}
                  </div>
                  {c.reason && <p className="text-xs italic text-slate-500">“{c.reason}”</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <CollectionPicker value={collectionIds} onChange={setCollectionIds} />
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => onManual({ sourceUrl })}>
          Not right? Add manually
        </button>
        <button className="btn-primary flex-1" onClick={confirm} disabled={saving}>
          {saving && <Spinner className="size-4 text-white" />} Save {Object.values(selected).filter(Boolean).length || ""} place
          {Object.values(selected).filter(Boolean).length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

import { mapsUrl } from "@wayfare/shared";
import { ArrowLeft, Check, ExternalLink, FolderPlus, Luggage, MapPin, Navigation, Pencil, Share2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { platformLabel } from "@/components/cards";
import { AddToTripDialog, CollectionsDialog } from "@/components/dialogs";
import { MapView } from "@/components/MapView";
import { PlaceForm, type PlaceFormValue } from "@/components/PlaceForm";
import { Badge, Cover, ErrorState, Modal, PageLoader, useConfirm } from "@/components/ui";
import { catEmoji, catLabel, fmtDate } from "@/lib/format";
import { useCollections, useDeletePlace, usePlace, useTrips, useUpdatePlace } from "@/lib/queries";

export function PlacePage() {
  const { id = "" } = useParams();
  const { data: place, isLoading, error, refetch } = usePlace(id);
  const { data: collections } = useCollections();
  const { data: trips } = useTrips();
  const update = useUpdatePlace(id);
  const remove = useDeletePlace();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;
  if (error || !place) return <div className="page"><ErrorState error={error ?? new Error("Place not found")} onRetry={refetch} /></div>;

  const inCollections = collections?.filter((c) => place.collectionIds?.includes(c.id)) ?? [];
  const inTrips = trips?.filter((t) => place.tripIds?.includes(t.id)) ?? [];
  const readOnly = place.readOnly;

  const share = async () => {
    const text = `${place.name}${place.city ? `, ${place.city}` : ""}`;
    const url = mapsUrl(place);
    if (navigator.share) {
      await navigator.share({ title: place.name, text, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${text} — ${url}`);
      toast.success("Copied to clipboard");
    }
  };

  return (
    <div className="page max-w-4xl space-y-6">
      <button onClick={() => navigate(-1)} className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="card overflow-hidden">
        <div className="relative aspect-[21/9] min-h-48">
          <Cover src={place.imageUrl} seed={place.name} emoji={catEmoji(place.category)} className="size-full text-6xl" alt={place.name} />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <Badge>
                  {catEmoji(place.category)} {catLabel(place.category)}
                </Badge>
                {place.visited && (
                  <Badge tone="brand">
                    <Check className="size-3" /> Visited
                  </Badge>
                )}
                {readOnly && <Badge tone="violet">Shared via a trip</Badge>}
              </div>
              <h1 className="mt-2 font-display text-3xl font-bold">{place.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <MapPin className="size-4" />
                {place.address ?? ([place.city, place.country].filter(Boolean).join(", ") || "No location set")}
              </p>
            </div>
            {!readOnly && (
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => update.mutate({ visited: !place.visited })}>
                  <Check className="size-4" /> {place.visited ? "Visited" : "Mark visited"}
                </button>
                <button className="icon-btn border border-line" onClick={() => setEditing(true)} aria-label="Edit place">
                  <Pencil className="size-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a href={mapsUrl(place)} target="_blank" rel="noreferrer" className="btn-primary">
              <Navigation className="size-4" /> Open in Maps
            </a>
            {!readOnly && (
              <>
                <button className="btn-secondary" onClick={() => setColsOpen(true)}>
                  <FolderPlus className="size-4" /> Collections
                </button>
                <button className="btn-secondary" onClick={() => setTripOpen(true)}>
                  <Luggage className="size-4" /> Add to trip
                </button>
              </>
            )}
            <button className="btn-secondary" onClick={share}>
              <Share2 className="size-4" /> Share
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {!readOnly && (
            <section className="card p-5">
              <h2 className="section-title">Your notes</h2>
              <p className="text-xs text-muted">Private — only you can see these.</p>
              <textarea
                className="input mt-3"
                value={notes ?? place.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What to order, opening times you found, who recommended it…"
                maxLength={5000}
              />
              {notes !== null && notes !== (place.notes ?? "") && (
                <div className="mt-2 flex justify-end gap-2">
                  <button className="btn-ghost btn-sm" onClick={() => setNotes(null)}>
                    Discard
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={async () => {
                      await update.mutateAsync({ notes: notes.trim() || null });
                      setNotes(null);
                      toast.success("Notes saved");
                    }}
                  >
                    Save notes
                  </button>
                </div>
              )}
            </section>
          )}

          {place.aiDescription && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 section-title">
                <Sparkles className="size-4 text-sun-500" /> AI suggestion
              </h2>
              <p className="mt-1 text-xs text-muted">Generated automatically — may be inaccurate. Check details before you go.</p>
              <p className="mt-3 text-sm text-slate-700">{place.aiDescription}</p>
            </section>
          )}

          {(place.sourceUrl || place.sourceText) && (
            <section className="card p-5">
              <h2 className="section-title">Original source</h2>
              <p className="mt-1 text-xs text-muted">
                Imported from {platformLabel(place.sourcePlatform)} on {fmtDate(place.createdAt, { month: "short", day: "numeric", year: "numeric" })}
              </p>
              {place.sourceText && <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm italic text-slate-600">{place.sourceText}</blockquote>}
              {place.sourceUrl && (
                <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1.5 break-all text-sm font-semibold text-brand-700 hover:underline">
                  <ExternalLink className="size-4 shrink-0" /> {new URL(place.sourceUrl).hostname}
                </a>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {place.lat != null && place.lng != null ? (
            <MapView className="h-64" markers={[{ id: place.id, lat: place.lat, lng: place.lng, label: place.name, emoji: catEmoji(place.category) }]} />
          ) : (
            <div className="card p-5 text-sm text-muted">
              No map location yet.{" "}
              {!readOnly && (
                <button className="font-semibold text-brand-700" onClick={() => setEditing(true)}>
                  Set location
                </button>
              )}
            </div>
          )}
          <div className="card p-4">
            <h3 className="text-sm font-semibold">In collections</h3>
            {inCollections.length ? (
              <ul className="mt-2 space-y-1">
                {inCollections.map((c) => (
                  <li key={c.id}>
                    <Link to={`/collections/${c.id}`} className="text-sm text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Not in any collection.</p>
            )}
            <h3 className="mt-4 text-sm font-semibold">In trips</h3>
            {inTrips.length ? (
              <ul className="mt-2 space-y-1">
                {inTrips.map((t) => (
                  <li key={t.id}>
                    <Link to={`/trips/${t.id}`} className="text-sm text-brand-700 hover:underline">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Not in any trip.</p>
            )}
          </div>
          {!readOnly && (
            <button
              className="btn-ghost w-full text-red-600 hover:bg-red-50"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this place?",
                  body: "It will be removed from your library, all collections and trips. Itinerary stops keep their name. This can't be undone.",
                  confirmLabel: "Delete place",
                  danger: true,
                });
                if (!ok) return;
                await remove.mutateAsync(place.id);
                toast.success("Place deleted");
                navigate("/saved", { replace: true });
              }}
            >
              <Trash2 className="size-4" /> Delete place
            </button>
          )}
        </aside>
      </div>

      {editing && <EditPlaceDialog place={place} onClose={() => setEditing(false)} />}
      {colsOpen && <CollectionsDialog place={place} open onClose={() => setColsOpen(false)} />}
      <AddToTripDialog placeIds={[place.id]} open={tripOpen} onClose={() => setTripOpen(false)} />
    </div>
  );
}

function EditPlaceDialog({ place, onClose }: { place: PlaceFormValue & { id: string }; onClose: () => void }) {
  const [value, setValue] = useState<PlaceFormValue>({
    name: place.name,
    category: place.category,
    address: place.address,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    notes: place.notes,
    sourceUrl: place.sourceUrl,
    imageUrl: place.imageUrl,
    externalId: place.externalId,
  });
  const update = useUpdatePlace(place.id);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit place"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!value.name.trim() || update.isPending}
            onClick={async () => {
              await update.mutateAsync(value);
              toast.success("Saved");
              onClose();
            }}
          >
            Save changes
          </button>
        </>
      }
    >
      <PlaceForm value={value} onChange={setValue} />
    </Modal>
  );
}

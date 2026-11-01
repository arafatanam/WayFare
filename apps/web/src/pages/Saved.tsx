import { PLACE_CATEGORIES } from "@wayfare/shared";
import clsx from "clsx";
import { Bookmark, FolderPlus, LayoutGrid, List, Map as MapIcon, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CardGridSkeleton, CollectionCard, PlaceCard } from "@/components/cards";
import { useImportDialog } from "@/components/ImportDialog";
import { MapView } from "@/components/MapView";
import { useDebounced } from "@/components/PlaceForm";
import { EmptyState, ErrorState, Field, Modal, Segmented } from "@/components/ui";
import { catEmoji, catLabel } from "@/lib/format";
import { useCollections, useCreateCollection, useDestinations, usePlaces, type PlaceFilters } from "@/lib/queries";

type View = "grid" | "list" | "map";

export function Saved() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "collections" ? "collections" : "places";
  const openImport = useImportDialog();

  // Deep links: /saved?add=1 opens the save dialog; /saved?import=<id> resumes an import review.
  useEffect(() => {
    const importId = params.get("import");
    if (params.get("add") || importId) {
      openImport(importId ? { importId } : undefined);
      params.delete("add");
      params.delete("import");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Saved</h1>
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === "collections" ? { tab: v } : {})}
          options={[
            { value: "places", label: "Places" },
            { value: "collections", label: "Collections" },
          ]}
        />
      </div>
      {tab === "places" ? <PlacesTab /> : <CollectionsTab />}
    </div>
  );
}

function PlacesTab() {
  const openImport = useImportDialog();
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem("saved.view") as View) || "grid";
    } catch {
      return "grid";
    }
  });
  const [filters, setFilters] = useState<PlaceFilters>({ sort: "recent" });
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const { data: places, isLoading, error, refetch } = usePlaces({ ...filters, q: debounced || undefined });
  const { data: collections } = useCollections();
  const { data: destinations } = useDestinations();
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();

  const setV = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("saved.view", v);
    } catch {
      /* storage unavailable */
    }
  };
  const activeFilters = !!(filters.category || filters.collectionId || filters.city || filters.visited || debounced);
  const located = places?.filter((p) => p.lat != null && p.lng != null) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name, city, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={filters.city ?? ""} onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })} aria-label="Destination">
          <option value="">All destinations</option>
          {destinations?.map((d) => (
            <option key={`${d.city}|${d.country}`} value={d.city}>
              {d.city}
              {d.country ? `, ${d.country}` : ""} ({d.count})
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.collectionId ?? ""} onChange={(e) => setFilters({ ...filters, collectionId: e.target.value || undefined })} aria-label="Collection">
          <option value="">All collections</option>
          {collections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as PlaceFilters["sort"] })} aria-label="Sort">
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="city">By city</option>
        </select>
        <Segmented
          value={view}
          onChange={setV}
          options={[
            { value: "grid", label: <LayoutGrid className="size-4" aria-label="Grid" /> },
            { value: "list", label: <List className="size-4" aria-label="List" /> },
            { value: "map", label: <MapIcon className="size-4" aria-label="Map" /> },
          ]}
        />
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none">
        <button className={clsx("chip", !filters.category && "chip-active")} onClick={() => setFilters({ ...filters, category: undefined })}>
          All
        </button>
        {PLACE_CATEGORIES.map((c) => (
          <button key={c} className={clsx("chip", filters.category === c && "chip-active")} onClick={() => setFilters({ ...filters, category: filters.category === c ? undefined : c })}>
            {catEmoji(c)} {catLabel(c)}
          </button>
        ))}
        <button
          className={clsx("chip", filters.visited && "chip-active")}
          onClick={() => setFilters({ ...filters, visited: filters.visited === "true" ? "false" : filters.visited === "false" ? undefined : "true" })}
        >
          {filters.visited === "true" ? "✓ Visited" : filters.visited === "false" ? "Not visited" : "Visited?"}
        </button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <CardGridSkeleton />
      ) : !places?.length ? (
        activeFilters ? (
          <EmptyState title="No matching places" body="Try removing a filter or searching for something else." action={<button className="btn-secondary" onClick={() => { setFilters({ sort: "recent" }); setQ(""); }}>Clear filters</button>} />
        ) : (
          <EmptyState
            icon={<Bookmark className="size-6" />}
            title="Your library is empty"
            body="Save places from social media, maps or websites. Paste a link, upload a screenshot or search for a place."
            action={<button className="btn-primary" onClick={() => openImport()}>Save your first place</button>}
          />
        )
      ) : view === "map" ? (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <ul className="order-2 max-h-[600px] space-y-2 overflow-y-auto lg:order-1">
            {places.map((p) => (
              <li key={p.id}>
                <PlaceCard place={p} compact selected={selected === p.id} onClick={() => (selected === p.id ? navigate(`/places/${p.id}`) : setSelected(p.id))} />
              </li>
            ))}
          </ul>
          <div className="order-1 lg:order-2">
            <MapView
              className="h-[360px] lg:h-[600px]"
              markers={located.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.name, emoji: catEmoji(p.category) }))}
              selectedId={selected}
              onSelect={setSelected}
            />
            {located.length < places.length && <p className="mt-2 text-xs text-muted">{places.length - located.length} place(s) without a location are listed but not shown on the map.</p>}
          </div>
        </div>
      ) : view === "list" ? (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id}>
              <PlaceCard place={p} compact />
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionsTab() {
  const { data, isLoading, error, refetch } = useCollections();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <FolderPlus className="size-4" /> New collection
        </button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <CardGridSkeleton n={4} />
      ) : !data?.length ? (
        <EmptyState
          icon={<FolderPlus className="size-6" />}
          title="No collections yet"
          body="Collections group places without needing a trip — like “Cafés in Dhaka” or “Beaches for summer”."
          action={<button className="btn-primary" onClick={() => setCreating(true)}>Create a collection</button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => (
            <CollectionCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <NewCollectionDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

export function NewCollectionDialog({ open, onClose, placeIds }: { open: boolean; onClose: () => void; placeIds?: string[] }) {
  const create = useCreateCollection();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="New collection" size="sm">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const c = await create.mutateAsync({ name: name.trim(), description: description.trim() || null, placeIds });
          setName("");
          setDescription("");
          onClose();
          navigate(`/collections/${c.id}`);
        }}
      >
        <Field label="Name">
          <input className="input" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Restaurants to try in Tokyo" />
        </Field>
        <Field label="Description (optional)">
          <textarea className="input" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <button className="btn-primary w-full" disabled={!name.trim() || create.isPending}>
          Create collection
        </button>
      </form>
    </Modal>
  );
}

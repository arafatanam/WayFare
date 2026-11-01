import { PLACE_CATEGORIES, type GeoResult, type PlaceCategory } from "@wayfare/shared";
import { MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { catEmoji, catLabel } from "@/lib/format";
import { usePlaceSearch } from "@/lib/queries";
import { Field, Spinner } from "./ui";

export interface PlaceFormValue {
  name: string;
  category: PlaceCategory;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  externalId: string | null;
}

export const emptyPlace: PlaceFormValue = {
  name: "",
  category: "other",
  address: null,
  city: null,
  country: null,
  lat: null,
  lng: null,
  notes: null,
  sourceUrl: null,
  imageUrl: null,
  externalId: null,
};

export function fromGeo(g: GeoResult): Partial<PlaceFormValue> {
  return { name: g.name, address: g.address, city: g.city, country: g.country, lat: g.lat, lng: g.lng, category: g.category, externalId: g.externalId };
}

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Lets the user search for a place and pick a result (used for both new places and correcting a location). */
export function PlaceSearch({ onPick, placeholder = "Search for a place, address or city", autoFocus }: { onPick: (g: GeoResult) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 350);
  const { data, isFetching } = usePlaceSearch(debounced);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
        {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      {debounced.length >= 2 && data && (
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {data.length === 0 && <li className="p-3 text-sm text-muted">No matches. Try a different spelling or add details manually.</li>}
          {data.map((g) => (
            <li key={g.externalId}>
              <button type="button" className="flex w-full items-start gap-3 p-3 text-left hover:bg-slate-50" onClick={() => onPick(g)}>
                <span className="mt-0.5 text-lg">{catEmoji(g.category)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{g.name}</span>
                  <span className="block truncate text-xs text-muted">{g.address ?? [g.city, g.country].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlaceForm({ value, onChange }: { value: PlaceFormValue; onChange: (v: PlaceFormValue) => void }) {
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof PlaceFormValue>(k: K, v: PlaceFormValue[K]) => onChange({ ...value, [k]: v });
  const blank = (s: string) => (s.trim() ? s : null);

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input className="input" value={value.name} maxLength={200} required onChange={(e) => set("name", e.target.value)} placeholder="e.g. Tsukiji Outer Market" />
      </Field>
      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {PLACE_CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => set("category", c)} className={value.category === c ? "chip chip-active" : "chip"}>
              {catEmoji(c)} {catLabel(c)}
            </button>
          ))}
        </div>
      </Field>

      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-brand-700" />
            {value.lat != null ? (
              <span>
                Located{value.address ? `: ${value.address}` : ` at ${value.lat.toFixed(4)}, ${value.lng?.toFixed(4)}`}
              </span>
            ) : (
              <span className="text-muted">No map location yet</span>
            )}
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setLocating((x) => !x)}>
            {locating ? "Cancel" : value.lat != null ? "Change" : "Find on map"}
          </button>
        </div>
        {locating && (
          <div className="mt-3">
            <PlaceSearch
              autoFocus
              placeholder={value.name ? `Search “${value.name}”…` : "Search for the location"}
              onPick={(g) => {
                onChange({ ...value, address: g.address, city: g.city, country: g.country, lat: g.lat, lng: g.lng, externalId: g.externalId, name: value.name || g.name });
                setLocating(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input className="input" value={value.city ?? ""} onChange={(e) => set("city", blank(e.target.value))} />
        </Field>
        <Field label="Country">
          <input className="input" value={value.country ?? ""} onChange={(e) => set("country", blank(e.target.value))} />
        </Field>
      </div>
      <Field label="Address">
        <input className="input" value={value.address ?? ""} onChange={(e) => set("address", blank(e.target.value))} />
      </Field>
      <Field label="Your notes" hint="Only you can see your notes.">
        <textarea className="input" value={value.notes ?? ""} maxLength={5000} onChange={(e) => set("notes", blank(e.target.value))} placeholder="Why you saved it, what to order, best time to go…" />
      </Field>
      <Field label="Source link">
        <input className="input" type="url" value={value.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", blank(e.target.value))} placeholder="https://" />
      </Field>
    </div>
  );
}

import { BUDGETS, PACES, PLACE_CATEGORIES, TRAVEL_MODES, tripInput, type PlaceCategory, type TripPreferences } from "@wayfare/shared";
import clsx from "clsx";
import { ArrowLeft, Check, MapPin, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PlaceSearch } from "@/components/PlaceForm";
import { Cover, Field, Spinner } from "@/components/ui";
import { post } from "@/lib/api";
import { catEmoji, catLabel, tripLength } from "@/lib/format";
import { useCollections, useCreateTrip, useMe, usePlaces } from "@/lib/queries";

const STEPS = ["Where & when", "Places", "Preferences"];

export function NewTrip() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const create = useCreateTrip();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: "",
    destination: params.get("destination") ?? "", // prefilled when coming from onboarding
    destinationLat: null as number | null,
    destinationLng: null as number | null,
    extra: "",
    startDate: "",
    endDate: "",
    status: "planned" as "planned" | "draft",
  });
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [mustVisit, setMustVisit] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>(params.get("collection") ? [params.get("collection")!] : []);
  const [prefs, setPrefs] = useState<TripPreferences>({ interests: [], pace: "balanced", travelMode: "walking" });
  const [generate, setGenerate] = useState(true);

  useEffect(() => {
    if (me) setPrefs((p) => ({ ...p, interests: me.preferences.interests, pace: me.preferences.pace, travelMode: me.preferences.travelMode }));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: places } = usePlaces({ sort: "city" });
  const { data: collections } = useCollections();
  const [placeFilter, setPlaceFilter] = useState("");

  // Suggest places near the destination first.
  const sortedPlaces = useMemo(() => {
    const dest = form.destination.split(",")[0].trim().toLowerCase();
    const term = placeFilter.trim().toLowerCase();
    return (places ?? [])
      .filter((p) => !term || [p.name, p.city, p.country].some((s) => s?.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.city?.toLowerCase() === dest) - Number(a.city?.toLowerCase() === dest));
  }, [places, form.destination, placeFilter]);

  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!form.destination.trim()) e.destination = "Where are you going?";
    if (!form.startDate) e.startDate = "Pick a start date";
    if (!form.endDate) e.endDate = "Pick an end date";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "End date must be after the start date";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    const payload = {
      name: form.name.trim() || `Trip to ${form.destination.split(",")[0]}`,
      destination: form.destination.trim(),
      destinationLat: form.destinationLat,
      destinationLng: form.destinationLng,
      extraDestinations: form.extra.split(",").map((s) => s.trim()).filter(Boolean),
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      preferences: prefs,
      placeIds,
      mustVisitPlaceIds: mustVisit,
      collectionIds,
    };
    const parsed = tripInput.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const trip = await create.mutateAsync(parsed.data);
    const hasPlaces = placeIds.length + mustVisit.length + collectionIds.length > 0;
    if (generate && hasPlaces) {
      try {
        await post(`/trips/${trip.id}/itinerary/generate`, { scope: "trip" });
      } catch (e) {
        // The trip is saved even if generation can't start (e.g. monthly limit reached).
        toast.error((e as Error).message);
      }
    }
    toast.success("Trip created");
    navigate(`/trips/${trip.id}${generate && hasPlaces ? "?tab=itinerary" : ""}`, { replace: true });
  };

  return (
    <div className="page max-w-3xl space-y-6">
      <Link to="/trips" className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" /> Trips
      </Link>
      <div>
        <h1 className="page-title">Plan a new trip</h1>
        <ol className="mt-4 flex gap-2 text-xs font-semibold">
          {STEPS.map((s, i) => (
            <li key={s} className={clsx("flex items-center gap-1.5 rounded-full px-3 py-1", i === step ? "bg-brand-700 text-white" : i < step ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-500")}>
              {i < step ? <Check className="size-3" /> : <span>{i + 1}</span>} {s}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <div className="card space-y-5 p-5 sm:p-6">
          <Field label="Destination" error={errors.destination}>
            {form.destination ? (
              <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="size-4 text-brand-700" /> {form.destination}
                </span>
                <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setForm({ ...form, destination: "", destinationLat: null, destinationLng: null })}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <PlaceSearch
                  placeholder="City, region or country"
                  onPick={(g) => setForm({ ...form, destination: [g.name, g.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", "), destinationLat: g.lat, destinationLng: g.lng })}
                />
                <p className="mt-1 text-xs text-muted">Pick a result so we can center maps and suggestions.</p>
              </>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" error={errors.startDate}>
              <input className="input" type="date" min={form.status === "draft" ? undefined : today} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate && form.endDate < e.target.value ? e.target.value : form.endDate })} />
            </Field>
            <Field label="End date" error={errors.endDate}>
              <input className="input" type="date" min={form.startDate || today} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
          {form.startDate && form.endDate && form.endDate >= form.startDate && <p className="-mt-2 text-sm text-muted">{tripLength(form.startDate, form.endDate)}</p>}
          <Field label="Trip name (optional)">
            <input className="input" maxLength={120} value={form.name} placeholder={form.destination ? `Trip to ${form.destination.split(",")[0]}` : "Summer in Lisbon"} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Other destinations (optional)" hint="Comma-separated, e.g. Sintra, Cascais">
            <input className="input" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-700" checked={form.status === "draft"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "draft" : "planned" })} />
            Save as draft (dates aren't final)
          </label>
          <button className="btn-primary w-full" onClick={() => validateStep0() && setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {collections && collections.length > 0 && (
            <div className="card p-5">
              <h2 className="section-title">Include collections</h2>
              <p className="text-sm text-muted">All places in these collections are added to the trip.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {collections.map((c) => {
                  const on = collectionIds.includes(c.id);
                  return (
                    <button key={c.id} className={clsx("chip", on && "chip-active")} onClick={() => setCollectionIds(on ? collectionIds.filter((x) => x !== c.id) : [...collectionIds, c.id])}>
                      {on && <Check className="size-3" />} {c.name} <span className="text-slate-400">{c.placeCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="card p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="section-title">Pick saved places</h2>
                <p className="text-sm text-muted">Tap ★ to mark must-visit places — the planner always includes them.</p>
              </div>
              <input className="input h-9 w-48" placeholder="Filter" value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} />
            </div>
            {!places?.length ? (
              <p className="mt-4 text-sm text-muted">You haven't saved any places yet — you can add them to the trip later, or let the AI suggest some.</p>
            ) : (
              <ul className="mt-3 max-h-[420px] space-y-1 overflow-y-auto">
                {sortedPlaces.map((p) => {
                  const on = placeIds.includes(p.id) || mustVisit.includes(p.id);
                  const must = mustVisit.includes(p.id);
                  return (
                    <li key={p.id} className={clsx("flex items-center gap-3 rounded-xl p-2", on && "bg-brand-50")}>
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => {
                        if (on) {
                          setPlaceIds(placeIds.filter((x) => x !== p.id));
                          setMustVisit(mustVisit.filter((x) => x !== p.id));
                        } else setPlaceIds([...placeIds, p.id]);
                      }}>
                        <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")}>{on && <Check className="size-3.5" />}</span>
                        <Cover src={p.imageUrl} seed={p.name} emoji={catEmoji(p.category)} className="size-10 shrink-0 rounded-lg text-base" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted">{[p.city, p.country].filter(Boolean).join(", ")}</span>
                        </span>
                      </button>
                      <button
                        className={clsx("icon-btn size-8", must && "text-sun-500")}
                        aria-pressed={must}
                        aria-label={`Must visit ${p.name}`}
                        onClick={() => {
                          setMustVisit(must ? mustVisit.filter((x) => x !== p.id) : [...mustVisit, p.id]);
                          if (!must) setPlaceIds(placeIds.filter((x) => x !== p.id));
                        }}
                      >
                        <Star className={clsx("size-4", must && "fill-current")} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn-primary flex-[2]" onClick={() => setStep(2)}>
              Continue {placeIds.length + mustVisit.length > 0 && `· ${placeIds.length + mustVisit.length} places`}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="card space-y-5 p-5">
            <div>
              <div className="label">Interests</div>
              <div className="flex flex-wrap gap-1.5">
                {PLACE_CATEGORIES.filter((c) => c !== "other").map((c: PlaceCategory) => {
                  const on = prefs.interests.includes(c);
                  return (
                    <button key={c} className={clsx("chip", on && "chip-active")} onClick={() => setPrefs({ ...prefs, interests: on ? prefs.interests.filter((x) => x !== c) : [...prefs.interests, c] })}>
                      {catEmoji(c)} {catLabel(c)}
                    </button>
                  );
                })}
              </div>
            </div>
            <ChoiceRow label="Daily pace" options={PACES} value={prefs.pace} onChange={(v) => setPrefs({ ...prefs, pace: v })} />
            <ChoiceRow label="Getting around" options={TRAVEL_MODES} value={prefs.travelMode} onChange={(v) => setPrefs({ ...prefs, travelMode: v })} />
            <ChoiceRow label="Budget" options={BUDGETS} value={prefs.budget} onChange={(v) => setPrefs({ ...prefs, budget: v })} />
            <Field label="Where you're staying (optional)" hint="Used as the starting point for each day.">
              <input className="input" maxLength={300} value={prefs.startLocation ?? ""} onChange={(e) => setPrefs({ ...prefs, startLocation: e.target.value || null })} />
            </Field>
            <Field label="Accessibility needs (optional)">
              <input className="input" maxLength={500} value={prefs.accessibility ?? ""} placeholder="e.g. step-free access, limited walking" onChange={(e) => setPrefs({ ...prefs, accessibility: e.target.value || null })} />
            </Field>
            <Field label="Notes for the planner (optional)">
              <textarea className="input" maxLength={3000} value={prefs.notes ?? ""} placeholder="Anniversary dinner on day 2, no early mornings…" onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || null })} />
            </Field>
          </div>
          <label className="card flex items-start gap-3 p-4">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="size-4 text-sun-500" /> Suggest an itinerary with AI
              </span>
              <span className="block text-xs text-muted">
                You'll review it before anything is added. {me && `${me.usage.limits.aiGenerationsPerMonth - me.usage.aiGenerations} generations left this month.`}
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn-primary flex-[2]" onClick={submit} disabled={create.isPending}>
              {create.isPending && <Spinner className="size-4 text-white" />} Create trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceRow<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} className={clsx("chip h-9 capitalize", value === o && "chip-active")} onClick={() => onChange(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

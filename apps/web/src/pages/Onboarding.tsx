import {
  BUILD_DURATION,
  BUILD_STEPS,
  BUILD_TICK,
  BUILDING_TITLE,
  buildSteps,
  canContinue,
  COLLAGE,
  DESTINATION_COPY,
  DREAMS_COPY,
  GOAL_COPY,
  goalCaption,
  HERO_COPY,
  HERO_IMAGES,
  infoCopy,
  initialAnswers,
  INTRO_TITLE,
  onboardingPreferences,
  PHONE_BUBBLES,
  PHONE_ROWS,
  POPULAR_DESTINATIONS,
  SOCIAL_PROOF,
  stepChrome,
  stepProgress,
  summary,
  tripToStart,
  VALUES,
  type InfoArt,
  type InfoId,
  type OnboardingAnswers,
  type OnboardingIcon,
  type OnboardingOption,
  type OnboardingStep,
} from "@wayfare/shared/onboarding";
import clsx from "clsx";
import {
  ArrowDown,
  Bookmark,
  ChevronLeft,
  Circle,
  CircleCheck,
  Compass,
  Images,
  Library,
  Map as MapIcon,
  MessagesSquare,
  Minus,
  Navigation,
  Newspaper,
  Plus,
  Share2,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { siGoogle, siInstagram, siPinterest, siTiktok, siYoutube, type SimpleIcon } from "simple-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { setOnboardedLocally } from "@/lib/onboarding";
import { useUpdateProfile } from "@/lib/queries";

// The flow and copy live in @wayfare/shared/onboarding so web and mobile stay identical; this file only renders it.

const ICONS: Record<OnboardingIcon, LucideIcon | SimpleIcon> = {
  share: Share2,
  map: MapIcon,
  sparkles: Sparkles,
  tiktok: siTiktok,
  instagram: siInstagram,
  youtube: siYoutube,
  google: siGoogle,
  pinterest: siPinterest,
  news: Newspaper,
  chat: MessagesSquare,
  images: Images,
  library: Library,
  bookmark: Bookmark,
  people: Users,
  star: Star,
  compass: Compass,
};

function Icon({ name, size = 22, color = "currentColor" }: { name: OnboardingIcon; size?: number; color?: string }) {
  const icon = ICONS[name];
  if ("path" in icon)
    return (
      <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" width={size * 0.9} height={size * 0.9} fill={color}>
        <path d={icon.path} />
      </svg>
    );
  const Lucide = icon;
  return <Lucide size={size} color={color} aria-hidden />;
}

type SetAnswers = React.Dispatch<React.SetStateAction<OnboardingAnswers>>;

export function Onboarding() {
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const [a, setA] = useState<OnboardingAnswers>(initialAnswers);
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const steps = useMemo(() => buildSteps(a), [a]);
  const step = steps[i];
  const chrome = stepChrome(step);

  const moving = useRef(false);
  const go = (delta: number) => {
    if (moving.current) return; // ignore double clicks mid-transition
    moving.current = true;
    setVisible(false);
    setTimeout(() => {
      setI((n) => Math.max(0, Math.min(n + delta, steps.length - 1)));
      setVisible(true);
      moving.current = false;
      window.scrollTo(0, 0);
    }, 120);
  };
  const next = () => go(1);

  const finish = async () => {
    await update.mutateAsync({ onboarded: true, preferences: onboardingPreferences(a) });
    setOnboardedLocally(true);
    // The paywall will go here once sign-up and payments are added.
    const dest = tripToStart(a);
    navigate(dest ? `/trips/new?destination=${encodeURIComponent(dest)}` : "/", { replace: true });
  };

  return (
    <div className={clsx("min-h-dvh", step.kind === "hero" ? "bg-[#0b1f1d]" : "bg-canvas")}>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {chrome.back && (
          <div className="flex min-h-11 items-center gap-3 px-4 pt-3 pb-1">
            <button aria-label="Back" onClick={() => go(-1)} className="flex size-9 items-center justify-center rounded-full border border-line bg-white hover:bg-canvas">
              <ChevronLeft className="size-5" />
            </button>
            {chrome.progress && (
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand-700 transition-[width] duration-300" style={{ width: `${stepProgress(steps, i) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        <div className={clsx("flex flex-1 flex-col transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}>
          <StepView step={step} a={a} setA={setA} next={next} finish={finish} finishing={update.isPending} />
        </div>
      </div>
    </div>
  );
}

function StepView({ step, a, setA, next, finish, finishing }: { step: OnboardingStep; a: OnboardingAnswers; setA: SetAnswers; next: () => void; finish: () => void; finishing: boolean }) {
  switch (step.kind) {
    case "hero":
      return <Hero onStart={next} />;
    case "intro":
      return <Intro onNext={next} />;
    case "single": {
      const current = a[step.key];
      return (
        <Question title={step.title} subtitle={step.subtitle}>
          <div role="radiogroup" className="flex flex-col gap-2.5">
            {step.options.map((o) => (
              <OptionCard
                key={String(o.value)}
                option={o}
                selected={current === o.value}
                onPress={() => {
                  setA((prev) => ({ ...prev, [step.key]: o.value }));
                  setTimeout(next, 220);
                }}
              />
            ))}
          </div>
        </Question>
      );
    }
    case "multi": {
      const selected = a[step.key] as string[];
      const toggle = (v: string) => setA((prev) => ({ ...prev, [step.key]: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] }));
      return (
        <Question title={step.title} subtitle={step.subtitle} footer={<Cta title="Continue" onPress={next} disabled={!canContinue(step, a)} />}>
          <div className={step.grid ? "grid grid-cols-3 gap-2.5" : "flex flex-col gap-2.5"}>
            {step.options.map((o) => (
              <OptionCard key={o.value} option={o} selected={selected.includes(o.value)} onPress={() => toggle(o.value)} multi compact={step.grid} />
            ))}
          </div>
        </Question>
      );
    }
    case "destination":
      return (
        <Question title={DESTINATION_COPY.title} subtitle={DESTINATION_COPY.subtitle} footer={<Cta title="Continue" onPress={next} disabled={!canContinue(step, a)} />}>
          <input
            autoFocus
            value={a.destination}
            onChange={(e) => setA((p) => ({ ...p, destination: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && canContinue(step, a) && next()}
            placeholder={DESTINATION_COPY.placeholder}
            aria-label={DESTINATION_COPY.title}
            className="h-14 w-full rounded-[18px] border-2 border-brand-700 bg-white px-4 text-lg outline-none"
          />
          <p className="mt-2 text-[15px] text-muted">{DESTINATION_COPY.popular}</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_DESTINATIONS.slice(0, 8).map((d) => (
              <Pill key={d} label={d} on={a.destination === d} onPress={() => setA((p) => ({ ...p, destination: d }))} />
            ))}
          </div>
        </Question>
      );
    case "dreams": {
      const toggle = (d: string) => setA((p) => ({ ...p, dreams: p.dreams.includes(d) ? p.dreams.filter((x) => x !== d) : [...p.dreams, d] }));
      return (
        <Question title={DREAMS_COPY.title} subtitle={DREAMS_COPY.subtitle} footer={<Cta title={a.dreams.length ? "Continue" : "Skip for now"} onPress={next} />}>
          <div className="flex flex-wrap gap-2">
            {POPULAR_DESTINATIONS.map((d) => (
              <Pill key={d} label={d} on={a.dreams.includes(d)} onPress={() => toggle(d)} />
            ))}
          </div>
        </Question>
      );
    }
    case "info":
      return <Info id={step.id} a={a} next={next} />;
    case "goal":
      return <Goal a={a} setA={setA} next={next} />;
    case "building":
      return <Building onDone={next} />;
    case "summary":
      return <Summary a={a} onStart={finish} busy={finishing} />;
  }
}

// --- Building blocks -----------------------------------------------------------------------------

function Question({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="flex-1 px-[22px] pt-4 pb-8">
        <h1 className="text-[28px] leading-[34px] font-extrabold">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-[22px] flex flex-col gap-2.5">{children}</div>
      </div>
      {footer && <Footer>{footer}</Footer>}
    </>
  );
}

/** Sticks the main button to the bottom of the screen, like the mobile app. */
function Footer({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 bg-gradient-to-t from-canvas from-70% to-transparent px-[22px] pt-4 pb-4">{children}</div>;
}

function OptionCard({ option, selected, onPress, multi, compact }: { option: OnboardingOption<unknown>; selected: boolean; onPress: () => void; multi?: boolean; compact?: boolean }) {
  return (
    <button
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onPress}
      className={clsx(
        "flex items-center rounded-[18px] border-2 bg-white text-left transition active:scale-[0.98]",
        compact ? "flex-col justify-center gap-1.5 px-1.5 py-3.5" : "min-h-[60px] gap-3.5 p-4",
        selected ? "border-brand-700 bg-brand-50" : "border-line hover:border-brand-200",
      )}
    >
      {option.emoji ? (
        <span className={compact ? "text-[26px]" : "text-[22px]"}>{option.emoji}</span>
      ) : option.icon ? (
        <span className={selected ? "text-brand-700" : "text-ink"}>
          <Icon name={option.icon} />
        </span>
      ) : null}
      <span className={clsx(!compact && "flex-1")}>
        <span className={clsx("block font-semibold", compact ? "text-center text-sm" : "text-base", selected ? "text-brand-800" : "text-ink")}>{option.label}</span>
        {option.hint && <span className="mt-0.5 block text-[13px] text-muted">{option.hint}</span>}
      </span>
      {!compact && multi && (selected ? <CircleCheck className="size-[22px] text-brand-700" /> : <Circle className="size-[22px] text-slate-300" />)}
    </button>
  );
}

function Cta({ title, onPress, disabled, light }: { title: string; onPress: () => void; disabled?: boolean; light?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onPress}
      className={clsx(
        "h-14 w-full rounded-[18px] text-[17px] font-bold transition enabled:active:opacity-85 disabled:opacity-40",
        light ? "bg-white text-ink hover:bg-slate-100" : "bg-brand-700 text-white enabled:hover:bg-brand-800",
      )}
    >
      {title}
    </button>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <button onClick={onPress} aria-pressed={on} className={clsx("h-[42px] rounded-full border-2 px-4 font-semibold", on ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:border-brand-200")}>
      {label}
    </button>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex gap-2.5 px-2.5" aria-hidden>
        {COLLAGE.map((col, ci) => (
          <div key={ci} className="flex flex-1 animate-[wf-drift_18s_ease-in-out_infinite] flex-col gap-2.5" style={{ marginTop: [-30, -90, -10][ci], animationDirection: ci === 1 ? "reverse" : "normal" }}>
            {col.map((tile) => (
              <div key={tile.uri} className="relative h-[210px] shrink-0 overflow-hidden rounded-[20px] bg-[#1e3a37]">
                <img src={tile.uri} alt="" className="absolute inset-0 size-full object-cover" />
                {tile.tag && <span className="absolute bottom-2 left-2 rounded-[10px] bg-white/90 px-2 py-1 text-[10px] font-bold text-ink">{tile.tag}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-30% via-[#0b1f1d]/70 via-55% to-[#0b1f1d] to-75%" />
      <div className="relative mt-auto flex flex-col gap-3.5 p-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700">
            <Navigation className="size-[18px] fill-white text-white" />
          </span>
          <span className="text-xl font-extrabold text-white">Wayfare</span>
        </div>
        <h1 className="text-[34px] leading-10 font-extrabold whitespace-pre-line text-white">{HERO_COPY.title}</h1>
        <p className="text-[15px] leading-[21px] text-slate-300">{HERO_COPY.body}</p>
        <Cta title="Get started" onPress={onStart} light />
      </div>
    </div>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="flex-1 px-[22px] pt-2 pb-8">
        <div className="mb-[18px] flex gap-2">
          {HERO_IMAGES.map((u, n) => (
            <img key={u} src={u} alt="" className="h-[130px] min-w-0 flex-1 rounded-[18px] bg-line object-cover" style={{ transform: `rotate(${(n - 1) * 4}deg)`, marginTop: n === 1 ? 0 : 14 }} />
          ))}
        </div>
        <h1 className="text-[28px] leading-[34px] font-extrabold">{INTRO_TITLE}</h1>
        <div className="mt-5 flex flex-col gap-4">
          {VALUES.map((v) => (
            <div key={v.title} className="flex gap-3.5">
              <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-brand-50 text-brand-700">
                <Icon name={v.icon} size={20} />
              </span>
              <div>
                <p className="text-base font-bold">{v.title}</p>
                <p className="mt-0.5 leading-[19px] text-muted">{v.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-[26px] mb-3.5 flex rounded-[18px] border border-line bg-white py-3.5">
          {SOCIAL_PROOF.stats.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center">
              <span className="text-[22px] font-extrabold">
                {s.value}
                {s.star ? " ★" : ""}
              </span>
              <span className="text-xs text-muted">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="-mx-[22px] flex snap-x gap-2.5 overflow-x-auto px-[22px] py-1 [scrollbar-width:none]">
          {SOCIAL_PROOF.reviews.map((r, n) => (
            <figure key={n} className="flex w-[250px] shrink-0 snap-start flex-col gap-1.5 rounded-[18px] border border-line bg-white p-3.5">
              <span className="tracking-[2px] text-amber-500" aria-label={`${r.rating} stars`}>
                {"★".repeat(r.rating)}
              </span>
              <blockquote className="leading-[19px]">“{r.text}”</blockquote>
              <figcaption className="text-xs font-semibold text-muted">{r.name}</figcaption>
            </figure>
          ))}
        </div>
        {SOCIAL_PROOF.isPlaceholder && <p className="mt-2.5 text-center text-[11px] text-sun-500">{SOCIAL_PROOF.note}</p>}
      </div>
      <Footer>
        <Cta title="Continue" onPress={onNext} />
      </Footer>
    </>
  );
}

function Info({ id, a, next }: { id: InfoId; a: OnboardingAnswers; next: () => void }) {
  const c = infoCopy(id, a);
  const hasArt = c.art.kind !== "none";
  return (
    <>
      <div className={clsx("flex flex-1 flex-col px-[22px] pt-4 pb-8", hasArt && "justify-center")}>
        {hasArt && (
          <div className="mb-7 flex justify-center">
            <Art art={c.art} />
          </div>
        )}
        <h1 className={clsx("text-[28px] leading-[34px] font-extrabold", hasArt && "text-center")}>{c.title}</h1>
        {c.body && <p className="mt-2 text-center text-base leading-[23px] text-muted">{c.body}</p>}
        {c.fixes && (
          <div className="mt-4 flex flex-col gap-3">
            {c.fixes.map((f) => (
              <div key={f.text} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-brand-50 text-brand-700">
                  <Icon name={f.icon} size={20} />
                </span>
                <div>
                  <p className="text-xs text-muted line-through">{f.from}</p>
                  <p className="leading-[19px] font-semibold">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer>
        <Cta title="Continue" onPress={next} />
      </Footer>
    </>
  );
}

function Art({ art }: { art: InfoArt }) {
  if (art.kind === "phone") return <PhoneArt destination={art.destination} />;
  if (art.kind === "funnel")
    return (
      <div className="flex flex-col items-center gap-3.5">
        <div className="flex gap-2.5">
          {art.icons.map((ic) => (
            <span key={ic} className="flex size-[52px] items-center justify-center rounded-[18px] border border-line bg-white text-ink">
              <Icon name={ic} />
            </span>
          ))}
        </div>
        <ArrowDown className="size-[26px] text-muted" />
        <span className="flex size-[76px] items-center justify-center rounded-3xl bg-brand-700">
          <MapIcon className="size-9 text-white" />
        </span>
      </div>
    );
  return null;
}

/** A phone showing a saved-places list, with the apps people save from floating around it. */
function PhoneArt({ destination }: { destination?: string }) {
  return (
    <div className="relative flex h-[320px] w-[300px] items-center justify-center">
      <div className="flex h-[300px] w-[170px] flex-col gap-1.5 rounded-[30px] border-[6px] border-ink bg-white p-2.5">
        <img src={HERO_IMAGES[0]} alt="" className="h-[120px] w-full rounded-[14px] object-cover" />
        <p className="mt-2 truncate font-extrabold">{destination ? `Trip to ${destination}` : "My wishlist"}</p>
        {PHONE_ROWS.map((t) => (
          <p key={t} className="truncate rounded-lg bg-canvas px-2 py-1.5 text-[11px]">
            {t}
          </p>
        ))}
      </div>
      {PHONE_BUBBLES.map((b, n) => (
        <span
          key={b.icon}
          className="absolute top-1/2 left-1/2 -mt-6 -ml-6 flex size-12 items-center justify-center rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12)]"
          style={{ translate: `${b.x}px ${b.y}px` }}
        >
          <span className="flex animate-[wf-float_3.6s_ease-in-out_infinite]" style={{ animationDirection: n % 2 ? "reverse" : "normal" }}>
            <Icon name={b.icon} color={b.color} />
          </span>
        </span>
      ))}
    </div>
  );
}

function Goal({ a, setA, next }: { a: OnboardingAnswers; setA: SetAnswers; next: () => void }) {
  const n = a.tripsGoal;
  const set = (v: number) => setA((p) => ({ ...p, tripsGoal: Math.max(GOAL_COPY.min, Math.min(GOAL_COPY.max, v)) }));
  return (
    <Question title={GOAL_COPY.title} footer={<Cta title={GOAL_COPY.cta} onPress={next} />}>
      <div className="mt-5 flex flex-col items-center gap-4">
        <div className="flex items-center gap-7">
          <button aria-label="Fewer trips" onClick={() => set(n - 1)} className="flex size-14 items-center justify-center rounded-full border-2 border-line bg-white hover:border-brand-200">
            <Minus className="size-[26px]" />
          </button>
          <span className="min-w-[90px] text-center text-7xl font-extrabold text-brand-700" aria-live="polite">
            {n}
          </span>
          <button aria-label="More trips" onClick={() => set(n + 1)} className="flex size-14 items-center justify-center rounded-full border-2 border-line bg-white hover:border-brand-200">
            <Plus className="size-[26px]" />
          </button>
        </div>
        <p className="text-center text-[15px] text-muted">{goalCaption(n)}</p>
      </div>
    </Question>
  );
}

function Building({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0);
  const [started, setStarted] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    const timers = BUILD_STEPS.map((_, n) => setTimeout(() => setDone(n + 1), BUILD_TICK * (n + 1)));
    const end = setTimeout(() => doneRef.current(), BUILD_DURATION);
    return () => {
      cancelAnimationFrame(raf);
      [...timers, end].forEach(clearTimeout);
    };
  }, []);
  return (
    <div className="flex flex-1 flex-col justify-center gap-[26px] p-7">
      <h1 className="text-center text-[28px] leading-[34px] font-extrabold">{BUILDING_TITLE}</h1>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand-700 ease-in-out" style={{ width: started ? "100%" : "0%", transition: `width ${BUILD_DURATION - 400}ms` }} />
      </div>
      <ul className="flex flex-col gap-3.5">
        {BUILD_STEPS.map((t, n) => (
          <li key={t} className={clsx("flex items-center gap-3 text-base transition-opacity", n <= done ? "opacity-100" : "opacity-35")}>
            {n < done ? <CircleCheck className="size-[22px] text-brand-700" /> : <Circle className="size-[22px] text-muted" />}
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Summary({ a, onStart, busy }: { a: OnboardingAnswers; onStart: () => void; busy: boolean }) {
  const sum = summary(a);
  return (
    <>
      <div className="flex-1 px-[22px] pt-7 pb-8">
        <p className="text-center text-[15px] text-muted">{sum.kicker}</p>
        <div className="mt-3.5 flex flex-col items-center gap-1.5 rounded-[28px] bg-brand-700 p-6 text-center">
          <span className="text-[52px] leading-none">{sum.persona.emoji}</span>
          <p className="text-[26px] font-extrabold text-white">{sum.persona.title}</p>
          <p className="text-brand-100">{sum.persona.line}</p>
          <div className="mt-1.5 flex flex-wrap justify-center gap-2">
            {sum.traits.map((t) => (
              <span key={t} className="rounded-xl bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">
                {t}
              </span>
            ))}
          </div>
        </div>
        <h2 className="mt-6 text-xl font-extrabold">{sum.planTitle}</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {sum.plan.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[15px] leading-[21px]">
              <CircleCheck className="size-[22px] shrink-0 text-brand-700" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <Footer>
        <Cta title={busy ? "Getting things ready…" : sum.cta} onPress={onStart} disabled={busy} />
      </Footer>
    </>
  );
}

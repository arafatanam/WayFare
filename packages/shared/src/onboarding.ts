// The onboarding quiz, shared by the web and mobile apps so both run the identical flow.
// Each app only renders it: steps, branching, copy and the personalised summary all live here.
import {
  BUDGETS,
  CATEGORY_META,
  COMPANIONS,
  INSPIRATION_SOURCES,
  PACES,
  PAIN_POINTS,
  PLANNING_TIMES,
  TRAVEL_FREQUENCIES,
  TRAVEL_PURPOSES,
  type PlaceCategory,
  type TravelProfile,
  type UserPreferences,
} from "./index";

/** Platform-neutral icon names; each app maps them to its icon set. */
export type OnboardingIcon =
  | "share"
  | "map"
  | "sparkles"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "google"
  | "pinterest"
  | "news"
  | "chat"
  | "images"
  | "library"
  | "bookmark"
  | "people"
  | "star"
  | "compass";

export interface OnboardingOption<V> {
  value: V;
  label: string;
  hint?: string;
  emoji?: string;
  icon?: OnboardingIcon;
}

type Frequency = (typeof TRAVEL_FREQUENCIES)[number];
type Purpose = (typeof TRAVEL_PURPOSES)[number];
type Companion = (typeof COMPANIONS)[number];
type Source = (typeof INSPIRATION_SOURCES)[number];
type Pain = (typeof PAIN_POINTS)[number];
type PlanningTime = (typeof PLANNING_TIMES)[number];
type Pace = (typeof PACES)[number];
type Budget = (typeof BUDGETS)[number];

export interface OnboardingAnswers {
  hasTrip?: boolean;
  destination: string;
  when?: string;
  dreams: string[];
  frequency?: Frequency;
  purposes: Purpose[];
  companions?: Companion;
  interests: PlaceCategory[];
  pace?: Pace;
  budget?: Budget;
  sources: Source[];
  pains: Pain[];
  planningTime?: PlanningTime;
  tripsGoal: number;
}

export const initialAnswers = (): OnboardingAnswers => ({ destination: "", dreams: [], purposes: [], interests: [], sources: [], pains: [], tripsGoal: 3 });

// --- Content --------------------------------------------------------------------------------------

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=500&q=70&auto=format&fit=crop`;

/** Get Started collage: three columns of trip snapshots. */
export const COLLAGE: { uri: string; tag?: string }[][] = [
  [{ uri: img("1507525428034-b723cf961d3e"), tag: "🏖️ Saved from TikTok" }, { uri: img("1540959733332-eab4deabeeaf") }, { uri: img("1476514525535-07fb3b4ae5f1"), tag: "Day 2 · 4 stops" }],
  [{ uri: img("1502602898657-3e91760cbb34") }, { uri: img("1537996194471-e657df975ab4"), tag: "📍 12 places" }, { uri: img("1533105079780-92b9be482077") }],
  [{ uri: img("1469854523086-cc02fe5d8800"), tag: "✈️ In 3 weeks" }, { uri: img("1493976040374-85c8e12f0c0e") }, { uri: img("1501594907352-04cda38ebc29"), tag: "📸 From a screenshot" }],
];
export const HERO_IMAGES = [img("1488646953014-85cb44e25828"), img("1530789253388-582c481c54b0"), img("1528127269322-539801943592")];

export const HERO_COPY = {
  title: "Every place you've saved,\nfinally in one trip.",
  body: "Save from TikTok, Instagram, Maps and screenshots. Plan your trip in minutes.",
};

export const INTRO_TITLE = "Wayfare turns travel inspiration into real trips";
export const VALUES: { icon: OnboardingIcon; title: string; body: string }[] = [
  { icon: "share", title: "Save from anywhere", body: "Share a TikTok, Reel, link or screenshot and the places are pulled out for you." },
  { icon: "map", title: "See it all on one map", body: "Every place you've saved, organized by city and collection." },
  { icon: "sparkles", title: "A plan in seconds", body: "Turn your saves into a day-by-day itinerary you can edit and share." },
];

/**
 * Social proof on the brand intro screen.
 * PLACEHOLDER: these are sample figures and reviews for R&D only. Replace them with real numbers and real,
 * attributable reviews (and set isPlaceholder to false) before launch. Publishing invented stats or reviews
 * is misleading to users and breaks consumer-protection and app store rules.
 */
export const SOCIAL_PROOF = {
  isPlaceholder: true,
  note: "Sample stats and reviews — replace with real ones before launch.",
  stats: [
    { value: "3M+", label: "travelers", star: false },
    { value: "3M+", label: "trips created", star: false },
    { value: "4.9", label: "app rating", star: true },
  ],
  reviews: [
    { name: "Sample review", rating: 5, text: "I finally used the 200 TikToks I'd saved. Our Lisbon trip basically planned itself." },
    { name: "Sample review", rating: 5, text: "Screenshots from Instagram straight onto a map. My friends and I planned Bali together in one evening." },
    { name: "Sample review", rating: 5, text: "The day-by-day plan grouped everything by neighborhood. No more zig-zagging across the city." },
  ],
};

export const HAS_TRIP: OnboardingOption<boolean>[] = [
  { value: true, label: "Yes, I have a trip", emoji: "🧳" },
  { value: false, label: "No, not yet", emoji: "💭" },
];

export const POPULAR_DESTINATIONS = ["Tokyo", "Paris", "Bali", "Lisbon", "New York", "Rome", "Barcelona", "Seoul", "Istanbul", "Mexico City", "London", "Bangkok"];

export const WHEN: OnboardingOption<string>[] = [
  { value: "this_month", label: "This month", emoji: "🔥" },
  { value: "next_month", label: "Next month", emoji: "📅" },
  { value: "2_3_months", label: "In 2–3 months", emoji: "🗓️" },
  { value: "later", label: "Later this year", emoji: "🌤️" },
  { value: "unsure", label: "Not sure yet", emoji: "🤷" },
];

export const FREQUENCY: OnboardingOption<Frequency>[] = [
  { value: "few_times_year", label: "A few times a year", emoji: "✈️" },
  { value: "once_year", label: "Once a year", emoji: "🗓️" },
  { value: "every_couple_years", label: "Every couple of years", emoji: "⏳" },
  { value: "rarely_dreaming", label: "Rarely, but I love dreaming about it", emoji: "💭" },
];

export const PURPOSES: OnboardingOption<Purpose>[] = [
  { value: "relax", label: "Rest & recharge", emoji: "🌴" },
  { value: "explore_cities", label: "Exploring new cities", emoji: "🏙️" },
  { value: "food", label: "Food & drink", emoji: "🍜" },
  { value: "adventure", label: "Adventure", emoji: "🧗" },
  { value: "culture", label: "Culture & history", emoji: "🏛️" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "family", label: "Family time", emoji: "👨‍👩‍👧" },
  { value: "romance", label: "Romantic getaways", emoji: "💕" },
  { value: "work", label: "Work trips", emoji: "💼" },
];

export const COMPANIONS_OPTIONS: OnboardingOption<Companion>[] = [
  { value: "solo", label: "Solo", emoji: "🎒" },
  { value: "partner", label: "With my partner", emoji: "💑" },
  { value: "friends", label: "With friends", emoji: "👯" },
  { value: "family", label: "With family", emoji: "👨‍👩‍👧" },
  { value: "mixed", label: "It depends on the trip", emoji: "🔀" },
];

const INTEREST_KEYS: PlaceCategory[] = ["food", "cafe", "bar", "nightlife", "nature", "beach", "outdoors", "viewpoint", "history", "museum", "architecture", "shopping"];
export const INTERESTS: OnboardingOption<PlaceCategory>[] = INTEREST_KEYS.map((k) => ({ value: k, label: CATEGORY_META[k].label, emoji: CATEGORY_META[k].emoji }));

export const PACE: OnboardingOption<Pace>[] = [
  { value: "relaxed", label: "Slow & easy", hint: "A few stops a day and plenty of downtime", emoji: "🐢" },
  { value: "balanced", label: "Balanced", hint: "A good mix of plans and wandering", emoji: "⚖️" },
  { value: "packed", label: "Packed", hint: "See as much as possible", emoji: "⚡" },
];

export const BUDGET: OnboardingOption<Budget>[] = [
  { value: "budget", label: "Smart & budget-friendly", emoji: "💸" },
  { value: "moderate", label: "Comfortable mid-range", emoji: "💳" },
  { value: "premium", label: "Treat myself", emoji: "✨" },
];

export const SOURCES: OnboardingOption<Source>[] = [
  { value: "tiktok", label: "TikTok", icon: "tiktok" },
  { value: "instagram", label: "Instagram", icon: "instagram" },
  { value: "youtube", label: "YouTube", icon: "youtube" },
  { value: "google_maps", label: "Google Maps", icon: "google" },
  { value: "pinterest", label: "Pinterest", icon: "pinterest" },
  { value: "blogs", label: "Blogs & articles", icon: "news" },
  { value: "friends", label: "Friends' recommendations", icon: "chat" },
  { value: "screenshots", label: "Screenshots in my camera roll", icon: "images" },
];

export const PAINS: OnboardingOption<Pain>[] = [
  { value: "scattered", label: "My ideas are scattered across apps", emoji: "🧩" },
  { value: "forget", label: "I forget the places I've saved", emoji: "🫥" },
  { value: "too_long", label: "Planning takes way too long", emoji: "⏰" },
  { value: "routing", label: "Working out what's close to what", emoji: "🗺️" },
  { value: "group", label: "Planning with friends is chaotic", emoji: "🤯" },
  { value: "overwhelmed", label: "Too many options, I get overwhelmed", emoji: "😵‍💫" },
  { value: "missing_gems", label: "I worry I'll miss the best spots", emoji: "💎" },
];

/** How Wayfare answers each pain point; shown back to the user after the planning questions. */
export const PAIN_FIXES: Record<Pain, { icon: OnboardingIcon; text: string }> = {
  scattered: { icon: "library", text: "Share links and screenshots from any app and the places land in one library." },
  forget: { icon: "bookmark", text: "Every place keeps its photo, where you found it and your notes." },
  too_long: { icon: "sparkles", text: "Generate a day-by-day plan in seconds, then tweak it." },
  routing: { icon: "map", text: "See everything on a map, with nearby stops grouped into the same day." },
  group: { icon: "people", text: "Invite friends to plan together and see changes live." },
  overwhelmed: { icon: "star", text: "Collections and must-visit flags keep your shortlist short." },
  missing_gems: { icon: "compass", text: "Explore picks matched to what you love." },
};

export const PLANNING_TIME: OnboardingOption<PlanningTime>[] = [
  { value: "hours", label: "A few hours", emoji: "⏱️" },
  { value: "days", label: "A few days", emoji: "📆" },
  { value: "weeks", label: "Weeks, it's a whole project", emoji: "🗂️" },
  { value: "dont_plan", label: "I don't really plan", emoji: "🎲" },
];

/** Floating apps around the phone illustration, positioned relative to its center (px). */
export const PHONE_BUBBLES: { icon: OnboardingIcon; color: string; x: number; y: number }[] = [
  { icon: "tiktok", color: "#111827", x: -120, y: -70 },
  { icon: "instagram", color: "#e1306c", x: 118, y: -90 },
  { icon: "youtube", color: "#ef4444", x: -130, y: 70 },
  { icon: "pinterest", color: "#e60023", x: 122, y: 40 },
  { icon: "images", color: "#f97316", x: 0, y: 150 },
];
export const PHONE_ROWS = ["🍜 Ramen spot from TikTok", "🌄 Sunset viewpoint", "☕ Café from a Reel"];

export const BUILD_STEPS = ["Analyzing your travel style", "Matching places to your interests", "Setting up your map", "Preparing your first plan"];
/** Total time on the "building your profile" screen, ms. Each BUILD_STEPS item ticks off every BUILD_TICK ms. */
export const BUILD_DURATION = 4600;
export const BUILD_TICK = 900;

// --- Flow -----------------------------------------------------------------------------------------

export type SingleKey = "hasTrip" | "when" | "frequency" | "companions" | "pace" | "budget" | "planningTime";
export type MultiKey = "purposes" | "interests" | "sources" | "pains";
export type InfoId = "yesTrip" | "noTrip" | "scattered" | "fixes";

export type OnboardingStep =
  | { kind: "hero" | "intro" | "destination" | "dreams" | "goal" | "building" | "summary" }
  | { kind: "single"; key: SingleKey; title: string; subtitle?: string; options: OnboardingOption<unknown>[] }
  | { kind: "multi"; key: MultiKey; title: string; subtitle?: string; options: OnboardingOption<string>[]; grid?: boolean }
  | { kind: "info"; id: InfoId };

/** The quiz. The trip branch depends only on an earlier answer, so going back never reshuffles past steps. */
export function buildSteps(a: OnboardingAnswers): OnboardingStep[] {
  const branch: OnboardingStep[] =
    a.hasTrip === true
      ? [{ kind: "destination" }, { kind: "single", key: "when", title: "When are you going?", options: WHEN }, { kind: "info", id: "yesTrip" }]
      : [{ kind: "info", id: "noTrip" }, { kind: "dreams" }];
  return [
    { kind: "hero" },
    { kind: "intro" },
    { kind: "single", key: "hasTrip", title: "Do you have a trip coming up?", options: HAS_TRIP },
    ...branch,
    { kind: "single", key: "frequency", title: "How often do you travel?", options: FREQUENCY },
    { kind: "multi", key: "purposes", title: "What do you usually travel for?", subtitle: "Pick all that apply", options: PURPOSES },
    { kind: "single", key: "companions", title: "Who do you usually travel with?", options: COMPANIONS_OPTIONS },
    { kind: "multi", key: "interests", title: "What kind of places do you love?", subtitle: "We'll tailor Explore and your plans to these", options: INTERESTS, grid: true },
    { kind: "single", key: "pace", title: "What pace feels right on a trip?", options: PACE },
    { kind: "single", key: "budget", title: "What's your travel budget style?", options: BUDGET },
    { kind: "multi", key: "sources", title: "Where do you find travel ideas?", subtitle: "Pick all that apply", options: SOURCES },
    { kind: "info", id: "scattered" },
    { kind: "multi", key: "pains", title: "What's the hardest part of planning a trip?", subtitle: "Be honest, pick all that apply", options: PAINS },
    { kind: "single", key: "planningTime", title: "How long does planning a trip usually take you?", options: PLANNING_TIME },
    { kind: "info", id: "fixes" },
    { kind: "goal" },
    { kind: "building" },
    { kind: "summary" },
  ];
}

/** 0..1 progress for the top bar; the hero, intro, building and summary screens don't count as questions. */
export function stepProgress(steps: OnboardingStep[], index: number) {
  const counted = steps.filter((s) => !["hero", "intro", "building", "summary"].includes(s.kind)).length;
  return Math.min(1, Math.max(0, (index - 1) / counted));
}

/** Whether the screen shows the back button + progress bar (and whether the bar is visible). */
export const stepChrome = (s: OnboardingStep) => ({ back: !["hero", "building", "summary"].includes(s.kind), progress: !["hero", "intro", "building", "summary"].includes(s.kind) });

export const canContinue = (s: OnboardingStep, a: OnboardingAnswers) =>
  s.kind === "multi" ? (a[s.key] as string[]).length > 0 : s.kind === "destination" ? a.destination.trim().length >= 2 : true;

export const DESTINATION_COPY = { title: "Where are you headed?", subtitle: "A city, country or region", placeholder: "e.g. Tokyo", popular: "Popular right now" };
export const DREAMS_COPY = { title: "Where are you dreaming of going?", subtitle: "Pick a few. We'll start your wishlist" };
export const GOAL_COPY = { title: "How many trips would you like to take in the next 12 months?", cta: "Set my goal", min: 1, max: 12 };
export const BUILDING_TITLE = "Building your travel profile…";

export function goalCaption(n: number) {
  if (n === 1) return "One trip. Let's make it unforgettable.";
  const every = Math.round(12 / n);
  return every >= 1 ? `That's about one every ${every} month${every === 1 ? "" : "s"}. We'll help you make each one count.` : "Ambitious! We'll keep the planning quick.";
}

const sourceLabel = (v: string) => SOURCES.find((s) => s.value === v)?.label.replace(" in my camera roll", "").replace("Friends' recommendations", "friends") ?? v;
export const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export type InfoArt = { kind: "phone"; destination?: string } | { kind: "funnel"; icons: OnboardingIcon[] } | { kind: "none" };

/** Copy for the interstitial screens, personalised with earlier answers. */
export function infoCopy(id: InfoId, a: OnboardingAnswers): { art: InfoArt; title: string; body?: string; fixes?: { from: string; icon: OnboardingIcon; text: string }[] } {
  const dest = a.destination.trim();
  if (id === "noTrip")
    return {
      art: { kind: "phone" },
      title: "No worries, let's save ideas before you're ready to go",
      body: "Let's build your travel profile so we can show you things you'll actually love.",
    };
  if (id === "yesTrip") return { art: { kind: "phone", destination: dest }, title: `${dest}, great choice!`, body: "Let's get it ready. A few questions so your plan fits the way you travel." };
  if (id === "scattered") {
    const n = a.sources.length;
    const picked = SOURCES.filter((s) => a.sources.includes(s.value)).slice(0, 5);
    return {
      art: { kind: "funnel", icons: (picked.length ? picked : SOURCES.slice(0, 4)).map((s) => s.icon!) },
      title: n >= 2 ? `Your ideas live in ${n} different places` : "Your ideas deserve one home",
      body:
        n >= 2
          ? `Saving from ${listJoin(a.sources.slice(0, 3).map(sourceLabel))} means digging through apps when it's time to plan. With Wayfare, share any link or screenshot and the places land on one map.`
          : "Share any link or screenshot to Wayfare and the places land on one map, ready to plan.",
    };
  }
  const pains: Pain[] = a.pains.length ? a.pains : ["scattered", "too_long", "routing"];
  return {
    art: { kind: "none" },
    title: a.planningTime === "weeks" || a.planningTime === "days" ? `Planning takes you ${a.planningTime}. Let's make it faster.` : "Here's how Wayfare helps",
    fixes: pains.map((p) => ({ from: PAINS.find((x) => x.value === p)!.label, ...PAIN_FIXES[p] })),
  };
}

/** A friendly label for the summary screen, derived from what the user picked. */
export function persona(purposes: string[], interests: string[]) {
  const has = (...k: string[]) => k.some((x) => purposes.includes(x) || interests.includes(x));
  if (has("food", "cafe")) return { title: "The Food Explorer", emoji: "🍜", line: "You plan trips around the next great meal." };
  if (has("adventure", "outdoors", "nature")) return { title: "The Adventurer", emoji: "🥾", line: "Trails, views and a bit of adrenaline." };
  if (has("culture", "history", "museum", "architecture")) return { title: "The Culture Seeker", emoji: "🏛️", line: "You want the stories behind every place." };
  if (has("relax", "beach")) return { title: "The Slow Traveler", emoji: "🌴", line: "Good light, long lunches, no rush." };
  if (has("nightlife", "bar")) return { title: "The Night Owl", emoji: "🌙", line: "Cities are best after dark." };
  if (has("explore_cities", "shopping")) return { title: "The City Hopper", emoji: "🏙️", line: "Neighborhoods, markets and hidden corners." };
  return { title: "The Curious Wanderer", emoji: "🧭", line: "A little bit of everything." };
}

/** The final "your travel profile" screen. */
export function summary(a: OnboardingAnswers) {
  const pace = PACE.find((x) => x.value === a.pace)?.label.toLowerCase() ?? "balanced";
  const loves = a.interests.slice(0, 3).map((k) => CATEGORY_META[k].label.toLowerCase());
  const sources = a.sources.slice(0, 2).map(sourceLabel);
  const dest = a.destination.trim();
  return {
    kicker: "Your travel profile is ready",
    persona: persona(a.purposes, a.interests),
    traits: [
      COMPANIONS_OPTIONS.find((x) => x.value === a.companions)?.label,
      BUDGET.find((x) => x.value === a.budget)?.label,
      FREQUENCY.find((x) => x.value === a.frequency)?.label,
    ].filter((t): t is string => !!t),
    planTitle: "Your plan",
    plan: [
      sources.length ? `Save the spots you find on ${listJoin(sources)} in one tap` : "Save places from any app in one tap",
      a.hasTrip && dest
        ? `Turn ${dest} into a ${pace} day-by-day plan`
        : a.dreams.length
          ? `Start wishlists for ${listJoin(a.dreams.slice(0, 2))}`
          : `Build ${pace} day-by-day plans for your next trip`,
      loves.length ? `Discover ${listJoin(loves)} picked for you` : "Discover places picked for you",
      `Reach your goal of ${a.tripsGoal} trip${a.tripsGoal === 1 ? "" : "s"} this year`,
    ],
    cta: "Start planning",
  };
}

/** What gets saved to the profile (PATCH /me/profile `preferences`). */
export function onboardingPreferences(a: OnboardingAnswers): { travelProfile: TravelProfile; interests: PlaceCategory[]; pace: UserPreferences["pace"] } {
  return {
    travelProfile: {
      hasUpcomingTrip: a.hasTrip,
      upcomingDestination: a.destination.trim() || undefined,
      upcomingWhen: a.when,
      frequency: a.frequency,
      purposes: a.purposes,
      companions: a.companions,
      budget: a.budget,
      inspirationSources: a.sources,
      painPoints: a.pains,
      planningTime: a.planningTime,
      tripsGoal: a.tripsGoal,
      dreamDestinations: a.dreams,
    },
    interests: a.interests,
    pace: a.pace ?? "balanced",
  };
}

/** Where to go after the quiz: straight into creating the trip they told us about, if any. */
export const tripToStart = (a: OnboardingAnswers) => (a.hasTrip ? a.destination.trim() || undefined : undefined);

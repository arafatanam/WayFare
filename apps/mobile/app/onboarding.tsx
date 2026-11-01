import Ionicons from "@expo/vector-icons/Ionicons";
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeOnboarding } from "@/onboarding";
import { colors } from "@/ui";
import { useAuth } from "./_layout";

// The flow and copy live in @wayfare/shared/onboarding so web and mobile stay identical; this file only renders it.

const ICONS: Record<OnboardingIcon, keyof typeof Ionicons.glyphMap> = {
  share: "share-social-outline",
  map: "map-outline",
  sparkles: "sparkles-outline",
  tiktok: "logo-tiktok",
  instagram: "logo-instagram",
  youtube: "logo-youtube",
  google: "logo-google",
  pinterest: "logo-pinterest",
  news: "newspaper-outline",
  chat: "chatbubbles-outline",
  images: "images-outline",
  library: "albums-outline",
  bookmark: "bookmark-outline",
  people: "people-outline",
  star: "star-outline",
  compass: "compass-outline",
};
const Icon = ({ name, size = 22, color = colors.ink }: { name: OnboardingIcon; size?: number; color?: string }) => <Ionicons name={ICONS[name]} size={size} color={color} />;

type SetAnswers = React.Dispatch<React.SetStateAction<OnboardingAnswers>>;

export default function Onboarding() {
  const { finishOnboarding, signedIn } = useAuth();
  const [a, setA] = useState<OnboardingAnswers>(initialAnswers);
  const [i, setI] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const steps = useMemo(() => buildSteps(a), [a]);
  const step = steps[i];
  const chrome = stepChrome(step);

  const fade = useRef(new Animated.Value(1)).current;
  const moving = useRef(false);
  const stepCount = useRef(steps.length);
  stepCount.current = steps.length;
  // JS-driven on purpose: the destination step's autoFocus opens the keyboard mid-fade, and that re-render
  // reset a native-driven opacity to 0 on iOS (new architecture), leaving a blank screen after "Yes".
  const go = (delta: number) => {
    if (moving.current) return; // ignore double taps mid-transition
    moving.current = true;
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: false }).start(() => {
      setI((n) => Math.max(0, Math.min(n + delta, stepCount.current - 1)));
      moving.current = false;
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    });
  };
  const next = () => go(1);

  const finish = async () => {
    setFinishing(true);
    await completeOnboarding(onboardingPreferences(a));
    // The paywall will go here once sign-up and payments are added.
    finishOnboarding({ newTripFor: tripToStart(a) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: step.kind === "hero" ? "#0b1f1d" : colors.canvas }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {chrome.back && (
          <View style={st.topBar}>
            <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => go(-1)} style={st.back}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            {chrome.progress && (
              <View style={st.track}>
                <View style={[st.fill, { width: `${stepProgress(steps, i) * 100}%` }]} />
              </View>
            )}
          </View>
        )}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={{ flex: 1, opacity: fade }}>
            <StepView step={step} a={a} setA={setA} next={next} finish={finish} finishing={finishing} onSignIn={signedIn ? undefined : () => finishOnboarding({ signIn: true })} />
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function StepView({ step, a, setA, next, finish, finishing, onSignIn }: { step: OnboardingStep; a: OnboardingAnswers; setA: SetAnswers; next: () => void; finish: () => void; finishing: boolean; onSignIn?: () => void }) {
  switch (step.kind) {
    case "hero":
      return <Hero onStart={next} onSignIn={onSignIn} />;
    case "intro":
      return <Intro onNext={next} />;
    case "single": {
      const current = a[step.key];
      return (
        <Question title={step.title} subtitle={step.subtitle}>
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
        </Question>
      );
    }
    case "multi": {
      const selected = a[step.key] as string[];
      const toggle = (v: string) => setA((prev) => ({ ...prev, [step.key]: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] }));
      return (
        <Question title={step.title} subtitle={step.subtitle} footer={<Cta title="Continue" onPress={next} disabled={!canContinue(step, a)} />}>
          <View style={step.grid ? st.grid : { gap: 10 }}>
            {step.options.map((o) => (
              <OptionCard key={o.value} option={o} selected={selected.includes(o.value)} onPress={() => toggle(o.value)} multi compact={step.grid} />
            ))}
          </View>
        </Question>
      );
    }
    case "destination":
      return (
        <Question title={DESTINATION_COPY.title} subtitle={DESTINATION_COPY.subtitle} footer={<Cta title="Continue" onPress={next} disabled={!canContinue(step, a)} />}>
          <TextInput
            autoFocus
            value={a.destination}
            onChangeText={(destination) => setA((p) => ({ ...p, destination }))}
            placeholder={DESTINATION_COPY.placeholder}
            placeholderTextColor="#94a3b8"
            style={st.bigInput}
            returnKeyType="next"
            onSubmitEditing={() => canContinue(step, a) && next()}
          />
          <Text style={[st.subtitle, { marginTop: 8 }]}>{DESTINATION_COPY.popular}</Text>
          <View style={st.chips}>
            {POPULAR_DESTINATIONS.slice(0, 8).map((d) => (
              <Pill key={d} label={d} on={a.destination === d} onPress={() => setA((p) => ({ ...p, destination: d }))} />
            ))}
          </View>
        </Question>
      );
    case "dreams": {
      const toggle = (d: string) => setA((p) => ({ ...p, dreams: p.dreams.includes(d) ? p.dreams.filter((x) => x !== d) : [...p.dreams, d] }));
      return (
        <Question title={DREAMS_COPY.title} subtitle={DREAMS_COPY.subtitle} footer={<Cta title={a.dreams.length ? "Continue" : "Skip for now"} onPress={next} />}>
          <View style={st.chips}>
            {POPULAR_DESTINATIONS.map((d) => (
              <Pill key={d} label={d} on={a.dreams.includes(d)} onPress={() => toggle(d)} />
            ))}
          </View>
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        <Text style={st.title}>{title}</Text>
        {subtitle && <Text style={st.subtitle}>{subtitle}</Text>}
        <View style={{ gap: 10, marginTop: 22 }}>{children}</View>
      </ScrollView>
      {footer && <View style={st.footer}>{footer}</View>}
    </View>
  );
}

function OptionCard({ option, selected, onPress, multi, compact }: { option: OnboardingOption<unknown>; selected: boolean; onPress: () => void; multi?: boolean; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [st.option, compact && st.optionCompact, selected && st.optionOn, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {option.emoji ? <Text style={{ fontSize: compact ? 26 : 22 }}>{option.emoji}</Text> : option.icon ? <Icon name={option.icon} color={selected ? colors.brand : colors.ink} /> : null}
      <View style={{ flex: compact ? undefined : 1 }}>
        <Text style={[st.optionLabel, compact && { textAlign: "center", fontSize: 14 }, selected && { color: colors.brandDark }]}>{option.label}</Text>
        {option.hint && <Text style={st.optionHint}>{option.hint}</Text>}
      </View>
      {!compact && multi && <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.brand : "#cbd5e1"} />}
    </Pressable>
  );
}

function Cta({ title, onPress, disabled, light }: { title: string; onPress: () => void; disabled?: boolean; light?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [st.cta, light && { backgroundColor: colors.white }, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}
    >
      <Text style={[st.ctaText, light && { color: colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.pill, on && st.optionOn]}>
      <Text style={{ fontWeight: "600", color: on ? colors.brandDark : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function Hero({ onStart, onSignIn }: { onStart: () => void; onSignIn?: () => void }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [drift]);
  return (
    <View style={{ flex: 1 }}>
      <View style={st.collage} pointerEvents="none">
        {COLLAGE.map((col, ci) => (
          <Animated.View
            key={ci}
            style={{ flex: 1, gap: 10, marginTop: [-30, -90, -10][ci], transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: ci === 1 ? [0, 40] : [0, -40] }) }] }}
          >
            {col.map((tile) => (
              <View key={tile.uri} style={st.tile}>
                <Image source={{ uri: tile.uri }} style={StyleSheet.absoluteFill} />
                {tile.tag && (
                  <View style={st.tag}>
                    <Text style={st.tagText}>{tile.tag}</Text>
                  </View>
                )}
              </View>
            ))}
          </Animated.View>
        ))}
      </View>
      {/* Layered scrims stand in for a gradient so text stays readable over the photos. */}
      <View style={[StyleSheet.absoluteFill, { top: "35%", backgroundColor: "rgba(11,31,29,0.35)" }]} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { top: "50%", backgroundColor: "rgba(11,31,29,0.6)" }]} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { top: "62%", backgroundColor: "rgba(11,31,29,0.85)" }]} pointerEvents="none" />
      <View style={{ flex: 1, justifyContent: "flex-end", padding: 24, gap: 14 }}>
        <View style={st.logoRow}>
          <View style={st.logo}>
            <Ionicons name="navigate" size={18} color={colors.white} />
          </View>
          <Text style={{ color: colors.white, fontSize: 20, fontWeight: "800" }}>Wayfare</Text>
        </View>
        <Text style={st.heroTitle}>{HERO_COPY.title}</Text>
        <Text style={{ color: "#cbd5e1", fontSize: 15, lineHeight: 21 }}>{HERO_COPY.body}</Text>
        <Cta title="Get started" onPress={onStart} light />
        {onSignIn && (
          <Pressable onPress={onSignIn} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ color: colors.white, fontWeight: "600" }}>I already have an account</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[st.body, { paddingTop: 8 }]}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
          {HERO_IMAGES.map((u, n) => (
            <Image key={u} source={{ uri: u }} style={[st.introImg, { transform: [{ rotate: `${(n - 1) * 4}deg` }], marginTop: n === 1 ? 0 : 14 }]} />
          ))}
        </View>
        <Text style={st.title}>{INTRO_TITLE}</Text>
        <View style={{ gap: 16, marginTop: 20 }}>
          {VALUES.map((v) => (
            <View key={v.title} style={{ flexDirection: "row", gap: 14 }}>
              <View style={st.valueIcon}>
                <Icon name={v.icon} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 16, color: colors.ink }}>{v.title}</Text>
                <Text style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>{v.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={st.statsRow}>
          {SOCIAL_PROOF.stats.map((s) => (
            <View key={s.label} style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>
                {s.value}
                {s.star ? " ★" : ""}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{s.label}</Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {SOCIAL_PROOF.reviews.map((r, n) => (
            <View key={n} style={st.review}>
              <Text style={{ color: "#f59e0b", letterSpacing: 2 }}>{"★".repeat(r.rating)}</Text>
              <Text style={{ color: colors.ink, lineHeight: 19 }}>“{r.text}”</Text>
              <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 12 }}>{r.name}</Text>
            </View>
          ))}
        </ScrollView>
        {SOCIAL_PROOF.isPlaceholder && <Text style={st.placeholderNote}>{SOCIAL_PROOF.note}</Text>}
      </ScrollView>
      <View style={st.footer}>
        <Cta title="Continue" onPress={onNext} />
      </View>
    </View>
  );
}

function Info({ id, a, next }: { id: InfoId; a: OnboardingAnswers; next: () => void }) {
  const c = infoCopy(id, a);
  const hasArt = c.art.kind !== "none";
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[st.body, { flexGrow: 1, justifyContent: hasArt ? "center" : "flex-start" }]}>
        {hasArt && (
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <Art art={c.art} />
          </View>
        )}
        <Text style={[st.title, hasArt ? { textAlign: "center" } : null]}>{c.title}</Text>
        {c.body && <Text style={[st.subtitle, { textAlign: "center", fontSize: 16, lineHeight: 23 }]}>{c.body}</Text>}
        {c.fixes && (
          <View style={{ gap: 12, marginTop: 16 }}>
            {c.fixes.map((f) => (
              <View key={f.text} style={st.fixRow}>
                <View style={st.valueIcon}>
                  <Icon name={f.icon} size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, textDecorationLine: "line-through" }}>{f.from}</Text>
                  <Text style={{ color: colors.ink, fontWeight: "600", lineHeight: 19 }}>{f.text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={st.footer}>
        <Cta title="Continue" onPress={next} />
      </View>
    </View>
  );
}

function Art({ art }: { art: InfoArt }) {
  if (art.kind === "phone") return <PhoneArt destination={art.destination} />;
  if (art.kind === "funnel")
    return (
      <View style={{ alignItems: "center", gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {art.icons.map((ic) => (
            <View key={ic} style={st.bubbleStatic}>
              <Icon name={ic} />
            </View>
          ))}
        </View>
        <Ionicons name="arrow-down" size={26} color={colors.muted} />
        <View style={[st.valueIcon, { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.brand }]}>
          <Ionicons name="map" size={36} color={colors.white} />
        </View>
      </View>
    );
  return null;
}

/** A phone showing a saved-places list, with the apps people save from floating around it. */
function PhoneArt({ destination }: { destination?: string }) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [float]);
  return (
    <View style={{ width: 300, height: 320, alignItems: "center", justifyContent: "center" }}>
      <View style={st.phone}>
        <Image source={{ uri: HERO_IMAGES[0] }} style={{ height: 120, borderRadius: 14 }} />
        <Text style={{ fontWeight: "800", color: colors.ink, marginTop: 8 }} numberOfLines={1}>
          {destination ? `Trip to ${destination}` : "My wishlist"}
        </Text>
        {PHONE_ROWS.map((t) => (
          <View key={t} style={st.phoneRow}>
            <Text style={{ fontSize: 11, color: colors.ink }} numberOfLines={1}>
              {t}
            </Text>
          </View>
        ))}
      </View>
      {PHONE_BUBBLES.map((b, n) => (
        <Animated.View
          key={b.icon}
          style={[st.bubble, { transform: [{ translateX: b.x }, { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [b.y, b.y + (n % 2 ? 8 : -8)] }) }] }]}
        >
          <Icon name={b.icon} color={b.color} />
        </Animated.View>
      ))}
    </View>
  );
}

function Goal({ a, setA, next }: { a: OnboardingAnswers; setA: SetAnswers; next: () => void }) {
  const n = a.tripsGoal;
  const set = (v: number) => setA((p) => ({ ...p, tripsGoal: Math.max(GOAL_COPY.min, Math.min(GOAL_COPY.max, v)) }));
  return (
    <Question title={GOAL_COPY.title} footer={<Cta title={GOAL_COPY.cta} onPress={next} />}>
      <View style={{ alignItems: "center", gap: 16, marginTop: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
          <Pressable accessibilityLabel="Fewer trips" onPress={() => set(n - 1)} style={st.stepper}>
            <Ionicons name="remove" size={26} color={colors.ink} />
          </Pressable>
          <Text style={{ fontSize: 72, fontWeight: "800", color: colors.brand, minWidth: 90, textAlign: "center" }}>{n}</Text>
          <Pressable accessibilityLabel="More trips" onPress={() => set(n + 1)} style={st.stepper}>
            <Ionicons name="add" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={[st.subtitle, { textAlign: "center" }]}>{goalCaption(n)}</Text>
      </View>
    </Question>
  );
}

function Building({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0);
  const bar = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    Animated.timing(bar, { toValue: 1, duration: BUILD_DURATION - 400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
    const timers = BUILD_STEPS.map((_, n) => setTimeout(() => setDone(n + 1), BUILD_TICK * (n + 1)));
    const end = setTimeout(() => doneRef.current(), BUILD_DURATION);
    return () => [...timers, end].forEach(clearTimeout);
  }, [bar]);
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 28, gap: 26 }}>
      <Text style={[st.title, { textAlign: "center" }]}>{BUILDING_TITLE}</Text>
      <View style={st.track}>
        <Animated.View style={[st.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
      </View>
      <View style={{ gap: 14 }}>
        {BUILD_STEPS.map((t, n) => (
          <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: n <= done ? 1 : 0.35 }}>
            <Ionicons name={n < done ? "checkmark-circle" : "ellipse-outline"} size={22} color={n < done ? colors.brand : colors.muted} />
            <Text style={{ fontSize: 16, color: colors.ink }}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Summary({ a, onStart, busy }: { a: OnboardingAnswers; onStart: () => void; busy: boolean }) {
  const sum = summary(a);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[st.body, { paddingTop: 28 }]}>
        <Text style={[st.subtitle, { textAlign: "center", marginTop: 0 }]}>{sum.kicker}</Text>
        <View style={st.personaCard}>
          <Text style={{ fontSize: 52 }}>{sum.persona.emoji}</Text>
          <Text style={{ color: colors.white, fontSize: 26, fontWeight: "800", textAlign: "center" }}>{sum.persona.title}</Text>
          <Text style={{ color: "#ccfbf1", textAlign: "center" }}>{sum.persona.line}</Text>
          <View style={[st.chips, { justifyContent: "center", marginTop: 6 }]}>
            {sum.traits.map((t) => (
              <View key={t} style={st.traitChip}>
                <Text style={{ color: colors.white, fontSize: 12, fontWeight: "600" }}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={[st.title, { fontSize: 20, marginTop: 24 }]}>{sum.planTitle}</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          {sum.plan.map((t) => (
            <View key={t} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              <Text style={{ flex: 1, fontSize: 15, color: colors.ink, lineHeight: 21 }}>{t}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={st.footer}>
        <Cta title={busy ? "Getting things ready…" : sum.cta} onPress={onStart} disabled={busy} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, minHeight: 44 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  body: { padding: 22, paddingTop: 16, paddingBottom: 32 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 8 },
  footer: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12 },
  cta: { height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.white, fontSize: 17, fontWeight: "700" },
  option: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 60, borderRadius: 18, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white },
  optionCompact: { width: "31%", flexDirection: "column", justifyContent: "center", gap: 6, paddingHorizontal: 6, paddingVertical: 14 },
  optionOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionLabel: { fontSize: 16, fontWeight: "600", color: colors.ink },
  optionHint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 16, height: 42, borderRadius: 21, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white, justifyContent: "center" },
  bigInput: { height: 58, borderRadius: 18, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.white, paddingHorizontal: 18, fontSize: 18, color: colors.ink },
  collage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 10 },
  tile: { height: 210, borderRadius: 20, overflow: "hidden", backgroundColor: "#1e3a37" },
  tag: { position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  tagText: { fontSize: 10, fontWeight: "700", color: colors.ink },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: colors.white, fontSize: 34, lineHeight: 40, fontWeight: "800" },
  introImg: { flex: 1, height: 130, borderRadius: 18, backgroundColor: colors.line },
  valueIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", marginTop: 26, marginBottom: 14, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  review: { width: 250, padding: 14, gap: 6, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  placeholderNote: { marginTop: 10, fontSize: 11, color: colors.sun, textAlign: "center" },
  phone: { width: 170, height: 300, borderRadius: 30, borderWidth: 6, borderColor: colors.ink, backgroundColor: colors.white, padding: 10, gap: 6 },
  phoneRow: { backgroundColor: colors.canvas, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  bubble: { position: "absolute", width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  bubbleStatic: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  fixRow: { flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  stepper: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  personaCard: { marginTop: 14, alignItems: "center", gap: 6, padding: 24, borderRadius: 28, backgroundColor: colors.brand },
  traitChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)" },
});

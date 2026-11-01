import { PACES, PLACE_CATEGORIES, TRAVEL_MODES, type UserPreferences } from "@wayfare/shared";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Bell, Check, ChevronRight, CreditCard, Download, HelpCircle, LogOut, RotateCcw, MapPin, Shield, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Avatar, Badge, Field, PageLoader, Spinner, useConfirm } from "@/components/ui";
import { post, upload } from "@/lib/api";
import { authClient, signOut } from "@/lib/auth";
import { catEmoji, catLabel, fmtDate } from "@/lib/format";
import { setOnboardedLocally } from "@/lib/onboarding";
import { useDevMode, useMe, useUpdateProfile } from "@/lib/queries";

export function Profile() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const update = useUpdateProfile();
  const { data: devMode } = useDevMode();
  const [name, setName] = useState("");
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [locStatus, setLocStatus] = useState<string>("unknown");
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPrefs(me.preferences);
    }
  }, [me]);

  useEffect(() => {
    navigator.permissions?.query({ name: "geolocation" }).then((s) => setLocStatus(s.state)).catch(() => {});
  }, []);

  if (isLoading || !me || !prefs) return <PageLoader />;

  const savePrefs = (p: Partial<UserPreferences>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    update.mutate({ preferences: p });
  };

  return (
    <div className="page max-w-3xl space-y-6">
      <h1 className="page-title">Profile</h1>

      {/* Account */}
      <Section icon={<User className="size-4" />} title="Account">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer" title="Change photo">
            <Avatar name={me.name} image={me.image} size={64} />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const { url } = await upload<{ url: string }>("/media", f);
                  await authClient.updateUser({ image: url });
                  qc.invalidateQueries();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-muted">{me.email}</span>
              {me.emailVerified ? <Badge tone="brand"><Check className="size-3" /> Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
            </div>
            {!me.emailVerified && (
              <button
                className="mt-1 text-xs font-semibold text-brand-700"
                onClick={async () => {
                  await authClient.sendVerificationEmail({ email: me.email, callbackURL: "/profile" });
                  toast.success("Verification email sent");
                }}
              >
                Send verification email
              </button>
            )}
          </div>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await authClient.updateUser({ name: name.trim() });
            if (error) return toast.error(error.message ?? "Couldn't update");
            qc.invalidateQueries();
            toast.success("Name updated");
          }}
        >
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <button className="btn-secondary" disabled={!name.trim() || name === me.name}>
            Save
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setPwOpen(!pwOpen)}>
            Change password
          </button>
          <button
            className="btn-secondary"
            onClick={async () => {
              await authClient.revokeOtherSessions();
              toast.success("Signed out of all other devices");
            }}
          >
            Sign out other devices
          </button>
        </div>
        {pwOpen && <ChangePassword onDone={() => setPwOpen(false)} />}
      </Section>

      {/* Subscription */}
      <Link to="/profile/subscription" className="card flex items-center gap-4 p-5 hover:shadow-md">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">{me.plan === "pro" ? "Wayfare Pro" : "Free plan"}</span>
          <span className="block text-sm text-muted">
            {me.usage.aiGenerations}/{me.usage.limits.aiGenerationsPerMonth} AI itineraries · {me.usage.imports}/{me.usage.limits.importsPerMonth} imports this month
          </span>
        </span>
        <ChevronRight className="size-5 text-slate-400" />
      </Link>

      {/* Travel preferences */}
      <Section icon={<MapPin className="size-4" />} title="Travel preferences">
        <div className="label">Favorite categories</div>
        <div className="flex flex-wrap gap-1.5">
          {PLACE_CATEGORIES.filter((c) => c !== "other").map((c) => {
            const on = prefs.interests.includes(c);
            return (
              <button key={c} className={clsx("chip", on && "chip-active")} onClick={() => savePrefs({ interests: on ? prefs.interests.filter((x) => x !== c) : [...prefs.interests, c] })}>
                {catEmoji(c)} {catLabel(c)}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Pace">
            <select className="input capitalize" value={prefs.pace} onChange={(e) => savePrefs({ pace: e.target.value as UserPreferences["pace"] })}>
              {PACES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Getting around">
            <select className="input capitalize" value={prefs.travelMode} onChange={(e) => savePrefs({ travelMode: e.target.value as UserPreferences["travelMode"] })}>
              {TRAVEL_MODES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Units">
            <select className="input" value={prefs.units} onChange={(e) => savePrefs({ units: e.target.value as UserPreferences["units"] })}>
              <option value="metric">Kilometres</option>
              <option value="imperial">Miles</option>
            </select>
          </Field>
          <Field label="Time format">
            <select className="input" value={prefs.timeFormat} onChange={(e) => savePrefs({ timeFormat: e.target.value as UserPreferences["timeFormat"] })}>
              <option value="24h">24-hour</option>
              <option value="12h">12-hour</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Notifications */}
      <Section icon={<Bell className="size-4" />} title="Notifications">
        {(
          [
            ["tripReminders", "Trip reminders", "A heads-up before your trips start"],
            ["collaboration", "Collaboration", "Invitations and people joining your trips"],
            ["imports", "Imports", "When a link or screenshot has been processed"],
            ["itinerary", "Itineraries", "When an AI itinerary is ready to review"],
          ] as const
        ).map(([k, label, desc]) => (
          <Toggle key={k} label={label} desc={desc} checked={prefs.notifications[k]} onChange={(v) => savePrefs({ notifications: { ...prefs.notifications, [k]: v } })} />
        ))}
        <p className="mt-2 text-xs text-muted">Push notifications on your phone never include trip names or places, so nothing private shows on a locked screen.</p>
      </Section>

      {/* Privacy & data */}
      <Section icon={<Shield className="size-4" />} title="Privacy & permissions">
        <div className="flex items-center justify-between gap-3 py-2">
          <div>
            <div className="text-sm font-medium">Location access</div>
            <div className="text-xs text-muted">
              Used only to center maps on where you are. Status: <span className="font-medium">{locStatus}</span>
            </div>
          </div>
          {locStatus !== "granted" && (
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                navigator.geolocation.getCurrentPosition(
                  () => setLocStatus("granted"),
                  () => {
                    setLocStatus("denied");
                    toast.info("Location is off. Everything else keeps working — you can enable it in your browser settings.");
                  },
                )
              }
            >
              Allow
            </button>
          )}
        </div>
        <Toggle label="Product analytics" desc="Anonymous usage stats (no names, places or notes) help us improve Wayfare." checked={prefs.analyticsOptIn} onChange={(v) => savePrefs({ analyticsOptIn: v })} />
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/api/me/export" className="btn-secondary" download>
            <Download className="size-4" /> Export my data
          </a>
          <a href="/privacy" className="btn-ghost">Privacy policy</a>
          <a href="/terms" className="btn-ghost">Terms of service</a>
          <a href="mailto:support@example.com" className="btn-ghost">
            <HelpCircle className="size-4" /> Help & feedback
          </a>
        </div>
      </Section>

      {devMode && (
        <Section icon={<RotateCcw className="size-4" />} title="Dev tools">
          <p className="mb-3 text-sm text-muted">Dev mode is on: no sign-in, limits or paywall.</p>
          <button
            className="btn-secondary"
            onClick={() => {
              setOnboardedLocally(false);
              navigate("/onboarding");
            }}
          >
            Replay onboarding
          </button>
        </Section>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          onClick={async () => {
            await signOut();
            qc.clear();
            navigate("/welcome", { replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </button>
        <button
          className="btn-ghost text-red-600 hover:bg-red-50"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete your account?",
              body: "This permanently deletes your places, collections, trips you own, uploads and settings. Trips shared with you are unaffected. Export your data first if you want a copy.",
              confirmLabel: "Delete my account",
              danger: true,
            });
            if (!ok) return;
            const { error } = await authClient.deleteUser({ callbackURL: "/welcome" });
            if (error) return toast.error(error.message ?? "Couldn't delete account. You may need to sign in again first.");
            qc.clear();
            navigate("/welcome", { replace: true });
          }}
        >
          <Trash2 className="size-4" /> Delete account
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <span className="text-brand-700">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next.length < 8) return toast.error("Use at least 8 characters");
        setBusy(true);
        const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
        setBusy(false);
        if (error) return toast.error(error.message ?? "Couldn't change password");
        toast.success("Password changed");
        onDone();
      }}
    >
      <Field label="Current password">
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password">
        <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <button className="btn-primary" disabled={busy}>
        {busy && <Spinner className="size-4 text-white" />} Update password
      </button>
    </form>
  );
}

const PRO_FEATURES = ["200 AI itinerary generations a month", "1,000 link & screenshot imports a month", "Regenerate individual days as often as you like", "Priority processing for imports"];

export function SubscriptionPage() {
  const { data: me, isLoading, refetch } = useMe();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("status") === "success") {
      toast.success("Thanks! Your subscription will be active in a moment.");
      const t = setTimeout(() => refetch(), 3000);
      return () => clearTimeout(t);
    }
  }, [params, refetch]);

  if (isLoading || !me) return <PageLoader />;
  const go = async (path: string) => {
    setBusy(true);
    try {
      const { url } = await post<{ url: string }>(path);
      location.assign(url);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page max-w-2xl space-y-6">
      <Link to="/profile" className="btn-ghost -ml-3">
        <ArrowLeft className="size-4" /> Profile
      </Link>
      <h1 className="page-title">Subscription</h1>
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">Current plan</div>
            <div className="font-display text-2xl font-bold">{me.plan === "pro" ? "Pro" : "Free"}</div>
          </div>
          {me.subscription && (
            <div className="text-right text-xs text-muted">
              <div className="capitalize">
                {me.subscription.status} · via {me.subscription.provider.replace("_", " ")}
              </div>
              {me.subscription.currentPeriodEnd && <div>Renews/ends {fmtDate(me.subscription.currentPeriodEnd, { month: "short", day: "numeric", year: "numeric" })}</div>}
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Usage label="AI itineraries" used={me.usage.aiGenerations} limit={me.usage.limits.aiGenerationsPerMonth} />
          <Usage label="Imports" used={me.usage.imports} limit={me.usage.limits.importsPerMonth} />
        </div>
      </div>

      {me.plan === "free" ? (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-800 to-brand-600 p-6 text-white">
            <Sparkles className="size-6" />
            <h2 className="mt-3 font-display text-2xl font-bold text-white">Wayfare Pro</h2>
            <p className="mt-1 text-sm opacity-90">For people who plan a lot of trips.</p>
          </div>
          <ul className="space-y-2 p-6">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-brand-700" /> {f}
              </li>
            ))}
          </ul>
          <div className="px-6 pb-6">
            <button className="btn-primary h-12 w-full" disabled={busy} onClick={() => go("/billing/checkout")}>
              <CreditCard className="size-4" /> Upgrade with Stripe
            </button>
            <p className="mt-2 text-center text-xs text-muted">Subscribed on iOS or Android? Your plan syncs automatically.</p>
          </div>
        </div>
      ) : me.subscription?.provider === "stripe" ? (
        <button className="btn-secondary" disabled={busy} onClick={() => go("/billing/portal")}>
          <CreditCard className="size-4" /> Manage billing
        </button>
      ) : (
        <p className="text-sm text-muted">Your subscription was purchased in a mobile app store. Manage or cancel it from your device's subscription settings.</p>
      )}
    </div>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">
        {used} / {limit}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={clsx("h-full rounded-full", pct >= 90 ? "bg-red-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

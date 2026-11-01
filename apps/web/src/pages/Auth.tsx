import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/Layout";
import { Field, Spinner } from "@/components/ui";
import { authClient, signIn, signUp } from "@/lib/auth";

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-canvas px-4 py-10">
      <Logo className="mb-8" />
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </div>
  );
}

function GoogleButton() {
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      onClick={async () => {
        const { error } = await signIn.social({ provider: "google", callbackURL: "/" });
        if (error) toast.error(error.message ?? "Google sign-in isn't available right now");
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
      </svg>
      Continue with Google
    </button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(error.status === 401 ? "That email and password don't match." : (error.message ?? "Sign-in failed"));
    qc.clear();
    navigate(params.get("next") ?? "/", { replace: true });
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep planning."
      footer={
        <>
          New here?{" "}
          <Link to="/sign-up" className="font-semibold text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4 text-white" />} Sign in
        </button>
        <Link to="/forgot-password" className="block text-center text-sm text-muted hover:text-ink">
          Forgot your password?
        </Link>
      </form>
    </AuthShell>
  );
}

export function SignUp() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    setError(null);
    const { error } = await signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't create your account");
    qc.clear();
    navigate("/onboarding", { replace: true });
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Save places from anywhere and turn them into trips."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className="input" autoComplete="name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className="input" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4 text-white" />} Create account
        </button>
        <p className="text-center text-xs text-muted">
          By continuing you agree to our <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/sign-in" className="font-semibold text-brand-700">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">If an account exists for {email}, a reset link is on its way. Check your inbox (and spam folder).</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/reset-password` });
            setBusy(false);
            // Always show the same message so emails can't be enumerated.
            setSent(true);
          }}
        >
          <Field label="Email">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired." : null);
  return (
    <AuthShell title="Choose a new password">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!token) return setError("This reset link is invalid or has expired.");
          if (password.length < 8) return setError("Use at least 8 characters.");
          const { error } = await authClient.resetPassword({ newPassword: password, token });
          if (error) return setError(error.message ?? "Couldn't reset your password");
          toast.success("Password updated. Please sign in.");
          navigate("/sign-in");
        }}
      >
        <Field label="New password">
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">
            {error}{" "}
            <Link to="/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          </p>
        )}
        <button className="btn-primary w-full">Update password</button>
      </form>
    </AuthShell>
  );
}

import { Bookmark, Map, Sparkles, Users } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/Layout";

const FEATURES = [
  { icon: Bookmark, title: "Save inspiration from anywhere", body: "Paste a TikTok, Instagram post, Google Maps link or blog — or drop a screenshot. We find the places for you." },
  { icon: Map, title: "Organize on a map", body: "Group places into collections like “Cafés in Lisbon” and see everything you've saved on one map." },
  { icon: Sparkles, title: "Plan trips with AI", body: "Pick dates and places, and get a day-by-day itinerary you can reorder, edit and regenerate." },
  { icon: Users, title: "Plan together", body: "Invite friends to edit, or share a view-only link. Changes sync live." },
];

export function Welcome() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-50 via-white to-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Link to="/sign-in" className="btn-ghost">
          Sign in
        </Link>
      </header>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800 shadow-sm ring-1 ring-brand-100">
            <Sparkles className="size-3.5 text-sun-500" /> Trip & holiday planner
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            From saved posts to a <span className="text-brand-700">real itinerary</span>.
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Stop losing travel ideas across screenshots, bookmarks and chats. Collect them in one place, see them on a map and turn them into a day-by-day plan.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/sign-up" className="btn-primary h-12 px-6 text-base">
              Get started — it's free
            </Link>
            <Link to="/sign-in" className="btn-secondary h-12 px-6 text-base">
              I already have an account
            </Link>
          </div>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

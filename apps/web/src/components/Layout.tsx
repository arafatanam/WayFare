import type { Collection, Place, Trip } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Bookmark, Compass, Home, Luggage, Plus, Search, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { get, qs } from "@/lib/api";
import { catEmoji, fmtRange, timeAgo } from "@/lib/format";
import { useDevMode, useMarkNotificationsRead, useMe, useNotifications } from "@/lib/queries";
import { useImportDialog } from "./ImportDialog";
import { useDebounced } from "./PlaceForm";
import { Avatar, Cover, Modal, Spinner } from "./ui";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/trips", label: "Trips", icon: Luggage },
  { to: "/profile", label: "Profile", icon: User },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={clsx("flex items-center gap-2 font-display text-xl font-bold text-brand-800", className)}>
      <img src="/favicon.svg" alt="" className="size-7" />
      Wayfare
    </Link>
  );
}

export function AppLayout() {
  const openImport = useImportDialog();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: me } = useMe();
  const { data: devMode } = useDevMode();
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => window.scrollTo(0, 0), [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <Logo className="px-2" />
        <button className="btn-primary mt-6 w-full" onClick={() => openImport()}>
          <Plus className="size-4" /> Save a place
        </button>
        <nav className="mt-6 space-y-1" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50 hover:text-ink")
              }
            >
              <n.icon className="size-5" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          {devMode && (
            <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <b>Dev mode</b> — sign-in, onboarding, limits and paywalls are off.
            </div>
          )}
          {me && me.plan === "free" && (
            <Link to="/profile/subscription" className="mb-3 block rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 p-3 text-white">
              <div className="text-sm font-semibold">Go Pro</div>
              <div className="text-xs opacity-90">
                {me.usage.aiGenerations}/{me.usage.limits.aiGenerationsPerMonth} AI plans used this month
              </div>
            </Link>
          )}
          {me && (
            <Link to="/profile" className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
              <Avatar name={me.name} image={me.image} size={34} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{me.name}</div>
                <div className="truncate text-xs text-muted">{me.email}</div>
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
          <Logo className="lg:hidden" />
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-slate-400 hover:border-slate-300 lg:ml-0 lg:w-80"
            aria-label="Search"
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Search places, collections, trips</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] lg:inline">Ctrl K</kbd>
          </button>
          <div className="lg:ml-auto">
            <NotificationsButton />
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {NAV.slice(0, 2).map((n) => (
            <TabLink key={n.to} {...n} />
          ))}
          <div className="flex justify-center">
            <button onClick={() => openImport()} className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-700/30" aria-label="Save a place">
              <Plus className="size-6" />
            </button>
          </div>
          {NAV.slice(2, 4).map((n) => (
            <TabLink key={n.to} {...n} />
          ))}
        </div>
      </nav>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function TabLink({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-brand-700" : "text-slate-500")}>
      <Icon className="size-5" />
      {label}
    </NavLink>
  );
}

function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const unread = data?.filter((n) => !n.readAt).length ?? 0;
  return (
    <>
      <button className="icon-btn relative" onClick={() => setOpen(true)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-sun-500" />}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          unread > 0 ? (
            <button className="btn-ghost btn-sm" onClick={() => markRead.mutate(undefined)}>
              Mark all as read
            </button>
          ) : undefined
        }
      >
        {!data?.length ? (
          <p className="py-6 text-center text-sm text-muted">You're all caught up.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {data.map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-slate-50"
                  onClick={() => {
                    if (!n.readAt) markRead.mutate([n.id]);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-sun-500")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                    <span className="block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

interface SearchResults {
  places: (Place & { context: string[] })[];
  collections: Collection[];
  trips: Trip[];
}

function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 250);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => get<SearchResults>(`/me/search${qs({ q: debounced })}`),
    enabled: open && debounced.length > 0,
  });
  const go = (to: string) => {
    onClose();
    setQ("");
    navigate(to);
  };
  const empty = data && !data.places.length && !data.collections.length && !data.trips.length;

  return (
    <Modal open={open} onClose={onClose} title="Search">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" autoFocus placeholder="Place, city, collection or trip…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      {empty && <p className="py-6 text-center text-sm text-muted">No results for “{debounced}”. Try a shorter or different word.</p>}
      {data && !empty && (
        <div className="mt-4 space-y-4">
          {data.trips.length > 0 && (
            <ResultGroup title="Trips">
              {data.trips.map((t) => (
                <ResultRow key={t.id} onClick={() => go(`/trips/${t.id}`)} icon={<Cover src={t.coverImageUrl} seed={t.destination} emoji="✈️" className="size-9 rounded-lg text-sm" />} title={t.name} sub={`${t.destination} · ${fmtRange(t.startDate, t.endDate)}`} />
              ))}
            </ResultGroup>
          )}
          {data.collections.length > 0 && (
            <ResultGroup title="Collections">
              {data.collections.map((c) => (
                <ResultRow key={c.id} onClick={() => go(`/collections/${c.id}`)} icon={<Cover src={c.previewImages[0]} seed={c.name} emoji="📚" className="size-9 rounded-lg text-sm" />} title={c.name} sub={`${c.placeCount} places`} />
              ))}
            </ResultGroup>
          )}
          {data.places.length > 0 && (
            <ResultGroup title="Places">
              {data.places.map((p) => (
                <ResultRow
                  key={p.id}
                  onClick={() => go(`/places/${p.id}`)}
                  icon={<Cover src={p.imageUrl} seed={p.name} emoji={catEmoji(p.category)} className="size-9 rounded-lg text-sm" />}
                  title={p.name}
                  sub={[[p.city, p.country].filter(Boolean).join(", "), p.context.length ? `in ${p.context.join(", ")}` : null].filter(Boolean).join(" · ")}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </Modal>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <ul className="-mx-2">{children}</ul>
    </div>
  );
}

function ResultRow({ onClick, icon, title, sub }: { onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li>
      <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50" onClick={onClick}>
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
      </button>
    </li>
  );
}

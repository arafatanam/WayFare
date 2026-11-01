import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";
import { ImportProvider } from "./components/ImportDialog";
import { AppLayout } from "./components/Layout";
import { PageLoader } from "./components/ui";
import { useSession } from "./lib/auth";
import { needsOnboarding } from "./lib/onboarding";
import { useDevMode, useMe } from "./lib/queries";
import { ForgotPassword, ResetPassword, SignIn, SignUp } from "./pages/Auth";
import { CollectionPage } from "./pages/Collection";
import { Explore } from "./pages/Explore";
import { HomePage } from "./pages/Home";
import { Invites } from "./pages/Invites";
import { NewTrip } from "./pages/NewTrip";
import { NotFound } from "./pages/NotFound";
import { Onboarding } from "./pages/Onboarding";
import { PlacePage } from "./pages/Place";
import { Profile, SubscriptionPage } from "./pages/Profile";
import { Saved } from "./pages/Saved";
import { SharedView } from "./pages/SharedView";
import { TripPage } from "./pages/Trip";
import { Trips } from "./pages/Trips";
import { Welcome } from "./pages/Welcome";

function RequireAuth() {
  const { data: session, isPending } = useSession();
  const { data: devMode, isPending: devPending } = useDevMode();
  const location = useLocation();
  if (isPending || devPending) return <PageLoader />;
  if (devMode) return <Outlet />; // DEV MODE: the API signs requests in as the test user
  if (!session) {
    const next = location.pathname === "/" ? "" : `?next=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={location.pathname === "/" ? "/welcome" : `/sign-in${next}`} replace />;
  }
  return <Outlet />;
}

/** New users take the onboarding quiz first (the same flow as the mobile app). */
function RequireOnboarded() {
  const { data: me, isPending } = useMe();
  const { data: devMode } = useDevMode();
  if (isPending) return <PageLoader />;
  if (needsOnboarding(devMode, me?.onboarded)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { data: session, isPending } = useSession();
  const { data: devMode, isPending: devPending } = useDevMode();
  if (isPending || devPending) return <PageLoader />;
  // DEV MODE: welcome/sign-in screens are skipped entirely.
  return session || devMode ? <Navigate to="/" replace /> : <Outlet />;
}

function Root() {
  return (
    <ImportProvider>
      <Outlet />
    </ImportProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: "/welcome", element: <Welcome /> },
          { path: "/sign-in", element: <SignIn /> },
          { path: "/sign-up", element: <SignUp /> },
          { path: "/forgot-password", element: <ForgotPassword /> },
        ],
      },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/s/:token", element: <SharedView /> },
      { path: "/p/:kind/:id", element: <SharedView /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/onboarding", element: <Onboarding /> },
          {
            element: <RequireOnboarded />,
            children: [
              {
                element: <AppLayout />,
                children: [
                  { path: "/", element: <HomePage /> },
                  { path: "/explore", element: <Explore /> },
                  { path: "/saved", element: <Saved /> },
                  { path: "/places/:id", element: <PlacePage /> },
                  { path: "/collections/:id", element: <CollectionPage /> },
                  { path: "/trips", element: <Trips /> },
                  { path: "/trips/new", element: <NewTrip /> },
                  { path: "/trips/:id", element: <TripPage /> },
                  { path: "/invites", element: <Invites /> },
                  { path: "/profile", element: <Profile /> },
                  { path: "/profile/subscription", element: <SubscriptionPage /> },
                  { path: "*", element: <NotFound /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

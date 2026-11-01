import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadToken, post, setSignedOutHandler } from "@/api";
import { devMode, Notifications, platform } from "@/native";
import { isOnboarded, resetOnboarding, syncPendingOnboarding } from "@/onboarding";
import { PaywallProvider } from "@/paywall";
import { Loading } from "@/ui";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

interface AuthState {
  signedIn: boolean;
  setSignedIn: (v: boolean) => void;
  /** Ends the onboarding quiz: opens the app (or sign-up/sign-in when signed out), optionally starting a trip. */
  finishOnboarding: (opts?: { signIn?: boolean; newTripFor?: string }) => void;
  replayOnboarding: () => Promise<void>;
}
const AuthCtx = createContext<AuthState>({ signedIn: false, setSignedIn: () => {}, finishOnboarding: () => {}, replayOnboarding: async () => {} });
export const useAuth = () => useContext(AuthCtx);

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Registers for push only after sign-in; the OS prompt explains the permission. Push text never includes trip details. */
async function registerPush() {
  if (!Notifications || !Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return; // We ask from Profile → Notifications, not on launch.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await post("/me/push-tokens", { token: data, platform });
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setSignedOutHandler(() => {
      queryClient.clear();
      setSignedIn(false);
    });
    Promise.all([loadToken(), isOnboarded()]).then(([t, done]) => {
      // DEV MODE (app.json extra.devMode + API DEV_MODE=true): skip sign-in; the API uses its test user.
      setSignedIn(!!t || devMode);
      setOnboarded(done);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const seg = segments[0];
    if (!onboarded) {
      if (seg !== "onboarding") router.replace("/onboarding");
      return;
    }
    const inAuth = seg === "(auth)";
    if (!signedIn && !inAuth && seg !== "onboarding") router.replace("/(auth)/sign-in");
    if (signedIn && inAuth) router.replace("/(tabs)");
  }, [ready, onboarded, signedIn, segments, router]);

  useEffect(() => {
    if (!ready || !signedIn) return;
    registerPush().catch(() => {});
    if (onboarded) syncPendingOnboarding().then(() => queryClient.invalidateQueries({ queryKey: ["me"] }), () => {});
  }, [ready, signedIn, onboarded]);

  // Tapping a notification opens the screen it refers to.
  useEffect(() => {
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = r.notification.request.content.data?.link as string | undefined;
      const trip = link?.match(/^\/trips\/(\w+)/)?.[1];
      if (trip) router.push(`/trip/${trip}`);
    });
    return () => sub.remove();
  }, [router]);

  if (!ready) return <Loading />;

  const auth: AuthState = {
    signedIn,
    setSignedIn,
    finishOnboarding: (opts = {}) => {
      setOnboarded(true);
      if (!signedIn) return router.replace(opts.signIn ? "/(auth)/sign-in" : "/(auth)/sign-up");
      router.replace("/(tabs)");
      // The new-trip modal needs the tabs underneath it so closing it lands somewhere.
      if (opts.newTripFor) setTimeout(() => router.push({ pathname: "/new-trip", params: { destination: opts.newTripFor } }), 350);
    },
    replayOnboarding: async () => {
      await resetOnboarding();
      setOnboarded(false);
    },
  };

  return (
    <PaywallProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthCtx.Provider value={auth}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerTintColor: "#0f766e", headerTitleStyle: { color: "#0f172a" } }}>
              <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="place/[id]" options={{ title: "Place" }} />
              <Stack.Screen name="trip/[id]" options={{ title: "Trip" }} />
              <Stack.Screen name="collection/[id]" options={{ title: "Collection" }} />
              <Stack.Screen name="import" options={{ title: "Save a place", presentation: "modal" }} />
              <Stack.Screen name="new-trip" options={{ title: "New trip", presentation: "modal" }} />
            </Stack>
          </AuthCtx.Provider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </PaywallProvider>
  );
}

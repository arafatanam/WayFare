import Constants from "expo-constants";
import type { ReactNode } from "react";
import { devMode, isExpoGo } from "./native";

type SuperwallModule = typeof import("expo-superwall");

const keys = {
  android: (Constants.expoConfig?.extra?.superwallAndroidKey as string) ?? "",
  ios: (Constants.expoConfig?.extra?.superwallIosKey as string) ?? "",
};

/** Superwall needs a development/store build and an API key; in Expo Go or without keys, paywalls are skipped. */
const superwall: SuperwallModule | null = !isExpoGo && (keys.android || keys.ios) ? require("expo-superwall") : null;

export function PaywallProvider({ children }: { children: ReactNode }) {
  if (!superwall) return <>{children}</>;
  return <superwall.SuperwallProvider apiKeys={keys}>{children}</superwall.SuperwallProvider>;
}

export interface Paywall {
  /** Shows the paywall for a Superwall placement. Resolves when it's dismissed (or immediately when paywalls are off). */
  show: (placement: string) => Promise<void>;
  identify: (userId: string) => void;
  enabled: boolean;
}

const noop: Paywall = { show: async () => {}, identify: () => {}, enabled: false };

// `superwall` is fixed for the lifetime of the app, so the hook order never changes between renders.
export const usePaywall: () => Paywall = superwall && !devMode ? useSuperwallPaywall : () => noop;

function useSuperwallPaywall(): Paywall {
  const { identify } = superwall!.useUser();
  const { registerPlacement } = superwall!.usePlacement({});
  return {
    enabled: true,
    identify: (id) => void identify(id),
    show: (placement) =>
      new Promise<void>((resolve) => {
        // The feature callback runs when the user is entitled (paid, or the placement isn't gated).
        registerPlacement({ placement, feature: () => resolve() }).catch(() => resolve());
      }),
  };
}

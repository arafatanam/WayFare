import type { onboardingPreferences } from "@wayfare/shared/onboarding";
import * as SecureStore from "expo-secure-store";
import { patch } from "./api";

const DONE_KEY = "wayfare.onboarded";
const PENDING_KEY = "wayfare.onboarding.pending";

export type OnboardingResult = ReturnType<typeof onboardingPreferences>;

export async function isOnboarded() {
  return (await SecureStore.getItemAsync(DONE_KEY)) === "1";
}

/** Marks the quiz done on this device and keeps the answers until they've reached the API. */
export async function completeOnboarding(result: OnboardingResult) {
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(result));
  await SecureStore.setItemAsync(DONE_KEY, "1");
}

export async function resetOnboarding() {
  await SecureStore.deleteItemAsync(DONE_KEY);
}

/** Sends quiz answers to the profile once there's a user (right away in dev mode, after sign-up otherwise). */
export async function syncPendingOnboarding() {
  const raw = await SecureStore.getItemAsync(PENDING_KEY);
  if (!raw) return;
  const r = JSON.parse(raw) as OnboardingResult;
  await patch("/me/profile", { onboarded: true, preferences: { travelProfile: r.travelProfile, interests: r.interests, pace: r.pace } });
  await SecureStore.deleteItemAsync(PENDING_KEY);
}

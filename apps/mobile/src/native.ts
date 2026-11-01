import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/** True inside the Expo Go app, which doesn't ship custom native modules (Superwall) or remote push. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** DEV MODE (app.json extra.devMode + API DEV_MODE=true): no sign-in and no paywall. */
export const devMode = Constants.expoConfig?.extra?.devMode === true;

type NotificationsModule = typeof import("expo-notifications");

/**
 * expo-notifications, or null in Expo Go: push was removed from Expo Go (SDK 53+), and loading the module
 * there logs errors. Development and store builds get the real module.
 */
export const Notifications: NotificationsModule | null = isExpoGo ? null : require("expo-notifications");

export const platform = Platform.OS === "ios" ? "ios" : "android";

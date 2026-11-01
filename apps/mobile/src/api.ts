import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * In development (Expo Go or a dev build), the API is the Worker on the same machine as Metro: Expo's hostUri
 * is that machine's LAN address, so a phone on the same Wi-Fi reaches it at <ip>:8787. Release builds use extra.apiUrl.
 */
function resolveApiUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (__DEV__ && host && !host.endsWith(".exp.direct")) return `http://${host}:8787`;
  if (configured) return configured;
  return Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";
}

export const API_URL = resolveApiUrl();
const TOKEN_KEY = "wayfare.session";

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}
async function saveToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Native apps authenticate with Better Auth's bearer plugin; the token lives in the secure keystore. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, __DEV__ ? `Can't reach the API at ${API_URL}. Is "npm run dev:api" running, and is the phone on the same Wi-Fi?` : "Can't reach the server. Check your connection.");
  }
  if (res.status === 401 && !path.startsWith("/auth")) {
    await saveToken(null);
    onSignedOut?.();
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      msg = b?.error?.message ?? b?.message ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json: unknown = {}) => api<T>(p, { method: "POST", json });
export const patch = <T,>(p: string, json: unknown) => api<T>(p, { method: "PATCH", json });
export const put = <T,>(p: string, json: unknown) => api<T>(p, { method: "PUT", json });
export const del = <T,>(p: string) => api<T>(p, { method: "DELETE" });

async function authRequest(path: string, body: unknown) {
  const res = await fetch(`${API_URL}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "wayfare://" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.message ?? "Authentication failed");
  const t = res.headers.get("set-auth-token") ?? data?.token;
  if (!t) throw new ApiError(500, "No session returned");
  await saveToken(t);
  return data;
}

export const signIn = (email: string, password: string) => authRequest("/sign-in/email", { email, password });
export const signUp = (name: string, email: string, password: string) => authRequest("/sign-up/email", { name, email, password });
export async function signOut() {
  await fetch(`${API_URL}/api/auth/sign-out`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: "wayfare://" } }).catch(() => {});
  await saveToken(null);
}

export async function uploadScreenshot<T>(uri: string, mimeType = "image/jpeg"): Promise<T> {
  const fd = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  fd.append("file", { uri, name: "screenshot.jpg", type: mimeType } as unknown as Blob);
  return api<T>("/imports/screenshot", { method: "POST", body: fd });
}

/** Image paths stored by the API are relative; make them absolute for <Image>. */
export const mediaUrl = (u: string | null | undefined) => (!u ? null : u.startsWith("/") ? `${API_URL}${u}` : u);

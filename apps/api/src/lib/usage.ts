import { FREE_LIMITS, PRO_LIMITS } from "@wayfare/shared";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Env } from "../env";
import { isDevMode } from "./devmode";
import { limitReached } from "./errors";

export type UsageKind = "aiGenerations" | "imports";

const monthKey = () => new Date().toISOString().slice(0, 7);
const key = (userId: string, kind: UsageKind) => `usage:${userId}:${kind}:${monthKey()}`;

export async function getSubscription(env: Env, userId: string) {
  return getDb(env.DB).query.subscriptions.findFirst({ where: eq(schema.subscriptions.userId, userId) });
}

export async function getPlan(env: Env, userId: string): Promise<"free" | "pro"> {
  if (isDevMode(env)) return "pro"; // DEV MODE: no paywall
  const sub = await getSubscription(env, userId);
  if (!sub) return "free";
  const active = ["active", "trialing"].includes(sub.status);
  const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now();
  return active && notExpired ? "pro" : "free";
}

export function limitsFor(plan: "free" | "pro") {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
}

export async function getUsage(env: Env, userId: string) {
  const [ai, imp] = await Promise.all([env.KV.get(key(userId, "aiGenerations")), env.KV.get(key(userId, "imports"))]);
  return { aiGenerations: Number(ai ?? 0), imports: Number(imp ?? 0) };
}

/**
 * Soft monthly quota backed by KV. KV is eventually consistent, so a burst could exceed the limit
 * slightly; that's acceptable for quotas (abuse protection lives in `rateLimit`).
 */
export async function consumeQuota(env: Env, userId: string, kind: UsageKind) {
  if (isDevMode(env)) return; // DEV MODE: unlimited
  const plan = await getPlan(env, userId);
  const limits = limitsFor(plan);
  const limit = kind === "aiGenerations" ? limits.aiGenerationsPerMonth : limits.importsPerMonth;
  const k = key(userId, kind);
  const used = Number((await env.KV.get(k)) ?? 0);
  if (used >= limit) {
    const what = kind === "aiGenerations" ? "itinerary generations" : "imports";
    throw limitReached(
      plan === "free" ? `You've used all ${limit} free ${what} this month. Upgrade to Pro for more.` : `Monthly limit of ${limit} ${what} reached.`,
    );
  }
  await env.KV.put(k, String(used + 1), { expirationTtl: 60 * 60 * 24 * 40 });
}

/** Short-window rate limit for expensive endpoints (per user, per action). */
export async function rateLimit(env: Env, userId: string, action: string, max: number, windowSec = 60) {
  if (isDevMode(env)) return; // DEV MODE: no throttling
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${action}:${userId}:${bucket}`;
  const n = Number((await env.KV.get(k)) ?? 0);
  if (n >= max) throw limitReached("You're doing that too quickly. Please wait a moment and try again.");
  await env.KV.put(k, String(n + 1), { expirationTtl: Math.max(60, windowSec * 2) });
}

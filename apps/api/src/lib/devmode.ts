import { getDb, schema } from "../db";
import type { AuthUser, Env } from "../env";

/**
 * DEV MODE (R&D only): set DEV_MODE=true in apps/api/.dev.vars to bypass sign-in, onboarding,
 * quotas, rate limits and paywalls. Every unauthenticated request runs as a shared test user.
 *
 * Safety: ignored unless APP_URL points at localhost, so it can never switch on in production.
 * To restore normal behaviour, remove DEV_MODE (or set it to false). No other code changes are needed.
 */
export function isDevMode(env: Env): boolean {
  if (env.DEV_MODE !== "true") return false;
  const local = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?/.test(env.APP_URL);
  if (!local) console.warn("DEV_MODE ignored: APP_URL is not a localhost URL");
  return local;
}

export const DEV_USER: AuthUser = {
  id: "dev-user",
  name: "Dev Tester",
  email: "dev@wayfare.local",
  image: null,
  emailVerified: true,
};

let ensured = false;

/** Creates the test user and an already-onboarded profile the first time they're needed. */
export async function ensureDevUser(env: Env): Promise<AuthUser> {
  if (ensured) return DEV_USER;
  const db = getDb(env.DB);
  await db
    .insert(schema.user)
    .values({ id: DEV_USER.id, name: DEV_USER.name, email: DEV_USER.email, emailVerified: true })
    .onConflictDoNothing();
  await db.insert(schema.profiles).values({ userId: DEV_USER.id, onboarded: true, onboardingStep: 5 }).onConflictDoNothing();
  ensured = true;
  return DEV_USER;
}

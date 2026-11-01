import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv, AuthUser } from "../env";
import { ensureDevUser, isDevMode } from "../lib/devmode";
import { ApiError } from "../lib/errors";

/** Loads the session (cookie for web, `Authorization: Bearer` for native apps) into `c.var.user`. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  let user = (session?.user as AuthUser | undefined) ?? null;
  // DEV MODE: no session needed — fall back to the shared test user. A real sign-in still takes precedence.
  if (!user && isDevMode(c.env)) user = await ensureDevUser(c.env);
  c.set("user", user);
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) throw new ApiError(401, "unauthorized", "Please sign in to continue");
  await next();
});

export function currentUser(c: { get(key: "user"): AuthUser | null }): AuthUser {
  const u = c.get("user");
  if (!u) throw new ApiError(401, "unauthorized", "Please sign in to continue");
  return u;
}

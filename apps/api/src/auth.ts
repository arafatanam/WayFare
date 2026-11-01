import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { getDb, schema } from "./db";
import type { Env } from "./env";
import { sendEmail } from "./lib/email";
import { deleteUserData } from "./lib/account";

/**
 * Better Auth is created per request because Worker bindings are only available inside the handler.
 * Web uses cookies (same origin); native apps use the `bearer` plugin with the session token.
 */
export function createAuth(env: Env) {
  const db = getDb(env.DB);
  return betterAuth({
    appName: "Wayfare",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    trustedOrigins: [env.APP_URL, "wayfare://", "exp://"],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your Wayfare password",
          text: `Someone asked to reset your Wayfare password. If that was you, open this link within an hour:\n\n${url}\n\nIf not, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Verify your email for Wayfare",
          text: `Welcome to Wayfare! Confirm your email address:\n\n${url}`,
        });
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await deleteUserData(env, user.id);
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Pending trip invites are matched by email, so invites sent before sign-up show up automatically.
            await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
          },
        },
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    rateLimit: { enabled: true, window: 60, max: 60, storage: "memory" },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

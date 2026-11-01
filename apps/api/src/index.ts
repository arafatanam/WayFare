import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { addDays } from "@wayfare/shared";
import { createAuth } from "./auth";
import { getDb, schema } from "./db";
import type { AppEnv, Env, ImportMessage } from "./env";
import { requireTripRole } from "./lib/access";
import { isDevMode } from "./lib/devmode";
import { ApiError } from "./lib/errors";
import { notify } from "./lib/notify";
import { currentUser, requireUser, sessionMiddleware } from "./middleware/auth";
import { handleImportBatch } from "./queues/imports";
import { billingRoutes, webhookRoutes } from "./routes/billing";
import { collectionsRoutes } from "./routes/collections";
import { exploreRoutes } from "./routes/explore";
import { importsRoutes } from "./routes/imports";
import { itineraryRoutes } from "./routes/itinerary";
import { meRoutes, notificationRoutes } from "./routes/me";
import { mediaRoutes } from "./routes/media";
import { placesRoutes } from "./routes/places";
import { copyRoutes, inviteRoutes, publicRoutes, shareRoutes, tripInviteRoutes } from "./routes/share";
import { tripsRoutes } from "./routes/trips";

export { TripRoom } from "./durable/trip-room";
export { ItineraryWorkflow } from "./workflows/itinerary";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders({ crossOriginResourcePolicy: false }));

// Mobile apps call the API cross-origin with bearer tokens; the web app is same-origin.
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowed = origin && (origin === c.env.APP_URL || origin.startsWith("http://localhost:"));
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Max-Age": "86400",
          }
        : {},
    });
  }
  await next();
  if (allowed) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Access-Control-Expose-Headers", "set-auth-token");
  }
});

app.get("/health", (c) => c.json({ ok: true, devMode: isDevMode(c.env) }));

// Better Auth handles /api/auth/* (sign up/in/out, sessions, password reset, verification, OAuth, delete user).
app.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Unauthenticated endpoints.
app.route("/webhooks", webhookRoutes);
app.route("/public", publicRoutes);

app.use("*", sessionMiddleware);
app.route("/media", mediaRoutes); // GET is capability-based; POST requires a session (checked in handler)

app.use("*", requireUser);
app.route("/me", meRoutes);
app.route("/notifications", notificationRoutes);
app.route("/places", placesRoutes);
app.route("/collections", collectionsRoutes);
app.route("/trips/:tripId/itinerary", itineraryRoutes);
app.route("/trips/:tripId/invites", tripInviteRoutes);
app.route("/trips", tripsRoutes);
app.route("/imports", importsRoutes);
app.route("/share-links", shareRoutes);
app.route("/invites", inviteRoutes);
app.route("/copy", copyRoutes);
app.route("/explore", exploreRoutes);
app.route("/billing", billingRoutes);

/** Real-time trip room. Auth + role are checked here; the Durable Object trusts the forwarded identity. */
app.get("/trips/:tripId/live", async (c) => {
  const user = currentUser(c);
  const tripId = c.req.param("tripId");
  if (c.req.header("Upgrade") !== "websocket") throw new ApiError(426, "upgrade_required", "Expected a WebSocket");
  await requireTripRole(getDb(c.env.DB), tripId, user.id, "viewer");
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-User-Id", user.id);
  headers.set("X-User-Name", user.name);
  const stub = c.env.TRIP_ROOM.get(c.env.TRIP_ROOM.idFromName(tripId));
  const res = await stub.fetch(new Request("https://room/ws", { headers }));
  if (!res.webSocket) return res;
  // Re-wrap so middleware can still set headers (the DO's 101 response has immutable headers).
  return new Response(null, { status: 101, webSocket: res.webSocket });
});

app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
  if (err instanceof HTTPException) {
    // zod-validator returns 400 with details in the response.
    return err.getResponse();
  }
  console.error("unhandled", c.req.method, c.req.path, err);
  return c.json({ error: { code: "internal", message: "Something went wrong. Please try again." } }, 500);
});

/** Daily trip reminders (3 days before and the day before). Push text stays generic. */
async function sendTripReminders(env: Env) {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  for (const offset of [1, 3]) {
    const date = addDays(today, offset);
    const trips = await db.select().from(schema.trips).where(and(eq(schema.trips.startDate, date), eq(schema.trips.status, "planned")));
    if (!trips.length) continue;
    const members = await db.select().from(schema.tripMembers).where(inArray(schema.tripMembers.tripId, trips.map((t) => t.id)));
    for (const m of members) {
      const t = trips.find((x) => x.id === m.tripId)!;
      await notify(env, m.userId, "tripReminders", {
        type: "trip.reminder",
        title: offset === 1 ? `${t.name} starts tomorrow` : `${t.name} starts in ${offset} days`,
        link: `/trips/${t.id}`,
        pushText: offset === 1 ? "Your trip starts tomorrow." : `Your trip starts in ${offset} days.`,
      });
    }
  }
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ImportMessage>, env: Env) {
    await handleImportBatch(batch, env);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendTripReminders(env));
  },
} satisfies ExportedHandler<Env, ImportMessage>;

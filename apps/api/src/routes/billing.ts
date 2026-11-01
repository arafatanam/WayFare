import { eq } from "drizzle-orm";
import { Hono } from "hono";
import Stripe from "stripe";
import { getDb, schema } from "../db";
import type { AppEnv, Env } from "../env";
import { track } from "../lib/analytics";
import { ApiError, badRequest } from "../lib/errors";
import { currentUser } from "../middleware/auth";

function stripe(env: Env) {
  if (!env.STRIPE_SECRET_KEY) throw new ApiError(503, "billing_unavailable", "Payments aren't configured on this server");
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}

// --- Web payments (Stripe) ------------------------------------------------------

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.post("/checkout", async (c) => {
  const user = currentUser(c);
  if (!c.env.STRIPE_PRICE_PRO) throw new ApiError(503, "billing_unavailable", "Payments aren't configured on this server");
  const sub = await getDb(c.env.DB).query.subscriptions.findFirst({ where: eq(schema.subscriptions.userId, user.id) });
  if (sub && ["active", "trialing"].includes(sub.status)) throw badRequest("You already have an active subscription");
  const session = await stripe(c.env).checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: c.env.STRIPE_PRICE_PRO, quantity: 1 }],
    client_reference_id: user.id,
    ...(sub?.provider === "stripe" && sub.externalCustomerId ? { customer: sub.externalCustomerId } : { customer_email: user.email }),
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id },
    allow_promotion_codes: true,
    success_url: `${c.env.APP_URL}/profile/subscription?status=success`,
    cancel_url: `${c.env.APP_URL}/profile/subscription?status=cancelled`,
  });
  c.executionCtx.waitUntil(track(c.env, "checkout_started", user.id));
  return c.json({ url: session.url });
});

billingRoutes.post("/portal", async (c) => {
  const user = currentUser(c);
  const sub = await getDb(c.env.DB).query.subscriptions.findFirst({ where: eq(schema.subscriptions.userId, user.id) });
  if (!sub || sub.provider !== "stripe" || !sub.externalCustomerId) {
    throw badRequest(sub ? "Manage this subscription from the app store where you bought it" : "No subscription to manage");
  }
  const portal = await stripe(c.env).billingPortal.sessions.create({ customer: sub.externalCustomerId, return_url: `${c.env.APP_URL}/profile/subscription` });
  return c.json({ url: portal.url });
});

// --- Webhooks (unauthenticated, signature-verified) ----------------------------------

export const webhookRoutes = new Hono<AppEnv>();

async function seen(env: Env, id: string, provider: string, type: string, userId: string | null) {
  const db = getDb(env.DB);
  const existing = await db.query.billingEvents.findFirst({ where: eq(schema.billingEvents.id, `${provider}:${id}`) });
  if (existing) return true;
  await db.insert(schema.billingEvents).values({ id: `${provider}:${id}`, provider, type, userId });
  return false;
}

async function upsertSubscription(env: Env, s: typeof schema.subscriptions.$inferInsert) {
  await getDb(env.DB)
    .insert(schema.subscriptions)
    .values(s)
    .onConflictDoUpdate({ target: schema.subscriptions.userId, set: { ...s, updatedAt: new Date() } });
}

webhookRoutes.post("/stripe", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) return c.text("not configured", 503);
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("missing signature", 400);
  const body = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe(c.env).webhooks.constructEventAsync(body, sig, c.env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return c.text("invalid signature", 400);
  }

  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.userId;
    if (!userId) return c.json({ ignored: true });
    if (await seen(c.env, event.id, "stripe", event.type, userId)) return c.json({ duplicate: true });
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    await upsertSubscription(c.env, {
      userId,
      provider: "stripe",
      plan: "pro",
      status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
      externalCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      externalSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    });
    c.executionCtx.waitUntil(track(c.env, "subscription_changed", userId, { provider: "stripe", status: sub.status }));
  }
  return c.json({ received: true });
});

/**
 * Superwall subscription webhooks (mobile purchases). The mobile apps identify the Superwall user with our
 * user id, so `appUserId` maps directly. Signature verification uses the Svix scheme
 * (svix-id / svix-timestamp / svix-signature, secret "whsec_…"); check Superwall's dashboard for your
 * webhook's signing secret and confirm the event field names against their current docs.
 */
webhookRoutes.post("/superwall", async (c) => {
  if (!c.env.SUPERWALL_WEBHOOK_SECRET) return c.text("not configured", 503);
  const body = await c.req.text();
  const ok = await verifySvix(c.env.SUPERWALL_WEBHOOK_SECRET, c.req.header("svix-id"), c.req.header("svix-timestamp"), c.req.header("svix-signature"), body);
  if (!ok) return c.text("invalid signature", 400);

  const evt = JSON.parse(body) as { id?: string; type?: string; data?: Record<string, any> };
  const d = evt.data ?? {};
  const userId: string | undefined = d.originalAppUserId ?? d.appUserId ?? d.app_user_id;
  const type = String(evt.type ?? d.type ?? "").toLowerCase();
  if (!userId || !type) return c.json({ ignored: true });
  if (await seen(c.env, evt.id ?? c.req.header("svix-id")!, "superwall", type, userId)) return c.json({ duplicate: true });

  const exists = await getDb(c.env.DB).query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!exists) return c.json({ ignored: true });

  const expiresRaw = d.expirationAt ?? d.expiresAt ?? d.expiration_at_ms;
  const expires = expiresRaw ? new Date(typeof expiresRaw === "number" ? expiresRaw : Date.parse(expiresRaw)) : null;
  const status = /expir|refund|revok/.test(type) ? "expired" : /cancel/.test(type) ? "canceled_pending" : /trial/.test(type) ? "trialing" : "active";
  await upsertSubscription(c.env, {
    userId,
    provider: String(d.store ?? "app_store").toLowerCase(),
    plan: "pro",
    // A cancellation keeps access until the period ends.
    status: status === "canceled_pending" ? "active" : status,
    externalSubscriptionId: d.originalTransactionId ?? d.transactionId ?? null,
    currentPeriodEnd: expires && !Number.isNaN(expires.getTime()) ? expires : null,
  });
  c.executionCtx.waitUntil(track(c.env, "subscription_changed", userId, { provider: "superwall", status }));
  return c.json({ received: true });
});

async function verifySvix(secret: string, id?: string, ts?: string, sigHeader?: string, body?: string) {
  if (!id || !ts || !sigHeader || body == null) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    return sig && timingSafeEqual(sig, expected);
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

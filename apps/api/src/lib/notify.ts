import { eq } from "drizzle-orm";
import { userPreferences } from "@wayfare/shared";
import { getDb, schema } from "../db";
import type { Env } from "../env";
import { newId } from "./ids";

type Category = "tripReminders" | "collaboration" | "imports" | "itinerary";

/**
 * Creates an in-app notification and, when the user has devices registered, a push notification.
 * Push text is deliberately generic so trip details aren't shown on a locked screen.
 */
export async function notify(
  env: Env,
  userId: string,
  category: Category,
  n: { type: string; title: string; body?: string; link?: string; pushText: string },
) {
  const db = getDb(env.DB);
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  const prefs = userPreferences.parse(profile?.preferences ?? {});
  if (!prefs.notifications[category]) return;

  await db.insert(schema.notifications).values({ id: newId(), userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null });

  const tokens = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.userId, userId) });
  const expo = tokens.filter((t) => t.token.startsWith("ExponentPushToken"));
  if (expo.length) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expo.map((t) => ({ to: t.token, title: "Wayfare", body: n.pushText, data: { link: n.link } }))),
    }).catch(() => {});
  }
}

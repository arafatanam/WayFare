import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Env } from "../env";
import { sha256Hex } from "./ids";

/**
 * Product analytics to Tinybird's Events API. Only coarse, non-personal properties are sent:
 * the user id is hashed and no names, emails, notes, place names or URLs are included.
 * Users who turn off analytics in their preferences are skipped.
 */
export async function track(env: Env, event: string, userId: string | null, props: Record<string, string | number | boolean> = {}) {
  if (!env.TINYBIRD_TOKEN) return;
  try {
    if (userId) {
      const profile = await getDb(env.DB).query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
      if ((profile?.preferences as { analyticsOptIn?: boolean } | undefined)?.analyticsOptIn === false) return;
    }
    const row = {
      timestamp: new Date().toISOString(),
      event,
      user_hash: userId ? (await sha256Hex(`${env.BETTER_AUTH_SECRET}:${userId}`)).slice(0, 32) : "",
      props: JSON.stringify(props),
    };
    await fetch(`${env.TINYBIRD_HOST ?? "https://api.tinybird.co"}/v0/events?name=app_events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TINYBIRD_TOKEN}` },
      body: JSON.stringify(row),
    });
  } catch {
    // Analytics must never break the request.
  }
}

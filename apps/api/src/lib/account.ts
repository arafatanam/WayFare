import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Env } from "../env";

/**
 * Removes data that is not covered by foreign-key cascades on the user row.
 * Retention: rows owned by the user cascade-delete with the account; private R2 objects are purged here;
 * billing_events keep only an id/type for accounting and are disassociated from the user.
 */
export async function deleteUserData(env: Env, userId: string) {
  const db = getDb(env.DB);
  let cursor: string | undefined;
  do {
    const list = await env.MEDIA.list({ prefix: `private/${userId}/`, cursor });
    if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await db.update(schema.billingEvents).set({ userId: null }).where(eq(schema.billingEvents.userId, userId));
}

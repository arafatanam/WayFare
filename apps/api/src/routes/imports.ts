import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { importInput, placeInput, type ImportCandidate } from "@wayfare/shared";
import { getDb, schema } from "../db";
import type { AppEnv } from "../env";
import { track } from "../lib/analytics";
import { badRequest, notFound } from "../lib/errors";
import { detectPlatform } from "../lib/extract";
import { searchPlaces } from "../lib/geo";
import { aiProvider } from "../lib/ai";
import { newId } from "../lib/ids";
import { candidatesFromText } from "../queues/imports";
import { toImport } from "../lib/serialize";
import { consumeQuota, rateLimit } from "../lib/usage";
import { currentUser } from "../middleware/auth";
import { addToCollections, withMemberships } from "./places";

export const importsRoutes = new Hono<AppEnv>();

const MAX_SCREENSHOT = 6 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic" };

importsRoutes.get("/", async (c) => {
  const user = currentUser(c);
  const rows = await getDb(c.env.DB).select().from(schema.imports).where(eq(schema.imports.userId, user.id)).orderBy(desc(schema.imports.createdAt)).limit(30);
  return c.json(rows.map(toImport));
});

importsRoutes.get("/:id", async (c) => {
  const user = currentUser(c);
  const row = await getDb(c.env.DB).query.imports.findFirst({ where: and(eq(schema.imports.id, c.req.param("id")), eq(schema.imports.userId, user.id)) });
  if (!row) throw notFound("Import");
  return c.json(toImport(row));
});

importsRoutes.post("/", zValidator("json", importInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const id = newId();
  await rateLimit(c.env, user.id, "import", 20, 60);

  if (body.type === "text") {
    // A typed place name is resolved with place search, no AI needed. Longer text (a pasted caption or message
    // naming several places) goes through AI extraction when a model is configured.
    const sentence = body.text.split(/s+/).length > 5;
    let candidates: ImportCandidate[] = [];
    if (!sentence) {
      const results = await searchPlaces(c.env, body.text, { limit: 6 });
      candidates = results.map((r, i) => ({ ...r, confidence: i === 0 ? 0.8 : 0.5, reason: null }));
    }
    if (!candidates.length && aiProvider(c.env)) {
      await consumeQuota(c.env, user.id, "imports");
      candidates = await candidatesFromText(c.env, body.text).catch((e) => {
        console.error("text extraction failed", e);
        return [];
      });
    }
    await db.insert(schema.imports).values({
      id,
      userId: user.id,
      type: "text",
      input: body.text,
      platform: "search",
      status: candidates.length ? "needs_review" : "failed",
      title: body.text,
      candidates,
      error: candidates.length ? null : "No matching places found. You can add it manually.",
    });
  } else {
    await consumeQuota(c.env, user.id, "imports");
    await db.insert(schema.imports).values({ id, userId: user.id, type: "url", input: body.url, platform: detectPlatform(body.url), status: "queued" });
    await c.env.IMPORT_QUEUE.send({ importId: id, userId: user.id });
  }
  c.executionCtx.waitUntil(track(c.env, "import_started", user.id, { type: body.type }));
  const row = (await db.query.imports.findFirst({ where: eq(schema.imports.id, id) }))!;
  return c.json(toImport(row), 202);
});

importsRoutes.post("/screenshot", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  await rateLimit(c.env, user.id, "import", 20, 60);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach a screenshot image");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw badRequest("Screenshots must be PNG, JPEG, WebP or HEIC");
  if (file.size > MAX_SCREENSHOT) throw badRequest("Screenshot is too large (max 6 MB)");
  await consumeQuota(c.env, user.id, "imports");

  const id = newId();
  // Screenshots are private to the uploader and only read by the import job.
  const key = `private/${user.id}/imports/${id}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await db.insert(schema.imports).values({ id, userId: user.id, type: "screenshot", input: key, mediaKey: key, platform: "screenshot", status: "queued" });
  await c.env.IMPORT_QUEUE.send({ importId: id, userId: user.id });
  c.executionCtx.waitUntil(track(c.env, "import_started", user.id, { type: "screenshot" }));
  return c.json(toImport((await db.query.imports.findFirst({ where: eq(schema.imports.id, id) }))!), 202);
});

importsRoutes.post("/:id/retry", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const row = await db.query.imports.findFirst({ where: and(eq(schema.imports.id, c.req.param("id")), eq(schema.imports.userId, user.id)) });
  if (!row) throw notFound("Import");
  if (row.type === "text" || row.status !== "failed") throw badRequest("Only failed link or screenshot imports can be retried");
  await rateLimit(c.env, user.id, "import", 20, 60);
  await db.update(schema.imports).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(schema.imports.id, row.id));
  await c.env.IMPORT_QUEUE.send({ importId: row.id, userId: user.id });
  return c.json(toImport((await db.query.imports.findFirst({ where: eq(schema.imports.id, row.id) }))!), 202);
});

const confirmInput = z.object({
  places: z.array(placeInput.omit({ collectionIds: true, sourcePlatform: true })).min(1).max(20),
  collectionIds: z.array(z.string()).max(20).default([]),
  tripId: z.string().optional(),
});

/** The user reviews/corrects candidates, then saves them. Source info from the import is attached. */
importsRoutes.post("/:id/confirm", zValidator("json", confirmInput), async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const row = await db.query.imports.findFirst({ where: and(eq(schema.imports.id, c.req.param("id")), eq(schema.imports.userId, user.id)) });
  if (!row) throw notFound("Import");
  const body = c.req.valid("json");

  const created: string[] = [];
  for (const p of body.places) {
    const id = newId();
    await db.insert(schema.places).values({
      ...p,
      id,
      userId: user.id,
      sourcePlatform: row.platform,
      sourceUrl: p.sourceUrl ?? (row.type === "url" ? row.input : null),
      sourceText: p.sourceText ?? row.caption,
      imageUrl: p.imageUrl ?? row.imageUrl,
    });
    if (body.collectionIds.length) await addToCollections(db, id, body.collectionIds, user.id);
    created.push(id);
  }
  if (body.tripId) {
    const member = await db.query.tripMembers.findFirst({ where: and(eq(schema.tripMembers.tripId, body.tripId), eq(schema.tripMembers.userId, user.id)) });
    if (member && member.role !== "viewer") {
      for (const placeId of created) await db.insert(schema.tripPlaces).values({ tripId: body.tripId, placeId, addedBy: user.id }).onConflictDoNothing();
    }
  }
  await db.update(schema.imports).set({ status: "completed", updatedAt: new Date() }).where(eq(schema.imports.id, row.id));
  c.executionCtx.waitUntil(track(c.env, "import_confirmed", user.id, { platform: row.platform, places: created.length }));
  const rows = await db.query.places.findMany({ where: (t, { inArray }) => inArray(t.id, created) });
  return c.json(await withMemberships(db, rows, user.id), 201);
});

importsRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const db = getDb(c.env.DB);
  const row = await db.query.imports.findFirst({ where: and(eq(schema.imports.id, c.req.param("id")), eq(schema.imports.userId, user.id)) });
  if (!row) throw notFound("Import");
  if (row.mediaKey) await c.env.MEDIA.delete(row.mediaKey);
  await db.delete(schema.imports).where(eq(schema.imports.id, row.id));
  return c.json({ ok: true });
});

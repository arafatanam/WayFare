import { Hono } from "hono";
import type { AppEnv } from "../env";
import { track } from "../lib/analytics";
import { badRequest, notFound } from "../lib/errors";
import { newToken } from "../lib/ids";
import { rateLimit } from "../lib/usage";
import { currentUser } from "../middleware/auth";

/**
 * R2 media.
 *  - `media/<token>`: cover images and copied thumbnails. The token is unguessable, so the URL itself is the
 *    capability — it can be embedded in shared/public trips without exposing anything else.
 *  - `private/<userId>/…`: uploads like screenshots; only the owner can read them.
 */
export const mediaRoutes = new Hono<AppEnv>();

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX = 5 * 1024 * 1024;

mediaRoutes.post("/", async (c) => {
  const user = currentUser(c);
  await rateLimit(c.env, user.id, "upload", 30, 60);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach an image");
  if (!TYPES.includes(file.type)) throw badRequest("Images must be PNG, JPEG, WebP or GIF");
  if (file.size > MAX) throw badRequest("Image is too large (max 5 MB)");
  const key = `media/${newToken()}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: user.id } });
  c.executionCtx.waitUntil(track(c.env, "image_uploaded", user.id));
  return c.json({ url: `/api/media/${key}` }, 201);
});

mediaRoutes.get("/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/media\//, ""));
  if (key.includes("..")) throw notFound("File");
  if (key.startsWith("private/")) {
    const user = c.get("user");
    if (!user || !key.startsWith(`private/${user.id}/`)) throw notFound("File");
  } else if (!key.startsWith("media/")) {
    throw notFound("File");
  }
  const obj = await c.env.MEDIA.get(key);
  if (!obj) throw notFound("File");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", key.startsWith("private/") ? "private, max-age=300" : "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

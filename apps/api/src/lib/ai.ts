import type { z } from "zod";
import type { Env } from "../env";

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export class AiError extends Error {}

/**
 * OpenAI-compatible chat completion.
 *  - Default: OpenRouter (DeepSeek), routed through Cloudflare AI Gateway when CF_ACCOUNT_ID + AI_GATEWAY_ID are set
 *    (gives caching, logs, rate limiting, and cost analytics), otherwise directly to openrouter.ai.
 *  - Groq: used when a Groq key is set (unless AI_PROVIDER says otherwise). Fast and has a free tier.
 *  - AI_PROVIDER=selfhosted: any OpenAI-compatible server (e.g. vLLM on RunPod / Vast.ai).
 */
export function aiProvider(env: Env): "openrouter" | "groq" | "selfhosted" | null {
  if (env.AI_PROVIDER === "selfhosted" && env.SELFHOSTED_AI_URL) return "selfhosted";
  const groq = !!groqKey(env);
  if (env.AI_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY) return "openrouter";
  if (env.AI_PROVIDER === "groq" && groq) return "groq";
  return groq ? "groq" : env.OPENROUTER_API_KEY ? "openrouter" : null;
}

const groqKey = (env: Env) => env.GROQ_API_KEY || env.GORQ_API_KEY;

export async function chat(env: Env, messages: ChatMessage[], opts: { model?: string; json?: boolean; maxTokens?: number; temperature?: number } = {}) {
  const provider = aiProvider(env);
  let url: string;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let model = opts.model ?? env.AI_MODEL;

  if (provider === "selfhosted") {
    url = `${env.SELFHOSTED_AI_URL!.replace(/\/$/, "")}/chat/completions`;
    if (env.SELFHOSTED_AI_KEY) headers.Authorization = `Bearer ${env.SELFHOSTED_AI_KEY}`;
    if (!opts.model && env.SELFHOSTED_AI_MODEL) model = env.SELFHOSTED_AI_MODEL;
  } else if (provider === "groq") {
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers.Authorization = `Bearer ${groqKey(env)}`;
    // AI_MODEL / AI_VISION_MODEL name OpenRouter models; map them to their Groq equivalents.
    const vision = opts.model === env.AI_VISION_MODEL;
    model = vision ? (env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b") : (env.GROQ_MODEL ?? "openai/gpt-oss-120b");
  } else {
    if (!env.OPENROUTER_API_KEY) throw new AiError("AI is not configured (set GROQ_API_KEY or OPENROUTER_API_KEY)");
    url =
      env.CF_ACCOUNT_ID && env.AI_GATEWAY_ID
        ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openrouter/v1/chat/completions`
        : "https://openrouter.ai/api/v1/chat/completions";
    headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
    headers["HTTP-Referer"] = env.APP_URL;
    headers["X-Title"] = "Wayfare";
    if (env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }

  const body = JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 4000,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  let res = await fetch(url, { method: "POST", headers, body });

  // If the AI Gateway isn't set up in the Cloudflare dashboard yet (error 2001), call OpenRouter directly
  // so AI features keep working; create the gateway (name = AI_GATEWAY_ID) to get logs, caching and analytics.
  if (!res.ok && url.includes("gateway.ai.cloudflare.com")) {
    const text = await res.clone().text();
    if (/"code":\s*2001|configure AI Gateway/i.test(text)) {
      console.warn(`AI Gateway "${env.AI_GATEWAY_ID}" not found — falling back to OpenRouter directly`);
      delete headers["cf-aig-authorization"];
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers, body });
    }
  }
  if (!res.ok) throw new AiError(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiError("AI returned an empty response");
  return content;
}

/** Calls the model in JSON mode and validates the output; AI output is untrusted and must match the schema. */
export async function chatJson<T extends z.ZodType>(env: Env, schema: T, messages: ChatMessage[], opts: { model?: string; maxTokens?: number } = {}): Promise<z.infer<T>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(env, messages, { ...opts, json: true, temperature: attempt ? 0.2 : 0.4 });
    try {
      const parsed = JSON.parse(stripFences(raw));
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastErr = result.error;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new AiError(`AI returned an invalid response: ${String(lastErr).slice(0, 200)}`);
}

function stripFences(s: string) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

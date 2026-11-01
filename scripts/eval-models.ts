/**
 * Model evaluation helper: pulls benchmark data from Artificial Analysis and lists models that are also
 * available on OpenRouter, so you can pick AI_MODEL / AI_VISION_MODEL on quality, price and speed.
 *
 *   ARTIFICIAL_ANALYSIS_API_KEY=... npm run eval:models
 *
 * Check https://artificialanalysis.ai/documentation for the current API shape; field access below is defensive.
 */
const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
if (!key) {
  console.error("Set ARTIFICIAL_ANALYSIS_API_KEY");
  process.exit(1);
}

const [aa, or] = await Promise.all([
  fetch("https://artificialanalysis.ai/api/v2/data/llms/models", { headers: { "x-api-key": key } }).then((r) => r.json()),
  fetch("https://openrouter.ai/api/v1/models").then((r) => r.json()),
]);

const orModels: { id: string; name: string; pricing?: { prompt?: string; completion?: string } }[] = or.data ?? [];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const rows = (aa.data ?? [])
  .map((m: any) => {
    const match = orModels.find((o) => norm(o.id.split("/")[1] ?? "").includes(norm(m.slug ?? m.name ?? "")));
    return {
      model: m.name,
      openrouterId: match?.id ?? "—",
      intelligence: m.evaluations?.artificial_analysis_intelligence_index ?? null,
      pricePer1M: m.pricing?.price_1m_blended_3_to_1 ?? null,
      tokensPerSec: m.median_output_tokens_per_second ?? null,
    };
  })
  .filter((r: any) => r.openrouterId !== "—" && r.intelligence != null)
  .sort((a: any, b: any) => b.intelligence / (b.pricePer1M || 1) - a.intelligence / (a.pricePer1M || 1))
  .slice(0, 25);

console.table(rows);
console.log("Default: deepseek/deepseek-chat. Set AI_MODEL in apps/api/wrangler.jsonc to switch.");

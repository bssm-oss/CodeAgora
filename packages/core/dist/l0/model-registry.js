import { z } from "zod";
import { extractFamily, isReasoningModel } from "./family-classifier.js";
const RawRankingsDataSchema = z.object({
  source: z.string(),
  models: z.array(z.object({
    source: z.string(),
    model_id: z.string(),
    name: z.string(),
    swe_bench: z.string().optional(),
    tier: z.string().optional(),
    context: z.string().optional(),
    aa_intelligence: z.number().optional(),
    aa_speed_tps: z.number().optional()
  }).passthrough())
});
const RawGroqDataSchema = z.object({
  source: z.string(),
  models: z.array(z.object({
    model_id: z.string(),
    name: z.string(),
    context: z.string().optional()
  }))
});
const VALID_TIERS = /* @__PURE__ */ new Set(["S+", "S", "A+", "A", "A-", "B+", "B", "C"]);
let registry = null;
function buildKey(source, modelId) {
  return `${source}/${modelId}`;
}
function initFromData(rankingsData, groqData) {
  const map = /* @__PURE__ */ new Map();
  for (const raw of rankingsData.models) {
    const modelId = raw.model_id;
    const tier = VALID_TIERS.has(raw.tier ?? "") ? raw.tier : void 0;
    const meta = {
      source: raw.source,
      modelId,
      name: raw.name,
      tier,
      context: raw.context ?? "unknown",
      family: extractFamily(modelId),
      isReasoning: isReasoningModel(modelId),
      sweBench: raw.swe_bench,
      aaIntelligence: raw.aa_intelligence,
      aaSpeedTps: raw.aa_speed_tps
    };
    map.set(buildKey(raw.source, modelId), meta);
  }
  for (const raw of groqData.models) {
    const meta = {
      source: "groq",
      modelId: raw.model_id,
      name: raw.name,
      context: raw.context ?? "unknown",
      family: extractFamily(raw.model_id),
      isReasoning: isReasoningModel(raw.model_id)
    };
    map.set(buildKey("groq", raw.model_id), meta);
  }
  return map;
}
async function loadRegistry() {
  const fs = await import("fs/promises");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const dataDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../shared/src/data"
  );
  const [rankingsRaw, groqRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "model-rankings.json"), "utf-8"),
    fs.readFile(path.join(dataDir, "groq-models.json"), "utf-8")
  ]);
  registry = initFromData(
    RawRankingsDataSchema.parse(JSON.parse(rankingsRaw)),
    RawGroqDataSchema.parse(JSON.parse(groqRaw))
  );
}
function setRegistry(map) {
  registry = map;
}
function getRegistry() {
  if (!registry) {
    throw new Error("Model registry not initialized. Call loadRegistry() first.");
  }
  return registry;
}
function getModel(source, modelId) {
  return getRegistry().get(buildKey(source, modelId));
}
function getModelsByProvider(source) {
  return Array.from(getRegistry().values()).filter((m) => m.source === source);
}
function getModelsByFamily(family) {
  return Array.from(getRegistry().values()).filter((m) => m.family === family);
}
function getReasoningModels() {
  return Array.from(getRegistry().values()).filter((m) => m.isReasoning);
}
function getAvailableModels(providerNames) {
  const sources = new Set(providerNames);
  return Array.from(getRegistry().values()).filter((m) => sources.has(m.source));
}
function getAllModels() {
  return Array.from(getRegistry().values());
}
function getModelCount() {
  return getRegistry().size;
}
export {
  getAllModels,
  getAvailableModels,
  getModel,
  getModelCount,
  getModelsByFamily,
  getModelsByProvider,
  getReasoningModels,
  initFromData,
  loadRegistry,
  setRegistry
};

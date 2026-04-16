import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _pricingCache = null;
async function getPricing() {
  if (!_pricingCache) {
    const raw = await readFile(path.join(__dirname, "../../../shared/src/data/pricing.json"), "utf-8");
    _pricingCache = JSON.parse(raw);
  }
  return _pricingCache;
}
async function loadPricing() {
  return getPricing();
}
async function estimateCost(usage, provider, model) {
  const pricing = await getPricing();
  const key = `${provider}/${model}`;
  const entry = pricing[key];
  if (!entry) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: -1,
      model,
      provider
    };
  }
  const inputCost = usage.promptTokens / 1e3 * entry.input;
  const outputCost = usage.completionTokens / 1e3 * entry.output;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model,
    provider
  };
}
function formatCost(cost) {
  if (cost.totalCost < 0) {
    return "N/A";
  }
  return `$${cost.totalCost.toFixed(4)}`;
}
export {
  estimateCost,
  formatCost,
  loadPricing
};

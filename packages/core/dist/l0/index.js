import { getAvailableModels, loadRegistry } from "./model-registry.js";
import { HealthMonitor } from "./health-monitor.js";
import { selectModels, createBanditState } from "./model-selector.js";
import { BanditStore } from "./bandit-store.js";
let healthMonitor = null;
let banditStore = null;
let banditState = createBanditState();
let initialized = false;
let initPromise = null;
async function initL0(routerConfig) {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (initialized) return;
    await loadRegistry();
    healthMonitor = new HealthMonitor({
      circuitBreaker: routerConfig?.circuitBreaker,
      dailyBudget: routerConfig?.dailyBudget
    });
    banditStore = new BanditStore();
    await banditStore.load();
    banditState = banditStore.getAllArms();
    initialized = true;
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}
function resetL0() {
  healthMonitor = null;
  banditStore = null;
  banditState = createBanditState();
  initialized = false;
  initPromise = null;
}
function getBanditStore() {
  return banditStore;
}
async function resolveReviewers(reviewers, fileGroups, routerConfig) {
  const enabledReviewers = reviewers.filter((r) => r.enabled);
  const staticReviewers = [];
  const autoSlots = [];
  for (const entry of enabledReviewers) {
    if ("auto" in entry && entry.auto === true) {
      autoSlots.push({ id: entry.id, persona: entry.persona });
    } else {
      staticReviewers.push(entry);
    }
  }
  if (autoSlots.length === 0 || !routerConfig?.enabled) {
    if (autoSlots.length > 0 && !routerConfig?.enabled) {
      throw new Error(
        "Auto reviewers require modelRouter.enabled = true in config"
      );
    }
    return {
      reviewerInputs: buildInputs(staticReviewers, fileGroups),
      autoCount: 0
    };
  }
  await initL0(routerConfig);
  const providerNames = routerConfig.providers ? Object.entries(routerConfig.providers).filter(([, v]) => v.enabled).map(([k]) => k) : ["groq", "nim", "openrouter"];
  const allModels = getAvailableModels(providerNames);
  const monitor = healthMonitor;
  const healthyModels = allModels.filter(
    (m) => monitor.isAvailable(m.source, m.modelId)
  );
  const contextMin = routerConfig.constraints?.contextMin;
  let candidateModels = contextMin ? healthyModels.filter((m) => parseContextK(m.context) >= parseContextK(contextMin)) : healthyModels;
  const includeReasoning = routerConfig.constraints?.includeReasoning ?? true;
  if (!includeReasoning) {
    candidateModels = candidateModels.filter((m) => !m.isReasoning);
  }
  const selection = selectModels({
    count: autoSlots.length,
    availableModels: candidateModels,
    banditState,
    constraints: routerConfig.constraints,
    explorationRate: routerConfig.explorationRate
  });
  const BUILTIN_PERSONAS = ["builtin:security", "builtin:logic", "builtin:api-contract", "builtin:general"];
  const autoConfigs = selection.selections.map((sel, i) => ({
    id: autoSlots[i].id,
    model: sel.modelId,
    backend: "api",
    provider: sel.provider,
    persona: autoSlots[i].persona ?? BUILTIN_PERSONAS[i % BUILTIN_PERSONAS.length],
    timeout: 120,
    enabled: true
  }));
  const allConfigs = [...staticReviewers, ...autoConfigs];
  const inputs = [];
  for (let i = 0; i < allConfigs.length; i++) {
    const config = allConfigs[i];
    const group = fileGroups[i % fileGroups.length];
    const selectionEntry = selection.selections.find(
      (s) => s.modelId === config.model && s.provider === config.provider
    );
    inputs.push({
      config,
      groupName: group.name,
      diffContent: group.diffContent,
      prSummary: group.prSummary,
      ...selectionEntry && {
        selectionMeta: {
          selectionReason: selectionEntry.selectionReason,
          family: selectionEntry.family,
          isReasoning: selectionEntry.isReasoning
        }
      }
    });
  }
  return { reviewerInputs: inputs, autoCount: autoSlots.length };
}
function buildInputs(configs, fileGroups) {
  return configs.map((config, i) => {
    const group = fileGroups[i % fileGroups.length];
    return {
      config,
      groupName: group.name,
      diffContent: group.diffContent,
      prSummary: group.prSummary
    };
  });
}
function parseContextK(size) {
  const lower = size.toLowerCase().trim();
  const m = /^(\d+(?:\.\d+)?)\s*([km]?)$/.exec(lower);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (m[2] === "k") return Math.round(n * 1e3);
  if (m[2] === "m") return Math.round(n * 1e6);
  return Math.round(n);
}
import { HealthMonitor as HealthMonitor2 } from "./health-monitor.js";
import { selectModels as selectModels2, createBanditState as createBanditState2, updateBandit } from "./model-selector.js";
import { loadRegistry as loadRegistry2, getAvailableModels as getAvailableModels2, getAllModels } from "./model-registry.js";
import { extractFamily, isReasoningModel } from "./family-classifier.js";
import { BanditStore as BanditStore2 } from "./bandit-store.js";
import { QualityTracker } from "./quality-tracker.js";
import { scoreSpecificity, scoreReviewerSpecificity } from "./specificity-scorer.js";
export {
  BanditStore2 as BanditStore,
  HealthMonitor2 as HealthMonitor,
  QualityTracker,
  createBanditState2 as createBanditState,
  extractFamily,
  getAllModels,
  getAvailableModels2 as getAvailableModels,
  getBanditStore,
  initL0,
  isReasoningModel,
  loadRegistry2 as loadRegistry,
  resetL0,
  resolveReviewers,
  scoreReviewerSpecificity,
  scoreSpecificity,
  selectModels2 as selectModels,
  updateBandit
};

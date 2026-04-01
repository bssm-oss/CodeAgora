function sampleBeta(alpha, beta, rng) {
  const random = rng ?? Math.random;
  if (alpha <= 0) alpha = 0.01;
  if (beta <= 0) beta = 0.01;
  if (alpha === 1 && beta === 1) return random();
  const x = sampleGamma(alpha, random);
  const y = sampleGamma(beta, random);
  return x / (x + y);
}
function sampleGamma(alpha, random) {
  if (alpha < 1) {
    return sampleGamma(alpha + 1, random) * Math.pow(random(), 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  const MAX_ITERATIONS = 1e4;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let x;
    let v;
    do {
      x = normalRandom(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return alpha;
}
function normalRandom(random) {
  const u1 = Math.max(random(), 1e-10);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function armKey(model) {
  return `${model.source}/${model.modelId}`;
}
function selectModels(request) {
  const {
    count,
    availableModels,
    banditState,
    constraints = {},
    explorationRate = 0.1,
    rng
  } = request;
  if (availableModels.length === 0) {
    return {
      selections: [],
      metadata: { familyCount: 0, reasoningCount: 0, explorationSlots: 0 }
    };
  }
  const {
    familyDiversity = true,
    includeReasoning = true,
    minFamilies = 3,
    reasoningMin = 1,
    reasoningMax = 2
  } = constraints;
  const actualCount = Math.min(count, availableModels.length);
  const explorationSlots = actualCount >= 2 ? Math.max(1, Math.floor(actualCount * explorationRate)) : 0;
  const _samplingSlots = actualCount - explorationSlots;
  const selected = [];
  const usedKeys = /* @__PURE__ */ new Set();
  if (explorationSlots > 0) {
    const sorted = [...availableModels].sort((a, b) => {
      const armA = banditState.get(armKey(a));
      const armB = banditState.get(armKey(b));
      return (armA?.reviewCount ?? 0) - (armB?.reviewCount ?? 0);
    });
    for (const model of sorted) {
      if (selected.length >= explorationSlots) break;
      const key = armKey(model);
      if (!usedKeys.has(key)) {
        selected.push({ model, reason: "exploration" });
        usedKeys.add(key);
      }
    }
  }
  const candidates = availableModels.filter((m) => !usedKeys.has(armKey(m))).map((model) => {
    const arm = banditState.get(armKey(model));
    const MAX_PRIOR = 20;
    const alpha = arm ? Math.min(arm.alpha + 1, MAX_PRIOR) : 3;
    const beta = arm ? Math.min(arm.beta + 1, MAX_PRIOR) : 2;
    const theta = sampleBeta(alpha, beta, rng);
    return { model, theta };
  }).sort((a, b) => b.theta - a.theta);
  for (const candidate of candidates) {
    if (selected.length >= actualCount) break;
    const key = armKey(candidate.model);
    if (!usedKeys.has(key)) {
      selected.push({ model: candidate.model, reason: "thompson-sampling" });
      usedKeys.add(key);
    }
  }
  if (familyDiversity && selected.length >= minFamilies) {
    applyDiversityConstraints(selected, availableModels, usedKeys, {
      minFamilies,
      reasoningMin: includeReasoning ? reasoningMin : 0,
      reasoningMax: includeReasoning ? reasoningMax : 0
    });
  }
  const selections = selected.map((s) => ({
    modelId: s.model.modelId,
    provider: s.model.source,
    family: s.model.family,
    isReasoning: s.model.isReasoning,
    selectionReason: s.reason
  }));
  const families = new Set(selections.map((s) => s.family));
  const reasoningCount = selections.filter((s) => s.isReasoning).length;
  return {
    selections,
    metadata: {
      familyCount: families.size,
      reasoningCount,
      explorationSlots
    }
  };
}
function applyDiversityConstraints(selected, pool, usedKeys, constraints) {
  const { minFamilies, reasoningMin, reasoningMax } = constraints;
  let families = new Set(selected.map((s) => s.model.family));
  if (families.size < minFamilies) {
    const missingFamilies = /* @__PURE__ */ new Set();
    for (const model of pool) {
      if (!families.has(model.family) && !usedKeys.has(armKey(model))) {
        missingFamilies.add(model.family);
      }
    }
    const familyCounts = /* @__PURE__ */ new Map();
    for (const s of selected) {
      familyCounts.set(s.model.family, (familyCounts.get(s.model.family) ?? 0) + 1);
    }
    for (const targetFamily of missingFamilies) {
      if (families.size >= minFamilies) break;
      const replacement = pool.find(
        (m) => m.family === targetFamily && !usedKeys.has(armKey(m))
      );
      if (!replacement) continue;
      let maxFamily = "";
      let maxCount = 0;
      for (const [fam, cnt] of familyCounts) {
        if (cnt > maxCount) {
          maxFamily = fam;
          maxCount = cnt;
        }
      }
      if (maxCount <= 1) break;
      const removeIdx = selected.findLastIndex((s) => s.model.family === maxFamily);
      if (removeIdx >= 0) {
        usedKeys.delete(armKey(selected[removeIdx].model));
        selected[removeIdx] = { model: replacement, reason: "diversity-fill" };
        usedKeys.add(armKey(replacement));
        familyCounts.set(maxFamily, maxCount - 1);
        familyCounts.set(targetFamily, 1);
        families = new Set(selected.map((s) => s.model.family));
      }
    }
  }
  let reasoningCount = selected.filter((s) => s.model.isReasoning).length;
  while (reasoningCount < reasoningMin) {
    const replacement = pool.find(
      (m) => m.isReasoning && !usedKeys.has(armKey(m))
    );
    if (!replacement) break;
    const removeIdx = selected.findIndex(
      (s) => !s.model.isReasoning && countFamily(selected, s.model.family) > 1
    );
    const fallbackIdx = selected.findIndex((s) => !s.model.isReasoning);
    const idx = removeIdx >= 0 ? removeIdx : fallbackIdx;
    if (idx < 0) break;
    usedKeys.delete(armKey(selected[idx].model));
    selected[idx] = { model: replacement, reason: "diversity-fill" };
    usedKeys.add(armKey(replacement));
    reasoningCount++;
  }
  while (reasoningCount > reasoningMax) {
    const replacement = pool.find(
      (m) => !m.isReasoning && !usedKeys.has(armKey(m))
    );
    if (!replacement) break;
    const removeIdx = selected.findIndex(
      (s) => s.model.isReasoning && countFamily(selected, s.model.family) > 1
    );
    const fallbackIdx = selected.findLastIndex((s) => s.model.isReasoning);
    const idx = removeIdx >= 0 ? removeIdx : fallbackIdx;
    if (idx < 0) break;
    usedKeys.delete(armKey(selected[idx].model));
    selected[idx] = { model: replacement, reason: "diversity-fill" };
    usedKeys.add(armKey(replacement));
    reasoningCount--;
  }
}
function countFamily(selected, family) {
  return selected.filter((s) => s.model.family === family).length;
}
function createBanditState() {
  return /* @__PURE__ */ new Map();
}
function updateBandit(state, key, reward) {
  const arm = state.get(key) ?? { alpha: 1, beta: 1, reviewCount: 0, lastUsed: 0 };
  if (reward === 1) {
    arm.alpha += 1;
  } else {
    arm.beta += 1;
  }
  arm.reviewCount += 1;
  arm.lastUsed = Date.now();
  state.set(key, arm);
}
export {
  createBanditState,
  sampleBeta,
  selectModels,
  updateBandit
};

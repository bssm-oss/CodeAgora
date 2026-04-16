const FAMILY_PATTERNS = [
  [/deepseek/i, "deepseek"],
  [/qwen|qwq/i, "qwen"],
  [/llama/i, "llama"],
  [/mistral|mixtral|codestral/i, "mistral"],
  [/gemma/i, "gemma"],
  [/phi/i, "phi"],
  [/glm/i, "glm"],
  [/gpt/i, "openai"],
  [/kimi/i, "moonshot"]
];
const DISTILL_PATTERN = /distill[_-](\w+)/i;
const REASONING_PATTERN = /r1|reasoning|think|qwq/i;
function extractFamily(modelId) {
  const distilledBase = getDistilledBaseFamily(modelId);
  if (distilledBase) return distilledBase;
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(modelId)) return family;
  }
  return "unknown";
}
function isReasoningModel(modelId) {
  return REASONING_PATTERN.test(modelId);
}
function getDistilledBaseFamily(modelId) {
  const match = modelId.match(DISTILL_PATTERN);
  if (!match) return null;
  const baseName = match[1].toLowerCase();
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(baseName)) return family;
  }
  return null;
}
export {
  extractFamily,
  getDistilledBaseFamily,
  isReasoningModel
};

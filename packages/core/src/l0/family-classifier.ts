/**
 * Family Classifier
 * Extracts model family and reasoning status from model IDs.
 */

// ============================================================================
// Family Patterns
// ============================================================================

const FAMILY_PATTERNS: Array<[RegExp, string]> = [
  [/deepseek/i, 'deepseek'],
  [/qwen|qwq/i, 'qwen'],
  [/llama/i, 'llama'],
  [/mistral|mixtral|codestral/i, 'mistral'],
  [/gemma/i, 'gemma'],
  [/phi/i, 'phi'],
  [/glm/i, 'glm'],
  [/gpt/i, 'openai'],
  [/kimi/i, 'moonshot'],
];

const DISTILL_PATTERN = /distill[_-](\w+)/i;

const REASONING_PATTERN = /r1|reasoning|think|qwq/i;

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract the model family from a model ID.
 * Distilled models return their base family (e.g., distill-llama → "llama").
 */
export function extractFamily(modelId: string): string {
  // Check for distilled model first — use base family
  const distilledBase = getDistilledBaseFamily(modelId);
  if (distilledBase) return distilledBase;

  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(modelId)) return family;
  }

  return 'unknown';
}

/**
 * Determine if a model is a reasoning model.
 */
export function isReasoningModel(modelId: string): boolean {
  return REASONING_PATTERN.test(modelId);
}

/**
 * Detect distilled model and return the base family.
 * e.g., "deepseek-r1-distill-llama-70b" → "llama"
 */
export function getDistilledBaseFamily(modelId: string): string | null {
  const match = modelId.match(DISTILL_PATTERN);
  if (!match) return null;

  const baseName = match[1].toLowerCase();

  // Match the extracted base name against known families
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(baseName)) return family;
  }

  return null;
}

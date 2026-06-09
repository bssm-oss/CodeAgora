/**
 * Config Template Generator
 * Produces ready-to-use config templates in JSON or YAML format.
 */

import { stringify as yamlStringify } from 'yaml';

// ============================================================================
// Internal template data
// ============================================================================

/** Full config object covering every supported option. */
const FULL_TEMPLATE_DATA = {
  mode: 'pragmatic',
  language: 'en',
  reviewers: [
    {
      id: 'r-mimo',
      label: 'Mimo Reviewer',
      model: 'xiaomi/mimo-v2.5',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-gemini-flash-lite',
      label: 'Gemini Flash Lite Reviewer',
      model: 'google/gemini-3.1-flash-lite',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-hy3',
      label: 'HY3 Reviewer',
      model: 'tencent/hy3-preview',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-deepseek-flash',
      label: 'DeepSeek Flash Reviewer',
      model: 'deepseek/deepseek-v4-flash',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-llama-scout',
      label: 'Llama Scout Reviewer',
      model: 'meta-llama/llama-4-scout',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's-glm',
        model: 'z-ai/glm-5.1',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
      {
        id: 's-minimax',
        model: 'minimax/minimax-m3',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da-grok',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md', '.ca/personas/pragmatic.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
  },
  discussion: {
    maxRounds: 2,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
  autoApprove: {
    enabled: false,
    maxLines: 5,
    allowedFilePatterns: ['*.md', '*.txt', 'docs/**'],
  },
};

/** Minimal config — one reviewer, one supporter, sensible defaults. */
const MINIMAL_TEMPLATE_DATA = {
  mode: 'pragmatic',
  language: 'en',
  reviewers: [
    {
      id: 'r-mimo',
      model: 'xiaomi/mimo-v2.5',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's-glm',
        model: 'z-ai/glm-5.1',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da-grok',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

/** Declarative reviewers config — L0 picks models automatically. */
const DECLARATIVE_TEMPLATE_DATA = {
  mode: 'pragmatic',
  language: 'en',
  reviewers: {
    count: 5,
    constraints: {
      minFamilies: 3,
      reasoning: { min: 1, max: 2 },
      contextMin: '32k',
    },
  },
  modelRouter: {
    enabled: true,
    providers: { openrouter: { enabled: true } },
    constraints: {
      familyDiversity: true,
      includeReasoning: true,
      minFamilies: 3,
      reasoningMin: 1,
      reasoningMax: 2,
      contextMin: '32k',
    },
    explorationRate: 0,
  },
  supporters: {
    pool: [
      {
        id: 's-glm',
        model: 'z-ai/glm-5.1',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da-grok',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

/**
 * Multi-model OpenRouter config — diverse models across L1/L2/L3 layers.
 * L1 (Reviewers): independent OpenRouter reviewers for diverse parallel reviews.
 * L2 (Supporters): reasoning-capable OpenRouter models for quality debate.
 * L3 (Head): strongest configured OpenRouter head model.
 */
const MULTI_PROVIDER_TEMPLATE_DATA = {
  mode: 'pragmatic',
  language: 'en',
  // L1: diverse reviewers across the OpenRouter lineup
  reviewers: [
    {
      id: 'r-mimo',
      label: 'Mimo Reviewer',
      model: 'xiaomi/mimo-v2.5',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-gemini-flash-lite',
      label: 'Gemini Flash Lite Reviewer',
      model: 'google/gemini-3.1-flash-lite',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-hy3',
      label: 'HY3 Reviewer',
      model: 'tencent/hy3-preview',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-deepseek-flash',
      label: 'DeepSeek Flash Reviewer',
      model: 'deepseek/deepseek-v4-flash',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    {
      id: 'r-llama-scout',
      label: 'Llama Scout Reviewer',
      model: 'meta-llama/llama-4-scout',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
  ],
  // L2: reasoning models for debate
  supporters: {
    pool: [
      {
        id: 's-glm',
        label: 'GLM Supporter',
        model: 'z-ai/glm-5.1',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
      {
        id: 's-minimax',
        label: 'MiniMax Supporter',
        model: 'minimax/minimax-m3',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da-grok',
      label: 'Grok Devils Advocate',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md', '.ca/personas/pragmatic.md'],
    personaAssignment: 'random',
  },
  // L2 moderator: code-focused orchestration model
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
  },
  discussion: {
    maxRounds: 2,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  // L3: final verdict model
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

// ============================================================================
// Helpers
// ============================================================================

function toJson(data: object): string {
  return JSON.stringify(data, null, 2);
}

function toYaml(header: string, data: object): string {
  return `${header}\n\n${yamlStringify(data, { lineWidth: 120 })}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a full config template (all options, multiple reviewers/supporters).
 */
export function generateFullTemplate(format: 'json' | 'yaml'): string {
  if (format === 'json') {
    return toJson(FULL_TEMPLATE_DATA);
  }
  return toYaml(
    '# CodeAgora Configuration (full)\n# All available options are shown below.',
    FULL_TEMPLATE_DATA
  );
}

/**
 * Generate a minimal config template (smallest valid config).
 */
export function generateMinimalTemplate(format: 'json' | 'yaml'): string {
  if (format === 'json') {
    return toJson(MINIMAL_TEMPLATE_DATA);
  }
  return toYaml(
    '# CodeAgora Configuration (minimal)\n# Smallest valid configuration to get started.',
    MINIMAL_TEMPLATE_DATA
  );
}

/**
 * Generate a declarative reviewers config template (L0 auto-selects models).
 */
export function generateDeclarativeTemplate(format: 'json' | 'yaml'): string {
  if (format === 'json') {
    return toJson(DECLARATIVE_TEMPLATE_DATA);
  }
  return toYaml(
    '# CodeAgora Configuration (declarative)\n# L0 model intelligence layer selects reviewers automatically.',
    DECLARATIVE_TEMPLATE_DATA
  );
}

/**
 * Generate a multi-provider config template.
 * L1/L2/L3 use only retained API providers: Anthropic, OpenAI, OpenRouter,
 * OpenCode Go, OpenCode Zen, and Groq.
 */
export function generateMultiProviderTemplate(format: 'json' | 'yaml'): string {
  if (format === 'json') {
    return toJson(MULTI_PROVIDER_TEMPLATE_DATA);
  }
  return toYaml(
    '# CodeAgora Configuration (multi-provider)\n# Diverse retained providers across layers: fast L1 reviewers, reasoning L2 supporters, flagship L3 head.',
    MULTI_PROVIDER_TEMPLATE_DATA
  );
}

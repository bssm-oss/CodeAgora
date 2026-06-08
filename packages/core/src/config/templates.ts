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
      id: 'r1',
      label: 'Groq Llama Reviewer 1',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r2',
      label: 'Groq Llama Reviewer 2',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r3',
      label: 'Groq Llama Reviewer 3',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's1',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
      {
        id: 's2',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md', '.ca/personas/pragmatic.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'llama-3.3-70b-versatile',
    backend: 'api',
    provider: 'groq',
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
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
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
      id: 'r1',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's1',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'llama-3.3-70b-versatile',
    backend: 'api',
    provider: 'groq',
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
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
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
  supporters: {
    pool: [
      {
        id: 's1',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'llama-3.3-70b-versatile',
    backend: 'api',
    provider: 'groq',
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
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

/**
 * Multi-provider config — diverse providers across L1/L2/L3 layers.
 * L1 (Reviewers): retained API providers for diverse parallel reviews.
 * L2 (Supporters): reasoning-capable retained providers for quality debate.
 * L3 (Head): flagship retained provider.
 */
const MULTI_PROVIDER_TEMPLATE_DATA = {
  mode: 'pragmatic',
  language: 'en',
  // L1: diverse reviewers across the retained API provider set
  reviewers: [
    {
      id: 'r1',
      label: 'Groq Llama 3.3 70B Reviewer',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r2',
      label: 'OpenRouter Claude Reviewer',
      model: 'anthropic/claude-sonnet-4.6',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r3',
      label: 'OpenAI GPT-4o Mini Reviewer',
      model: 'gpt-4o-mini',
      backend: 'api',
      provider: 'openai',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r4',
      label: 'OpenCode Go Reviewer',
      model: 'deepseek-v4-flash',
      backend: 'api',
      provider: 'opencode-go',
      enabled: true,
      timeout: 120,
    },
    {
      id: 'r5',
      label: 'Anthropic Claude Reviewer',
      model: 'claude-sonnet-4-6',
      backend: 'api',
      provider: 'anthropic',
      enabled: true,
      timeout: 120,
    },
  ],
  // L2: reasoning models for debate
  supporters: {
    pool: [
      {
        id: 's1',
        label: 'OpenAI Reasoning Supporter',
        model: 'o4-mini',
        backend: 'api',
        provider: 'openai',
        enabled: true,
        timeout: 180,
      },
      {
        id: 's2',
        label: 'Anthropic Reasoning Supporter',
        model: 'claude-sonnet-4-5',
        backend: 'api',
        provider: 'anthropic',
        enabled: true,
        timeout: 180,
      },
      {
        id: 's3',
        label: 'OpenCode Zen Supporter',
        model: 'gpt-5.4-mini',
        backend: 'api',
        provider: 'opencode-zen',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      label: 'OpenRouter Devils Advocate',
      model: 'anthropic/claude-sonnet-4.6',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md', '.ca/personas/pragmatic.md'],
    personaAssignment: 'random',
  },
  // L2 moderator: solid reasoning for discussion orchestration
  moderator: {
    model: 'anthropic/claude-sonnet-4.6',
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
  // L3: flagship only — final verdict requires top-tier quality
  head: {
    backend: 'api',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
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

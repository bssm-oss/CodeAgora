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
      tierMin: 'B',
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

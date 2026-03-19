/**
 * Config Migration Tests
 */

import { describe, it, expect } from 'vitest';
import { migrateConfig, applyMigration, needsMigration } from '@codeagora/core/config/migrator.js';
import type { Config } from '@codeagora/core/types/config.js';

// ============================================================================
// Shared fixtures
// ============================================================================

const baseConfig: Config = {
  reviewers: [
    { id: 'r1', backend: 'codex', model: 'o4-mini', enabled: true, timeout: 120 },
    { id: 'r2', backend: 'gemini', model: 'gemini-flash', enabled: true, timeout: 120 },
    { id: 'r3', backend: 'opencode', provider: 'kimi', model: 'kimi-k2.5', enabled: true, timeout: 120 },
    { id: 'r4', backend: 'claude', model: 'claude-opus-4', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [
      { id: 'sp1', backend: 'codex', model: 'o4-mini', enabled: true, timeout: 120 },
      { id: 'sp2', backend: 'gemini', model: 'gemini-flash', enabled: true, timeout: 120 },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'devil',
      backend: 'opencode',
      provider: 'openrouter',
      model: 'grok-fast',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md', '.ca/personas/pragmatic.md'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'codex', model: 'claude-sonnet' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

const apiOnlyConfig: Config = {
  reviewers: [
    { id: 'r1', backend: 'api', provider: 'groq', model: 'llama-3.3-70b-versatile', enabled: true, timeout: 120 },
    { id: 'r2', backend: 'api', provider: 'google', model: 'gemini-2.5-flash', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [
      { id: 'sp1', backend: 'api', provider: 'openrouter', model: 'gpt-4o', enabled: true, timeout: 120 },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'devil',
      backend: 'api',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'api', provider: 'openrouter', model: 'claude-sonnet' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

// ============================================================================
// needsMigration()
// ============================================================================

describe('needsMigration()', () => {
  it('returns true when reviewers have CLI backends', () => {
    expect(needsMigration(baseConfig)).toBe(true);
  });

  it('returns false when all backends are api', () => {
    expect(needsMigration(apiOnlyConfig)).toBe(false);
  });

  it('returns true when only supporters have CLI backends', () => {
    const config: Config = {
      ...apiOnlyConfig,
      supporters: {
        ...apiOnlyConfig.supporters,
        pool: [
          { id: 'sp1', backend: 'codex', model: 'o4-mini', enabled: true, timeout: 120 },
        ],
      },
    };
    expect(needsMigration(config)).toBe(true);
  });

  it('returns true when only devilsAdvocate has CLI backend', () => {
    const config: Config = {
      ...apiOnlyConfig,
      supporters: {
        ...apiOnlyConfig.supporters,
        devilsAdvocate: {
          id: 'devil',
          backend: 'gemini',
          model: 'gemini-flash',
          enabled: true,
          timeout: 120,
        },
      },
    };
    expect(needsMigration(config)).toBe(true);
  });

  it('returns true when only moderator has CLI backend', () => {
    const config: Config = {
      ...apiOnlyConfig,
      moderator: { backend: 'claude', model: 'claude-opus-4' },
    };
    expect(needsMigration(config)).toBe(true);
  });
});

// ============================================================================
// migrateConfig() — analysis only, no mutation
// ============================================================================

describe('migrateConfig()', () => {
  it('detects all CLI backends and produces changes', () => {
    const result = migrateConfig(baseConfig);

    expect(result.migrated).toBe(true);
    expect(result.warnings).toHaveLength(0);

    // r1 codex → openrouter, r2 gemini → google, r3 opencode → openrouter (provider kept),
    // r4 claude → openrouter, sp1, sp2, devil, moderator
    const ids = result.changes.map((c) => c.reviewerId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
    expect(ids).toContain('r3');
    expect(ids).toContain('r4');
    expect(ids).toContain('sp1');
    expect(ids).toContain('sp2');
    expect(ids).toContain('devil');
    expect(ids).toContain('moderator');
  });

  it('maps codex → openrouter', () => {
    const result = migrateConfig(baseConfig);
    const change = result.changes.find((c) => c.reviewerId === 'r1')!;
    expect(change.from.backend).toBe('codex');
    expect(change.to.backend).toBe('api');
    expect(change.to.provider).toBe('openrouter');
  });

  it('maps gemini → google', () => {
    const result = migrateConfig(baseConfig);
    const change = result.changes.find((c) => c.reviewerId === 'r2')!;
    expect(change.from.backend).toBe('gemini');
    expect(change.to.provider).toBe('google');
  });

  it('maps claude → openrouter', () => {
    const result = migrateConfig(baseConfig);
    const change = result.changes.find((c) => c.reviewerId === 'r4')!;
    expect(change.from.backend).toBe('claude');
    expect(change.to.provider).toBe('openrouter');
  });

  it('preserves explicitly set provider on opencode reviewer', () => {
    // r3 has provider: 'kimi' — should keep 'kimi', not override with 'openrouter'
    const result = migrateConfig(baseConfig);
    const change = result.changes.find((c) => c.reviewerId === 'r3')!;
    expect(change.from.backend).toBe('opencode');
    expect(change.from.provider).toBe('kimi');
    expect(change.to.provider).toBe('kimi');
  });

  it('returns migrated: false and no changes for api-only config', () => {
    const result = migrateConfig(apiOnlyConfig);
    expect(result.migrated).toBe(false);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not mutate the original config', () => {
    const original = JSON.stringify(baseConfig);
    migrateConfig(baseConfig);
    expect(JSON.stringify(baseConfig)).toBe(original);
  });
});

// ============================================================================
// applyMigration()
// ============================================================================

describe('applyMigration()', () => {
  it('applies all changes to produce a fully API-backed config', () => {
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    // All reviewer backends should be 'api'
    const reviewers = migrated.reviewers as Array<{ backend: string; provider?: string }>;
    for (const r of reviewers) {
      expect(r.backend).toBe('api');
      expect(r.provider).toBeDefined();
    }

    // Supporters
    for (const s of migrated.supporters.pool) {
      expect(s.backend).toBe('api');
      expect(s.provider).toBeDefined();
    }
    expect(migrated.supporters.devilsAdvocate.backend).toBe('api');
    expect(migrated.supporters.devilsAdvocate.provider).toBeDefined();

    // Moderator
    expect(migrated.moderator.backend).toBe('api');
    expect(migrated.moderator.provider).toBeDefined();
  });

  it('returns the same config object when migrated is false', () => {
    const result = migrateConfig(apiOnlyConfig);
    const output = applyMigration(apiOnlyConfig, result);
    expect(output).toBe(apiOnlyConfig);
  });

  it('does not mutate the original config', () => {
    const result = migrateConfig(baseConfig);
    const original = JSON.stringify(baseConfig);
    applyMigration(baseConfig, result);
    expect(JSON.stringify(baseConfig)).toBe(original);
  });

  it('preserves provider when explicitly set on opencode reviewer', () => {
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    const reviewers = migrated.reviewers as Array<{ id: string; provider?: string }>;
    const r3 = reviewers.find((r) => r.id === 'r3')!;
    expect(r3.provider).toBe('kimi');
  });

  it('sets correct provider mapping for gemini reviewer', () => {
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    const reviewers = migrated.reviewers as Array<{ id: string; backend: string; provider?: string }>;
    const r2 = reviewers.find((r) => r.id === 'r2')!;
    expect(r2.backend).toBe('api');
    expect(r2.provider).toBe('google');
  });
});

// ============================================================================
// Mixed config (some CLI, some API)
// ============================================================================

describe('mixed config (partial CLI backends)', () => {
  const mixedConfig: Config = {
    ...apiOnlyConfig,
    reviewers: [
      { id: 'r1', backend: 'api', provider: 'groq', model: 'llama-3.3-70b-versatile', enabled: true, timeout: 120 },
      { id: 'r2', backend: 'gemini', model: 'gemini-flash', enabled: true, timeout: 120 },
      { id: 'r3', backend: 'api', provider: 'google', model: 'gemini-2.5-pro', enabled: true, timeout: 120 },
    ],
  };

  it('only migrates CLI-backed reviewers', () => {
    const result = migrateConfig(mixedConfig);
    expect(result.migrated).toBe(true);

    const reviewerIds = result.changes.map((c) => c.reviewerId);
    expect(reviewerIds).not.toContain('r1');
    expect(reviewerIds).toContain('r2');
    expect(reviewerIds).not.toContain('r3');
  });

  it('leaves API-backed reviewers untouched after apply', () => {
    const result = migrateConfig(mixedConfig);
    const migrated = applyMigration(mixedConfig, result);

    const reviewers = migrated.reviewers as Array<{ id: string; backend: string; provider?: string }>;
    const r1 = reviewers.find((r) => r.id === 'r1')!;
    expect(r1.backend).toBe('api');
    expect(r1.provider).toBe('groq');

    const r3 = reviewers.find((r) => r.id === 'r3')!;
    expect(r3.backend).toBe('api');
    expect(r3.provider).toBe('google');
  });

  it('migrates the CLI-backed reviewer to api', () => {
    const result = migrateConfig(mixedConfig);
    const migrated = applyMigration(mixedConfig, result);

    const reviewers = migrated.reviewers as Array<{ id: string; backend: string; provider?: string }>;
    const r2 = reviewers.find((r) => r.id === 'r2')!;
    expect(r2.backend).toBe('api');
    expect(r2.provider).toBe('google');
  });
});

// ============================================================================
// Supporters and devilsAdvocate migration
// ============================================================================

describe('supporters and devilsAdvocate migration', () => {
  it('migrates supporters pool from CLI to API', () => {
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    for (const s of migrated.supporters.pool) {
      expect(s.backend).toBe('api');
      expect(s.provider).toBeDefined();
    }
  });

  it('migrates devilsAdvocate from CLI to API', () => {
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    expect(migrated.supporters.devilsAdvocate.backend).toBe('api');
    expect(migrated.supporters.devilsAdvocate.provider).toBeDefined();
  });

  it('preserves devilsAdvocate provider when explicitly set', () => {
    // baseConfig devil has provider: 'openrouter' set explicitly
    const result = migrateConfig(baseConfig);
    const migrated = applyMigration(baseConfig, result);

    expect(migrated.supporters.devilsAdvocate.provider).toBe('openrouter');
  });
});

// ============================================================================
// Declarative reviewers format
// ============================================================================

describe('declarative reviewers format', () => {
  const declarativeConfig: Config = {
    ...baseConfig,
    reviewers: {
      count: 3,
      static: [
        { id: 'sr1', backend: 'codex', model: 'o4-mini', enabled: true, timeout: 120 },
        { id: 'sr2', backend: 'api', provider: 'groq', model: 'llama-3.3-70b', enabled: true, timeout: 120 },
      ],
    },
  };

  it('detects CLI backends in declarative static reviewers', () => {
    expect(needsMigration(declarativeConfig)).toBe(true);
  });

  it('migrates only CLI-backed static reviewers', () => {
    const result = migrateConfig(declarativeConfig);
    const reviewerIds = result.changes.map((c) => c.reviewerId);
    expect(reviewerIds).toContain('sr1');
    expect(reviewerIds).not.toContain('sr2');
  });

  it('applies migration to declarative static reviewers', () => {
    const result = migrateConfig(declarativeConfig);
    const migrated = applyMigration(declarativeConfig, result);

    const decl = migrated.reviewers as { count: number; static?: Array<{ id: string; backend: string; provider?: string }> };
    expect(decl.count).toBe(3);
    const sr1 = decl.static!.find((r) => r.id === 'sr1')!;
    expect(sr1.backend).toBe('api');
    expect(sr1.provider).toBe('openrouter');

    const sr2 = decl.static!.find((r) => r.id === 'sr2')!;
    expect(sr2.backend).toBe('api');
    expect(sr2.provider).toBe('groq');
  });
});

// ============================================================================
// Fallback migration
// ============================================================================

describe('fallback migration', () => {
  it('migrates CLI fallback to API', () => {
    const configWithFallback: Config = {
      ...baseConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'codex',
          model: 'o4-mini',
          enabled: true,
          timeout: 120,
          fallback: { backend: 'gemini', model: 'gemini-flash' },
        },
      ],
    };

    const result = migrateConfig(configWithFallback);
    const migrated = applyMigration(configWithFallback, result);

    const reviewers = migrated.reviewers as Array<{
      id: string;
      backend: string;
      fallback?: { backend: string; provider?: string };
    }>;
    const r1 = reviewers.find((r) => r.id === 'r1')!;
    expect(r1.backend).toBe('api');
    expect(r1.fallback?.backend).toBe('api');
    expect(r1.fallback?.provider).toBe('google');
  });
});

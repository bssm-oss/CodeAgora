/**
 * Tests for pure functions exported from src/config/loader.ts
 */

import { describe, it, expect } from 'vitest';
import {
  getEnabledReviewers,
  getEnabledReviewerEntries,
  getEnabledSupporters,
  getDevilsAdvocate,
  checkMinReviewers,
  isDeclarativeReviewers,
  expandDeclarativeReviewers,
  normalizeConfig,
} from '@codeagora/core/config/loader.js';
import type { Config, DeclarativeReviewers } from '@codeagora/core/types/config.js';

// ============================================================================
// Shared fixtures
// ============================================================================

const baseSupport = {
  pool: [
    { id: 's1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: true },
    { id: 's2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: false },
  ],
  pickCount: 1,
  pickStrategy: 'random' as const,
  devilsAdvocate: { id: 'da', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: true },
  personaPool: ['.ca/personas/strict.md'],
  personaAssignment: 'random' as const,
};

const baseModerator = { backend: 'api' as const, model: 'llama', provider: 'groq' };

const baseDiscussion = {
  maxRounds: 3,
  registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
  codeSnippetRange: 10,
};

const baseErrorHandling = { maxRetries: 2, forfeitThreshold: 0.7 };

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    reviewers: [
      { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      { id: 'r2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      { id: 'r3', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: false },
    ],
    supporters: baseSupport,
    moderator: baseModerator,
    discussion: baseDiscussion,
    errorHandling: baseErrorHandling,
    ...overrides,
  };
}

// ============================================================================
// getEnabledReviewers
// ============================================================================

describe('getEnabledReviewers', () => {
  it('should return only enabled static reviewers', () => {
    const config = makeConfig();
    const result = getEnabledReviewers(config);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('should return empty array when all reviewers are disabled', () => {
    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: false },
      ],
    });
    const result = getEnabledReviewers(config);
    expect(result).toHaveLength(0);
  });

  it('should exclude auto reviewers from results', () => {
    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'auto-1', auto: true as const, enabled: true },
      ],
    });
    const result = getEnabledReviewers(config);
    // Only the static reviewer is returned
    expect(result.every((r) => !('auto' in r))).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('should return static reviewers from declarative format', () => {
    const config = makeConfig({
      reviewers: {
        count: 3,
        static: [
          { id: 'r-fixed', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        ],
      },
    });
    const result = getEnabledReviewers(config);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-fixed');
  });

  it('should return empty array for declarative format with no static reviewers', () => {
    const config = makeConfig({ reviewers: { count: 3 } });
    const result = getEnabledReviewers(config);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// getEnabledReviewerEntries
// ============================================================================

describe('getEnabledReviewerEntries', () => {
  it('should include enabled static and auto reviewers from array config', () => {
    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'auto-1', auto: true as const, enabled: true },
        { id: 'r3', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: false },
      ],
    });
    const result = getEnabledReviewerEntries(config);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['r1', 'auto-1']);
  });

  it('should expand declarative config into auto entries and filter enabled', () => {
    const config = makeConfig({ reviewers: { count: 3 } });
    const result = getEnabledReviewerEntries(config);
    // All 3 auto reviewers are enabled by default
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.enabled)).toBe(true);
  });

  it('should return only enabled entries from array config', () => {
    const config = makeConfig();
    const result = getEnabledReviewerEntries(config);
    // r1 and r2 enabled, r3 disabled
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// getEnabledSupporters
// ============================================================================

describe('getEnabledSupporters', () => {
  it('should return only enabled supporters from pool', () => {
    const config = makeConfig();
    const result = getEnabledSupporters(config);
    // s1 enabled, s2 disabled
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('should return all supporters when all are enabled', () => {
    const config = makeConfig({
      supporters: {
        ...baseSupport,
        pool: [
          { id: 's1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: true },
          { id: 's2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: true },
        ],
      },
    });
    const result = getEnabledSupporters(config);
    expect(result).toHaveLength(2);
  });

  it('should return empty array when all supporters are disabled', () => {
    const config = makeConfig({
      supporters: {
        ...baseSupport,
        pool: [
          { id: 's1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 60, enabled: false },
        ],
      },
    });
    const result = getEnabledSupporters(config);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// getDevilsAdvocate
// ============================================================================

describe('getDevilsAdvocate', () => {
  it('should return the devil\'s advocate agent when enabled', () => {
    const config = makeConfig();
    const result = getDevilsAdvocate(config);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('da');
  });

  it('should return null when devil\'s advocate is disabled', () => {
    const config = makeConfig({
      supporters: {
        ...baseSupport,
        devilsAdvocate: {
          id: 'da',
          model: 'llama',
          backend: 'api' as const,
          provider: 'groq',
          timeout: 60,
          enabled: false,
        },
      },
    });
    const result = getDevilsAdvocate(config);
    expect(result).toBeNull();
  });
});

// ============================================================================
// checkMinReviewers
// ============================================================================

describe('checkMinReviewers', () => {
  it('should return valid: true when enabled reviewers meet default minimum of 3', () => {
    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'r2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'r3', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      ],
    });
    const result = checkMinReviewers(config);
    expect(result.valid).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('should return valid: false when enabled reviewers are below default minimum', () => {
    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'r2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      ],
    });
    const result = checkMinReviewers(config);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Insufficient reviewers');
  });

  it('should respect a custom minRequired parameter', () => {
    const config = makeConfig();
    // 2 enabled reviewers, require 2 → valid
    const okResult = checkMinReviewers(config, 2);
    expect(okResult.valid).toBe(true);
  });

  it('should fail when custom minRequired exceeds enabled count', () => {
    const config = makeConfig();
    // 2 enabled reviewers, require 5 → invalid
    const failResult = checkMinReviewers(config, 5);
    expect(failResult.valid).toBe(false);
    expect(failResult.message).toContain('2 enabled');
    expect(failResult.message).toContain('5 required');
  });

  it('should return valid: true when enabled count exactly meets minRequired', () => {
    const config = makeConfig();
    // exactly 2 enabled reviewers
    const result = checkMinReviewers(config, 2);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// isDeclarativeReviewers
// ============================================================================

describe('isDeclarativeReviewers', () => {
  it('should return true for an object with count field', () => {
    expect(isDeclarativeReviewers({ count: 3 } as any)).toBe(true);
  });

  it('should return true for declarative config with constraints', () => {
    expect(
      isDeclarativeReviewers({ count: 5, constraints: { minFamilies: 3 } } as any)
    ).toBe(true);
  });

  it('should return false for an array', () => {
    expect(isDeclarativeReviewers([] as any)).toBe(false);
  });

  it('should return false for an array of reviewer entries', () => {
    const arr = [{ id: 'r1', model: 'llama', backend: 'api', provider: 'groq', enabled: true }];
    expect(isDeclarativeReviewers(arr as any)).toBe(false);
  });
});

// ============================================================================
// expandDeclarativeReviewers
// ============================================================================

describe('expandDeclarativeReviewers', () => {
  it('should produce count auto reviewers when no static provided', () => {
    const decl: DeclarativeReviewers = { count: 3 };
    const entries = expandDeclarativeReviewers(decl);
    expect(entries).toHaveLength(3);
    entries.forEach((e) => {
      expect(e).toHaveProperty('auto', true);
      expect(e.enabled).toBe(true);
    });
  });

  it('should assign sequential ids to auto reviewers', () => {
    const decl: DeclarativeReviewers = { count: 3 };
    const entries = expandDeclarativeReviewers(decl);
    expect(entries[0].id).toBe('auto-1');
    expect(entries[1].id).toBe('auto-2');
    expect(entries[2].id).toBe('auto-3');
  });

  it('should keep static reviewers and fill remainder with auto', () => {
    const decl: DeclarativeReviewers = {
      count: 4,
      static: [
        { id: 'r-fixed', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      ],
    };
    const entries = expandDeclarativeReviewers(decl);
    expect(entries).toHaveLength(4);
    expect(entries[0].id).toBe('r-fixed');
    expect('model' in entries[0]).toBe(true);
    expect(entries[1]).toEqual({ id: 'auto-1', auto: true, enabled: true });
    expect(entries[2]).toEqual({ id: 'auto-2', auto: true, enabled: true });
    expect(entries[3]).toEqual({ id: 'auto-3', auto: true, enabled: true });
  });

  it('should return only static reviewers when count equals static count', () => {
    const decl: DeclarativeReviewers = {
      count: 2,
      static: [
        { id: 'r1', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
        { id: 'r2', model: 'llama', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      ],
    };
    const entries = expandDeclarativeReviewers(decl);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => !('auto' in e))).toBe(true);
  });

  it('should return exactly count entries total', () => {
    const decl: DeclarativeReviewers = { count: 5 };
    const entries = expandDeclarativeReviewers(decl);
    expect(entries).toHaveLength(5);
  });
});

// ============================================================================
// normalizeConfig
// ============================================================================

describe('normalizeConfig', () => {
  it('should pass through array-based config unchanged', () => {
    const config = makeConfig();
    const normalized = normalizeConfig(config);
    expect(Array.isArray(normalized.reviewers)).toBe(true);
    expect(normalized.reviewers).toHaveLength(3);
  });

  it('should expand declarative config into ReviewerEntry array', () => {
    const config = makeConfig({ reviewers: { count: 4 } });
    const normalized = normalizeConfig(config);
    expect(Array.isArray(normalized.reviewers)).toBe(true);
    expect(normalized.reviewers).toHaveLength(4);
  });

  it('should preserve other config fields when normalizing declarative', () => {
    const config = makeConfig({ reviewers: { count: 2 } });
    const normalized = normalizeConfig(config);
    expect(normalized.moderator).toEqual(baseModerator);
    expect(normalized.errorHandling).toEqual(baseErrorHandling);
  });

  it('should not mutate the original config', () => {
    const config = makeConfig({ reviewers: { count: 3 } });
    const original = config.reviewers;
    normalizeConfig(config);
    expect(config.reviewers).toBe(original);
  });
});

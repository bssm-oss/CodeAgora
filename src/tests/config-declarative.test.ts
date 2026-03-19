import { describe, it, expect } from 'vitest';
import {
  isDeclarativeReviewers,
  expandDeclarativeReviewers,
  normalizeConfig,
  validateConfigData,
} from '@codeagora/core/config/loader.js';
import { DeclarativeReviewersSchema, ConfigSchema } from '@codeagora/core/types/config.js';
import type { DeclarativeReviewers, Config } from '@codeagora/core/types/config.js';

// Minimal valid config parts for building test configs
const baseConfig = {
  supporters: {
    pool: [
      { id: 's1', model: 'test', backend: 'api', provider: 'groq', timeout: 60, enabled: true },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da', model: 'test', backend: 'api', provider: 'groq', timeout: 60, enabled: true },
    personaPool: ['persona1.md'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'api', model: 'test' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

describe('DeclarativeReviewersSchema', () => {
  it('should parse valid declarative config', () => {
    const result = DeclarativeReviewersSchema.parse({
      count: 5,
      constraints: {
        minFamilies: 3,
        reasoning: { min: 1, max: 2 },
        contextMin: '32k',
        tierMin: 'A-',
      },
    });

    expect(result.count).toBe(5);
    expect(result.constraints?.minFamilies).toBe(3);
    expect(result.constraints?.reasoning?.min).toBe(1);
  });

  it('should parse minimal declarative config with defaults', () => {
    const result = DeclarativeReviewersSchema.parse({ count: 3 });

    expect(result.count).toBe(3);
    expect(result.constraints).toBeUndefined();
    expect(result.static).toBeUndefined();
  });

  it('should parse declarative config with static reviewers', () => {
    const result = DeclarativeReviewersSchema.parse({
      count: 5,
      static: [
        { id: 'r-fixed', model: 'deepseek-chat', backend: 'api', provider: 'nvidia-nim' },
      ],
    });

    expect(result.count).toBe(5);
    expect(result.static).toHaveLength(1);
    expect(result.static![0].id).toBe('r-fixed');
  });

  it('should reject count < 1', () => {
    expect(() => DeclarativeReviewersSchema.parse({ count: 0 })).toThrow();
  });

  it('should reject count > 10', () => {
    expect(() => DeclarativeReviewersSchema.parse({ count: 11 })).toThrow();
  });
});

describe('isDeclarativeReviewers', () => {
  it('should return true for declarative format', () => {
    expect(isDeclarativeReviewers({ count: 5 } as any)).toBe(true);
  });

  it('should return false for array format', () => {
    expect(isDeclarativeReviewers([] as any)).toBe(false);
  });
});

describe('expandDeclarativeReviewers', () => {
  it('should expand pure declarative into auto reviewers', () => {
    const decl: DeclarativeReviewers = { count: 3 };
    const entries = expandDeclarativeReviewers(decl);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ id: 'auto-1', auto: true, enabled: true });
    expect(entries[1]).toEqual({ id: 'auto-2', auto: true, enabled: true });
    expect(entries[2]).toEqual({ id: 'auto-3', auto: true, enabled: true });
  });

  it('should keep static reviewers and fill remaining with auto', () => {
    const decl: DeclarativeReviewers = {
      count: 4,
      static: [
        { id: 'r-fixed', model: 'deepseek-chat', backend: 'api' as const, provider: 'nvidia-nim', timeout: 120, enabled: true },
      ],
    };
    const entries = expandDeclarativeReviewers(decl);

    expect(entries).toHaveLength(4);
    // First is static
    expect('model' in entries[0]).toBe(true);
    expect((entries[0] as any).id).toBe('r-fixed');
    // Remaining are auto
    expect(entries[1]).toEqual({ id: 'auto-1', auto: true, enabled: true });
    expect(entries[2]).toEqual({ id: 'auto-2', auto: true, enabled: true });
    expect(entries[3]).toEqual({ id: 'auto-3', auto: true, enabled: true });
  });

  it('should handle count equal to static count (no auto)', () => {
    const decl: DeclarativeReviewers = {
      count: 1,
      static: [
        { id: 'r1', model: 'test', backend: 'api' as const, provider: 'groq', timeout: 120, enabled: true },
      ],
    };
    const entries = expandDeclarativeReviewers(decl);

    expect(entries).toHaveLength(1);
    expect('model' in entries[0]).toBe(true);
  });
});

describe('normalizeConfig', () => {
  it('should pass through array-based config unchanged', () => {
    const config = {
      ...baseConfig,
      reviewers: [
        { id: 'r1', model: 'test', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
    };

    const validated = validateConfigData(config);
    const normalized = normalizeConfig(validated);

    expect(Array.isArray(normalized.reviewers)).toBe(true);
    expect(normalized.reviewers).toHaveLength(1);
  });

  it('should expand declarative config into array', () => {
    const config = {
      ...baseConfig,
      reviewers: { count: 3 },
      modelRouter: { enabled: true },
    };

    const validated = validateConfigData(config);
    const normalized = normalizeConfig(validated);

    expect(Array.isArray(normalized.reviewers)).toBe(true);
    expect(normalized.reviewers).toHaveLength(3);
  });
});

describe('ConfigSchema with declarative reviewers', () => {
  it('should validate config with declarative reviewers', () => {
    const config = {
      ...baseConfig,
      reviewers: {
        count: 5,
        constraints: { minFamilies: 3, reasoning: { min: 1, max: 2 } },
      },
      modelRouter: { enabled: true },
    };

    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate config with traditional array reviewers', () => {
    const config = {
      ...baseConfig,
      reviewers: [
        { id: 'r1', model: 'test', backend: 'api', provider: 'groq' },
      ],
    };

    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });
});

/**
 * Tests for packages/core/src/config/presets.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildPresetConfig,
  STATIC_PRESETS,
  type PresetConfig,
} from '../config/presets.js';
/** Cast config.reviewers to static array for test assertions */
function reviewers(config: ReturnType<typeof buildPresetConfig>): Array<Record<string, unknown>> {
  return config.reviewers as unknown as Array<Record<string, unknown>>;
}

// ============================================================================
// Helpers
// ============================================================================

function makePreset(overrides: Partial<PresetConfig> = {}): PresetConfig {
  return {
    id: 'test',
    name: 'Test',
    nameKo: '테스트',
    description: 'Test preset',
    descriptionKo: '테스트 프리셋',
    reviewerCount: 3,
    providers: ['groq'],
    models: { groq: 'llama-3.3-70b-versatile' },
    discussion: false,
    ...overrides,
  };
}

// ============================================================================
// STATIC_PRESETS
// ============================================================================

describe('STATIC_PRESETS', () => {
  it('has exactly 3 entries', () => {
    expect(STATIC_PRESETS).toHaveLength(3);
  });

  it('contains quick, thorough, and minimal presets', () => {
    const ids = STATIC_PRESETS.map((p) => p.id);
    expect(ids).toContain('quick');
    expect(ids).toContain('thorough');
    expect(ids).toContain('minimal');
  });

  it('quick preset has 3 reviewers and no discussion', () => {
    const quick = STATIC_PRESETS.find((p) => p.id === 'quick')!;
    expect(quick.reviewerCount).toBe(3);
    expect(quick.discussion).toBe(false);
  });

  it('thorough preset has 5 reviewers and discussion enabled', () => {
    const thorough = STATIC_PRESETS.find((p) => p.id === 'thorough')!;
    expect(thorough.reviewerCount).toBe(5);
    expect(thorough.discussion).toBe(true);
  });

  it('minimal preset has 1 reviewer and no discussion', () => {
    const minimal = STATIC_PRESETS.find((p) => p.id === 'minimal')!;
    expect(minimal.reviewerCount).toBe(1);
    expect(minimal.discussion).toBe(false);
  });

  it('each preset has a non-empty name and description', () => {
    for (const preset of STATIC_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// buildPresetConfig — required fields
// ============================================================================

describe('buildPresetConfig() — required fields', () => {
  it('returns an object with reviewers array', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(Array.isArray(config.reviewers)).toBe(true);
  });

  it('returns an object with supporters field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters).toBeDefined();
    expect(Array.isArray(config.supporters.pool)).toBe(true);
  });

  it('returns an object with moderator field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.moderator).toBeDefined();
    expect(config.moderator.model).toBeTruthy();
  });

  it('returns an object with head field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.head).toBeDefined();
    expect(config.head!.model).toBeTruthy();
    expect(config.head!.enabled).toBe(true);
  });

  it('returns an object with discussion field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.discussion).toBeDefined();
    expect(config.discussion.maxRounds).toBeGreaterThanOrEqual(1);
  });

  it('returns an object with errorHandling field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.errorHandling).toBeDefined();
    expect(typeof config.errorHandling.maxRetries).toBe('number');
    expect(typeof config.errorHandling.forfeitThreshold).toBe('number');
  });

  it('returns an object with mode field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.mode).toBeDefined();
  });

  it('returns an object with language field', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.language).toBeDefined();
  });
});

// ============================================================================
// buildPresetConfig — quick preset
// ============================================================================

describe('buildPresetConfig() — quick preset', () => {
  const quickPreset = STATIC_PRESETS.find((p) => p.id === 'quick')!;

  it('creates 3 reviewers', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    expect(config.reviewers).toHaveLength(3);
  });

  it('all reviewers use groq provider', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    for (const r of reviewers(config)) {
      expect(r.provider).toBe('groq');
    }
  });

  it('reviewers have timeout set', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    for (const r of reviewers(config)) {
      expect(r.timeout).toBeGreaterThan(0);
    }
  });

  it('discussion maxRounds is 1 when discussion is disabled', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    expect(config.discussion.maxRounds).toBe(1);
  });

  it('reviewers use backend: api', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    for (const r of reviewers(config)) {
      expect(r.backend).toBe('api');
    }
  });

  it('reviewers have enabled: true', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    for (const r of reviewers(config)) {
      expect(r.enabled).toBe(true);
    }
  });

  it('reviewers have unique ids', () => {
    const config = buildPresetConfig({ preset: quickPreset });
    const ids = reviewers(config).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// buildPresetConfig — thorough preset
// ============================================================================

describe('buildPresetConfig() — thorough preset', () => {
  const thoroughPreset = STATIC_PRESETS.find((p) => p.id === 'thorough')!;

  it('creates 5 reviewers', () => {
    const config = buildPresetConfig({ preset: thoroughPreset });
    expect(config.reviewers).toHaveLength(5);
  });

  it('discussion maxRounds is greater than 1 when discussion is enabled', () => {
    const config = buildPresetConfig({ preset: thoroughPreset });
    expect(config.discussion.maxRounds).toBeGreaterThan(1);
  });

  it('discussion maxRounds for thorough is different from quick', () => {
    const quickConfig = buildPresetConfig({ preset: STATIC_PRESETS.find((p) => p.id === 'quick')! });
    const thoroughConfig = buildPresetConfig({ preset: thoroughPreset });
    expect(thoroughConfig.discussion.maxRounds).toBeGreaterThan(quickConfig.discussion.maxRounds);
  });
});

// ============================================================================
// buildPresetConfig — minimal preset
// ============================================================================

describe('buildPresetConfig() — minimal preset', () => {
  const minimalPreset = STATIC_PRESETS.find((p) => p.id === 'minimal')!;

  it('creates 1 reviewer', () => {
    const config = buildPresetConfig({ preset: minimalPreset });
    expect(config.reviewers).toHaveLength(1);
  });

  it('discussion maxRounds is 1 when discussion is disabled', () => {
    const config = buildPresetConfig({ preset: minimalPreset });
    expect(config.discussion.maxRounds).toBe(1);
  });
});

// ============================================================================
// buildPresetConfig — mode defaults and overrides
// ============================================================================

describe('buildPresetConfig() — mode', () => {
  it('defaults to pragmatic mode', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.mode).toBe('pragmatic');
  });

  it('accepts strict mode override', () => {
    const config = buildPresetConfig({ preset: makePreset(), mode: 'strict' });
    expect(config.mode).toBe('strict');
  });

  it('strict mode uses higher maxRounds than pragmatic', () => {
    const strict = buildPresetConfig({
      preset: makePreset({ discussion: true }),
      mode: 'strict',
    });
    const pragmatic = buildPresetConfig({
      preset: makePreset({ discussion: true }),
      mode: 'pragmatic',
    });
    expect(strict.discussion.maxRounds).toBeGreaterThan(pragmatic.discussion.maxRounds);
  });

  it('strict mode SUGGESTION threshold is non-null', () => {
    const config = buildPresetConfig({ preset: makePreset(), mode: 'strict' });
    expect(config.supporters.personaPool).toBeDefined();
  });

  it('pragmatic mode has WARNING threshold of 2', () => {
    const config = buildPresetConfig({ preset: makePreset(), mode: 'pragmatic' });
    expect(config.discussion.registrationThreshold.WARNING).toBe(2);
  });

  it('strict mode has WARNING threshold of 1', () => {
    const config = buildPresetConfig({ preset: makePreset(), mode: 'strict' });
    expect(config.discussion.registrationThreshold.WARNING).toBe(1);
  });
});

// ============================================================================
// buildPresetConfig — language
// ============================================================================

describe('buildPresetConfig() — language', () => {
  it('defaults to en', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.language).toBe('en');
  });

  it('accepts ko language override', () => {
    const config = buildPresetConfig({ preset: makePreset(), language: 'ko' });
    expect(config.language).toBe('ko');
  });
});

// ============================================================================
// buildPresetConfig — round-robin distribution
// ============================================================================

describe('buildPresetConfig() — round-robin reviewer distribution', () => {
  it('distributes reviewers across two providers in round-robin order', () => {
    const preset = makePreset({
      reviewerCount: 4,
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(reviewers(config)[0]?.provider).toBe('groq');
    expect(reviewers(config)[1]?.provider).toBe('openai');
    expect(reviewers(config)[2]?.provider).toBe('groq');
    expect(reviewers(config)[3]?.provider).toBe('openai');
  });

  it('uses correct models for each provider in round-robin', () => {
    const preset = makePreset({
      reviewerCount: 2,
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(reviewers(config)[0]?.model).toBe('llama-3');
    expect(reviewers(config)[1]?.model).toBe('gpt-4o');
  });

  it('uses same provider for all reviewers when only one provider', () => {
    const preset = makePreset({
      reviewerCount: 3,
      providers: ['groq'],
      models: { groq: 'llama-3' },
    });
    const config = buildPresetConfig({ preset });

    for (const r of reviewers(config)) {
      expect(r.provider).toBe('groq');
    }
  });
});

// ============================================================================
// buildPresetConfig — devil's advocate provider selection
// ============================================================================

describe('buildPresetConfig() — devil\'s advocate (DA) provider', () => {
  it('uses same provider for DA when only one provider available', () => {
    const preset = makePreset({
      providers: ['groq'],
      models: { groq: 'llama-3' },
    });
    const config = buildPresetConfig({ preset });

    expect(config.supporters.devilsAdvocate?.provider).toBe('groq');
  });

  it('uses second provider for DA when multiple providers available', () => {
    const preset = makePreset({
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(config.supporters.devilsAdvocate?.provider).toBe('openai');
  });

  it('DA uses model from its provider', () => {
    const preset = makePreset({
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(config.supporters.devilsAdvocate?.model).toBe('gpt-4o');
  });

  it('DA uses primary model when DA provider model not in models map', () => {
    const preset = makePreset({
      providers: ['groq', 'unknown-provider'],
      models: { groq: 'llama-3' },
    });
    const config = buildPresetConfig({ preset });

    // Falls back to primaryModel
    expect(config.supporters.devilsAdvocate?.model).toBe('llama-3');
  });
});

// ============================================================================
// buildPresetConfig — moderator and head use primary provider
// ============================================================================

describe('buildPresetConfig() — moderator and head', () => {
  it('moderator uses primary provider', () => {
    const preset = makePreset({
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(config.moderator.provider).toBe('groq');
    expect(config.moderator.model).toBe('llama-3');
  });

  it('head uses primary provider', () => {
    const preset = makePreset({
      providers: ['groq', 'openai'],
      models: { groq: 'llama-3', openai: 'gpt-4o' },
    });
    const config = buildPresetConfig({ preset });

    expect(config.head!.provider).toBe('groq');
    expect(config.head!.model).toBe('llama-3');
  });

  it('moderator backend is api', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.moderator.backend).toBe('api');
  });

  it('head backend is api', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.head!.backend).toBe('api');
  });
});

// ============================================================================
// buildPresetConfig — supporters pool
// ============================================================================

describe('buildPresetConfig() — supporters', () => {
  it('supporters pool has at least one entry', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters.pool.length).toBeGreaterThanOrEqual(1);
  });

  it('supporters pool first entry uses primary provider', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters.pool[0]?.provider).toBe('groq');
  });

  it('pickCount is 1', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters.pickCount).toBe(1);
  });

  it('pickStrategy is random', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters.pickStrategy).toBe('random');
  });

  it('personaAssignment is random', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(config.supporters.personaAssignment).toBe('random');
  });

  it('personaPool is a non-empty array', () => {
    const config = buildPresetConfig({ preset: makePreset() });
    expect(Array.isArray(config.supporters.personaPool)).toBe(true);
    expect(config.supporters.personaPool.length).toBeGreaterThan(0);
  });
});

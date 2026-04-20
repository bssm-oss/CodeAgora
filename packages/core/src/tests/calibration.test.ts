/**
 * Model-specific calibration multiplier tests (#467)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getCalibrationMultiplier, shouldAutoCalibrate } from '../l1/calibration.js';
import { setRegistry } from '../l0/model-registry.js';
import type { AgentConfig } from '../types/config.js';
import type { ModelMetadata } from '../types/l0.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'r1',
    model: 'some-model',
    backend: 'api',
    provider: 'openrouter',
    timeout: 120,
    enabled: true,
    ...overrides,
  } as AgentConfig;
}

function makeMeta(tier: ModelMetadata['tier']): ModelMetadata {
  return {
    source: 'openrouter',
    modelId: 'some-model',
    name: 'Some Model',
    tier,
    context: '128k',
    family: 'openai',
    isReasoning: false,
  };
}

afterEach(() => {
  setRegistry(new Map());
});

describe('getCalibrationMultiplier', () => {
  it('returns 1.0 for S+ and S tiers (frontier)', () => {
    const map = new Map();
    map.set('openrouter/some-model', makeMeta('S+'));
    setRegistry(map);
    expect(getCalibrationMultiplier(makeConfig())).toBe(1.0);

    map.set('openrouter/some-model', makeMeta('S'));
    setRegistry(map);
    expect(getCalibrationMultiplier(makeConfig())).toBe(1.0);
  });

  it('returns 0.9 for A+ tier', () => {
    const map = new Map();
    map.set('openrouter/some-model', makeMeta('A+'));
    setRegistry(map);
    expect(getCalibrationMultiplier(makeConfig())).toBe(0.9);
  });

  it('returns 0.8 for A tier, 0.75 for A-, 0.7 for B+, 0.6 for B, 0.5 for C', () => {
    const cases: Array<[NonNullable<ModelMetadata['tier']>, number]> = [
      ['A', 0.8],
      ['A-', 0.75],
      ['B+', 0.7],
      ['B', 0.6],
      ['C', 0.5],
    ];
    for (const [tier, expected] of cases) {
      const map = new Map();
      map.set('openrouter/some-model', makeMeta(tier));
      setRegistry(map);
      expect(getCalibrationMultiplier(makeConfig())).toBe(expected);
    }
  });

  it('returns 0.7 when model is not in registry', () => {
    // Empty registry: model not listed → unknown default
    expect(getCalibrationMultiplier(makeConfig())).toBe(0.7);
  });

  it('returns 0.7 when model is in registry but has no tier rating', () => {
    const meta = makeMeta('S+');
    delete (meta as Partial<ModelMetadata>).tier;
    const map = new Map();
    map.set('openrouter/some-model', meta);
    setRegistry(map);
    expect(getCalibrationMultiplier(makeConfig())).toBe(0.7);
  });

  it('returns 1.0 when provider is undefined (CLI backend)', () => {
    const config: AgentConfig = {
      id: 'r1',
      model: 'claude-code',
      backend: 'claude',
      timeout: 120,
      enabled: true,
    };
    expect(getCalibrationMultiplier(config)).toBe(1.0);
  });

  it('explicit calibrationMultiplier overrides tier-based mapping', () => {
    // Model is S+ (would normally yield 1.0) but config overrides to 0.3
    const map = new Map();
    map.set('openrouter/some-model', makeMeta('S+'));
    setRegistry(map);
    expect(
      getCalibrationMultiplier(makeConfig({ calibrationMultiplier: 0.3 })),
    ).toBe(0.3);
  });
});

describe('shouldAutoCalibrate', () => {
  it('returns true when explicit per-reviewer multiplier is set', () => {
    expect(
      shouldAutoCalibrate({
        reviewContext: { calibrateReviewerConfidence: false },
        config: makeConfig({ calibrationMultiplier: 0.5 }),
      }),
    ).toBe(true);
  });

  it('returns true when global flag is set', () => {
    expect(
      shouldAutoCalibrate({
        reviewContext: { calibrateReviewerConfidence: true },
        config: makeConfig(),
      }),
    ).toBe(true);
  });

  it('returns false by default (opt-in)', () => {
    expect(
      shouldAutoCalibrate({
        reviewContext: undefined,
        config: makeConfig(),
      }),
    ).toBe(false);
    expect(
      shouldAutoCalibrate({
        reviewContext: {},
        config: makeConfig(),
      }),
    ).toBe(false);
  });
});

/**
 * L2 Supporter Pool Selection Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { selectSupporters } from '@codeagora/core/l2/moderator.js';
import type { SupporterPoolConfig } from '@codeagora/core/types/config.js';

describe('Supporter Pool Selection', () => {
  const poolConfig: SupporterPoolConfig = {
    pool: [
      {
        id: 'sp1',
        backend: 'codex',
        model: 'gpt-4o-mini',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'sp2',
        backend: 'gemini',
        model: 'gemini-flash',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'sp3',
        backend: 'opencode',
        provider: 'opencode-zen',
        model: 'kimi-k2.5',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'sp4',
        backend: 'opencode',
        provider: 'opencode-zen',
        model: 'glm-4.7',
        enabled: false, // Disabled
        timeout: 120,
      },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 's-devil',
      backend: 'opencode',
      provider: 'opencode-zen',
      model: 'grok-fast',
      persona: '.ca/personas/devil.md',
      enabled: true,
      timeout: 120,
    },
    personaPool: [
      '.ca/personas/strict.md',
      '.ca/personas/pragmatic.md',
      '.ca/personas/academic.md',
    ],
    personaAssignment: 'random',
  };

  it('should select pickCount supporters from enabled pool', () => {
    const selected = selectSupporters(poolConfig);

    // Should have pickCount + 1 (Devil's Advocate)
    expect(selected).toHaveLength(3);
  });

  it('should always include Devils Advocate', () => {
    const selected = selectSupporters(poolConfig);

    const devil = selected.find((s) => s.id === 's-devil');
    expect(devil).toBeDefined();
    expect(devil?.assignedPersona).toBe('.ca/personas/devil.md');
  });

  it('should not select disabled supporters', () => {
    const selected = selectSupporters(poolConfig);

    const disabled = selected.find((s) => s.id === 'sp4');
    expect(disabled).toBeUndefined();
  });

  it('should assign random personas to pool supporters', () => {
    const selected = selectSupporters(poolConfig);

    // Filter out Devil's Advocate
    const poolSupporters = selected.filter((s) => s.id !== 's-devil');

    for (const supporter of poolSupporters) {
      expect(supporter.assignedPersona).toBeDefined();
      expect(poolConfig.personaPool).toContain(supporter.assignedPersona!);
    }
  });

  it('should not have duplicate supporters', () => {
    const selected = selectSupporters(poolConfig);

    const ids = selected.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should throw if insufficient enabled supporters', () => {
    const insufficientConfig: SupporterPoolConfig = {
      ...poolConfig,
      pool: [
        {
          id: 'sp1',
          backend: 'codex',
          model: 'gpt-4o-mini',
          enabled: true,
          timeout: 120,
        },
        // Only 1 enabled, but pickCount is 2
      ],
      pickCount: 2,
    };

    expect(() => selectSupporters(insufficientConfig)).toThrow(/Insufficient enabled supporters/);
  });

  it('should not include Devils Advocate if disabled', () => {
    const configWithDisabledDevil: SupporterPoolConfig = {
      ...poolConfig,
      devilsAdvocate: {
        ...poolConfig.devilsAdvocate,
        enabled: false,
      },
    };

    const selected = selectSupporters(configWithDisabledDevil);

    const devil = selected.find((s) => s.id === 's-devil');
    expect(devil).toBeUndefined();
    expect(selected).toHaveLength(2); // Only pickCount
  });

  it('should handle multiple selection runs independently', () => {
    const selection1 = selectSupporters(poolConfig);
    const selection2 = selectSupporters(poolConfig);

    // Should both have correct length
    expect(selection1).toHaveLength(3);
    expect(selection2).toHaveLength(3);

    // May have different persona assignments (random)
    const personas1 = selection1.map((s) => s.assignedPersona).sort();
    const personas2 = selection2.map((s) => s.assignedPersona).sort();

    // At least one should be defined (Devil's Advocate)
    expect(personas1.filter(Boolean)).toHaveLength(3);
    expect(personas2.filter(Boolean)).toHaveLength(3);
  });
});

/**
 * #187 Supporter Selection Tests
 * Verifies random selection and persona assignment
 * in selectSupporters from @codeagora/core/l2/moderator.js
 */

import { describe, it, expect } from 'vitest';
import { selectSupporters } from '@codeagora/core/l2/moderator.js';
import type { SupporterPoolConfig } from '@codeagora/core/types/config.js';

// ============================================================================
// Shared fixtures
// ============================================================================

const basePool: SupporterPoolConfig['pool'] = [
  { id: 'sp1', backend: 'codex', model: 'gpt-4o-mini', enabled: true, timeout: 120 },
  { id: 'sp2', backend: 'gemini', model: 'gemini-flash', enabled: true, timeout: 120 },
  { id: 'sp3', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 120 },
];

const baseDevil: SupporterPoolConfig['devilsAdvocate'] = {
  id: 's-devil',
  backend: 'claude',
  model: 'claude-3-5-sonnet',
  persona: '.ca/personas/devil.md',
  enabled: false, // disabled to keep selection predictable
  timeout: 120,
};

const personaPool = [
  '.ca/personas/strict.md',
  '.ca/personas/pragmatic.md',
  '.ca/personas/academic.md',
];

function makeConfig(overrides: Partial<SupporterPoolConfig> = {}): SupporterPoolConfig {
  return {
    pool: basePool,
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: baseDevil,
    personaPool,
    personaAssignment: 'random',
    ...overrides,
  };
}

// ============================================================================
// pickStrategy: 'random'
// ============================================================================

describe('pickStrategy: random', () => {
  it('selects exactly pickCount supporters', () => {
    const config = makeConfig({ pickStrategy: 'random', pickCount: 2 });
    const selected = selectSupporters(config);
    expect(selected).toHaveLength(2);
  });

  it('selected supporters are all from the enabled pool', () => {
    const config = makeConfig({ pickStrategy: 'random', pickCount: 2 });
    const selected = selectSupporters(config);
    const poolIds = basePool.map((s) => s.id);
    for (const s of selected) {
      expect(poolIds).toContain(s.id);
    }
  });

  it('does not include duplicates', () => {
    const config = makeConfig({ pickStrategy: 'random', pickCount: 2 });
    const selected = selectSupporters(config);
    const ids = selected.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// personaAssignment: 'random'
// ============================================================================

describe('personaAssignment: random', () => {
  it('assigns a persona from personaPool to each selected supporter', () => {
    const config = makeConfig({ personaAssignment: 'random', pickCount: 2 });
    const selected = selectSupporters(config);

    for (const s of selected) {
      expect(s.assignedPersona).toBeDefined();
      expect(personaPool).toContain(s.assignedPersona!);
    }
  });

  it('persona assignment is independent per supporter', () => {
    // Run many times — at some point personas should differ (random)
    let sawDifferentPersonas = false;
    for (let i = 0; i < 20; i++) {
      const config = makeConfig({ personaAssignment: 'random', pickCount: 2 });
      const selected = selectSupporters(config);
      const personas = selected.map((s) => s.assignedPersona);
      if (new Set(personas).size > 1) {
        sawDifferentPersonas = true;
        break;
      }
    }
    // With 3 personas and 2 supporters, we should eventually see different assignments
    // (prob of same each trial = 1/3, so prob all-same in 20 trials ≈ (1/3)^20 ≈ 0)
    expect(sawDifferentPersonas).toBe(true);
  });
});

// ============================================================================
// Devil's Advocate interaction
// ============================================================================

describe('Devil\'s Advocate with selection strategies', () => {
  it('devil is prepended before pool supporters', () => {
    const configWithDevil = makeConfig({
      pickStrategy: 'random',
      devilsAdvocate: { ...baseDevil, enabled: true },
    });
    const selected = selectSupporters(configWithDevil);

    // Devil's Advocate is always first
    expect(selected[0].id).toBe('s-devil');
    expect(selected).toHaveLength(3); // 1 devil + pickCount(2)
  });

  it('devil uses its own fixed persona regardless of personaAssignment', () => {
    const configWithDevil = makeConfig({
      personaAssignment: 'random',
      devilsAdvocate: { ...baseDevil, enabled: true, persona: '.ca/personas/devil.md' },
    });
    const selected = selectSupporters(configWithDevil);

    const devil = selected.find((s) => s.id === 's-devil');
    expect(devil).toBeDefined();
    expect(devil!.assignedPersona).toBe('.ca/personas/devil.md');
  });
});

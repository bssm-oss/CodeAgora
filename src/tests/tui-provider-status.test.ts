/**
 * Tests for src/tui/utils/provider-status.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import {
  isProviderAvailable,
  getAllProviderStatuses,
  getActiveProviderCount,
  getMissingProviders,
} from '@codeagora/tui/utils/provider-status.js';

// ============================================================================
// Helpers
// ============================================================================

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Snapshot full env so we can restore it after each test
  savedEnv = { ...process.env };
  // Strip all known provider keys to start from a clean slate
  for (const envVar of Object.values(PROVIDER_ENV_VARS)) {
    delete process.env[envVar];
  }
});

afterEach(() => {
  // Restore original env to prevent test pollution
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
});

// ============================================================================
// isProviderAvailable
// ============================================================================

describe('isProviderAvailable', () => {
  it('returns true when the provider env var is set', () => {
    process.env['GROQ_API_KEY'] = 'test-key-value';
    expect(isProviderAvailable('groq')).toBe(true);
  });

  it('returns false when the provider env var is not set', () => {
    delete process.env['GROQ_API_KEY'];
    expect(isProviderAvailable('groq')).toBe(false);
  });

  it('returns false for an unknown provider with no matching env var', () => {
    // "nonexistent" would fall back to NONEXISTENT_API_KEY which is not set
    expect(isProviderAvailable('nonexistent')).toBe(false);
  });
});

// ============================================================================
// getAllProviderStatuses
// ============================================================================

describe('getAllProviderStatuses', () => {
  it('returns one entry for every provider in PROVIDER_ENV_VARS', () => {
    const statuses = getAllProviderStatuses();
    const expectedProviders = Object.keys(PROVIDER_ENV_VARS);
    expect(statuses).toHaveLength(expectedProviders.length);
    const returnedProviders = statuses.map(s => s.provider);
    for (const p of expectedProviders) {
      expect(returnedProviders).toContain(p);
    }
  });

  it('marks hasKey true only for providers whose env var is set', () => {
    process.env['GROQ_API_KEY'] = 'set-value';
    process.env['GOOGLE_API_KEY'] = 'another-value';

    const statuses = getAllProviderStatuses();
    const groq = statuses.find(s => s.provider === 'groq');
    const google = statuses.find(s => s.provider === 'google');
    const mistral = statuses.find(s => s.provider === 'mistral');

    expect(groq?.hasKey).toBe(true);
    expect(google?.hasKey).toBe(true);
    expect(mistral?.hasKey).toBe(false);
  });

  it('marks all providers as hasKey false when no env vars are set', () => {
    const statuses = getAllProviderStatuses();
    expect(statuses.every(s => s.hasKey === false)).toBe(true);
  });

  it('includes the correct envVar field for each entry', () => {
    const statuses = getAllProviderStatuses();
    const groq = statuses.find(s => s.provider === 'groq');
    expect(groq?.envVar).toBe('GROQ_API_KEY');
  });
});

// ============================================================================
// getActiveProviderCount
// ============================================================================

describe('getActiveProviderCount', () => {
  it('returns zero active when no env vars are set', () => {
    const { active, total } = getActiveProviderCount();
    expect(active).toBe(0);
    expect(total).toBe(Object.keys(PROVIDER_ENV_VARS).length);
  });

  it('returns correct active count when some env vars are set', () => {
    process.env['GROQ_API_KEY'] = 'key1';
    process.env['OPENAI_API_KEY'] = 'key2';
    process.env['ANTHROPIC_API_KEY'] = 'key3';

    const { active, total } = getActiveProviderCount();
    expect(active).toBe(3);
    expect(total).toBe(Object.keys(PROVIDER_ENV_VARS).length);
  });

  it('returns total equal to the number of known providers', () => {
    const { total } = getActiveProviderCount();
    expect(total).toBe(Object.keys(PROVIDER_ENV_VARS).length);
  });
});

// ============================================================================
// getMissingProviders
// ============================================================================

describe('getMissingProviders', () => {
  it('returns only providers without keys set', () => {
    process.env['GROQ_API_KEY'] = 'set';
    // google and mistral are not set
    const missing = getMissingProviders(['groq', 'google', 'mistral']);
    expect(missing).toEqual(['google', 'mistral']);
    expect(missing).not.toContain('groq');
  });

  it('returns empty array when all provided providers have keys set', () => {
    process.env['GROQ_API_KEY'] = 'key1';
    process.env['OPENAI_API_KEY'] = 'key2';
    const missing = getMissingProviders(['groq', 'openai']);
    expect(missing).toEqual([]);
  });

  it('returns all providers when none have keys set', () => {
    const providers = ['groq', 'google', 'openai'];
    const missing = getMissingProviders(providers);
    expect(missing).toEqual(providers);
  });

  it('returns empty array for an empty input list', () => {
    const missing = getMissingProviders([]);
    expect(missing).toEqual([]);
  });
});

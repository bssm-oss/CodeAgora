/**
 * Dry-Run Pipeline Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { estimateTokensFromDiff, dryRun, formatDryRunText } from '@codeagora/core/pipeline/dryrun.js';
import type { Config } from '@codeagora/core/types/config.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    reviewers: [
      {
        id: 'r1-groq',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'r2-google',
        model: 'gemini-2.5-flash',
        backend: 'api',
        provider: 'google',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'r3-mistral',
        model: 'mistral-large-latest',
        backend: 'api',
        provider: 'mistral',
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
          model: 'gemini-2.5-flash',
          backend: 'api',
          provider: 'google',
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
      personaPool: ['skeptic', 'optimist'],
      personaAssignment: 'random',
    },
    moderator: {
      backend: 'api',
      model: 'llama-3.3-70b-versatile',
      provider: 'groq',
    },
    discussion: {
      maxRounds: 3,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 2,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7,
    },
    ...overrides,
  } as Config;
}

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,6 @@
 export function foo() {
-  return 1;
+  const x = 2;
+  return x;
 }`;

// ============================================================================
// estimateTokensFromDiff
// ============================================================================

describe('estimateTokensFromDiff', () => {
  it('empty diff returns 0', async () => {
    expect(estimateTokensFromDiff('')).toBe(0);
  });

  it('short diff returns reasonable estimate', async () => {
    const tokens = estimateTokensFromDiff(SAMPLE_DIFF);
    // SAMPLE_DIFF is ~190 chars → ~48 tokens
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(200);
    // chars / 4 rounded up
    expect(tokens).toBe(Math.ceil(SAMPLE_DIFF.length / 4));
  });

  it('longer diff scales linearly', async () => {
    const longDiff = SAMPLE_DIFF.repeat(10);
    const tokens = estimateTokensFromDiff(longDiff);
    expect(tokens).toBe(Math.ceil(longDiff.length / 4));
    expect(tokens).toBeGreaterThan(estimateTokensFromDiff(SAMPLE_DIFF));
  });
});

// ============================================================================
// dryRun
// ============================================================================

describe('dryRun', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns correct reviewer list from array config', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    expect(result.reviewers).toHaveLength(3);
    expect(result.reviewers[0].id).toBe('r1-groq');
    expect(result.reviewers[0].provider).toBe('groq');
    expect(result.reviewers[0].model).toBe('llama-3.3-70b-versatile');
    expect(result.reviewers[0].isAuto).toBe(false);
  });

  it('cost estimates are positive values', async () => {
    process.env.GROQ_API_KEY = 'test-key';

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    expect(result.estimation.estimatedL1Tokens).toBeGreaterThan(0);
    expect(result.estimation.estimatedL2Tokens).toBeGreaterThan(0);
    expect(result.estimation.estimatedL3Tokens).toBeGreaterThan(0);

    // L1 cost should be a dollar string or N/A
    expect(result.estimation.estimatedL1Cost).toMatch(/^\$[\d.]+$|^N\/A$/);
    expect(result.estimation.totalEstimatedCost).toMatch(/^\$[\d.]+$|^N\/A$/);
  });

  it('provider with no API key gets no-api-key health status', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    const groqHealth = result.health.find((h) => h.provider === 'groq');
    expect(groqHealth).toBeDefined();
    expect(groqHealth!.status).toBe('no-api-key');

    const googleHealth = result.health.find((h) => h.provider === 'google');
    expect(googleHealth).toBeDefined();
    expect(googleHealth!.status).toBe('no-api-key');
  });

  it('provider with API key set gets available health status', async () => {
    process.env.GROQ_API_KEY = 'test-key-groq';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    const groqHealth = result.health.find((h) => h.provider === 'groq');
    expect(groqHealth!.status).toBe('available');

    const googleHealth = result.health.find((h) => h.provider === 'google');
    expect(googleHealth!.status).toBe('no-api-key');
  });

  it('missing API key adds warning message', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    expect(result.warnings.length).toBeGreaterThan(0);
    // At least one warning mentions an env var
    const hasKeyWarning = result.warnings.some((w) => w.includes('_API_KEY'));
    expect(hasKeyWarning).toBe(true);
  });

  it('auto reviewer entry has isAuto: true', async () => {
    delete process.env.GROQ_API_KEY;

    const config = makeConfig({
      reviewers: [
        {
          id: 'r1-groq',
          model: 'llama-3.3-70b-versatile',
          backend: 'api',
          provider: 'groq',
          enabled: true,
          timeout: 120,
        },
        { id: 'auto-1', auto: true as const, enabled: true },
        { id: 'auto-2', auto: true as const, enabled: true },
      ],
    });

    const result = await dryRun(config, SAMPLE_DIFF);

    const autoReviewers = result.reviewers.filter((r) => r.isAuto);
    expect(autoReviewers).toHaveLength(2);
    expect(autoReviewers[0].id).toBe('auto-1');
    expect(autoReviewers[1].id).toBe('auto-2');

    const staticReviewers = result.reviewers.filter((r) => !r.isAuto);
    expect(staticReviewers).toHaveLength(1);
    expect(staticReviewers[0].isAuto).toBe(false);
  });

  it('config summary reflects reviewerCount and supporterCount', async () => {
    const result = await dryRun(makeConfig(), SAMPLE_DIFF);

    expect(result.config.reviewerCount).toBe(3);
    expect(result.config.supporterCount).toBe(2);
    expect(result.config.maxDiscussionRounds).toBe(3);
  });

  it('declarative reviewers config: static + auto slots', async () => {
    delete process.env.GROQ_API_KEY;

    const config: Config = {
      reviewers: {
        count: 4,
        static: [
          {
            id: 'r-static',
            model: 'llama-3.3-70b-versatile',
            backend: 'api',
            provider: 'groq',
            enabled: true,
            timeout: 120,
          },
        ],
      },
      supporters: makeConfig().supporters,
      moderator: makeConfig().moderator,
      discussion: makeConfig().discussion,
      errorHandling: makeConfig().errorHandling,
    } as Config;

    const result = await dryRun(config, SAMPLE_DIFF);

    expect(result.config.reviewerCount).toBe(4);

    const staticR = result.reviewers.filter((r) => !r.isAuto);
    const autoR = result.reviewers.filter((r) => r.isAuto);
    expect(staticR).toHaveLength(1);
    expect(autoR).toHaveLength(3);
  });

  it('zero-length diff produces 0 L1 tokens', async () => {
    const result = await dryRun(makeConfig(), '');

    expect(result.estimation.estimatedL1Tokens).toBe(0);
  });
});

// ============================================================================
// formatDryRunText
// ============================================================================

describe('formatDryRunText', () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  afterEach(() => {
    // clean up any keys set during tests
  });

  it('output contains all major section headers', async () => {
    const result = await dryRun(makeConfig(), SAMPLE_DIFF);
    const text = formatDryRunText(result);

    expect(text).toContain('Pipeline Dry Run Report');
    expect(text).toContain('Config:');
    expect(text).toContain('Reviewers:');
    expect(text).toContain('Cost Estimation:');
    expect(text).toContain('Provider Health:');
  });

  it('output contains reviewer ids', async () => {
    const result = await dryRun(makeConfig(), SAMPLE_DIFF);
    const text = formatDryRunText(result);

    expect(text).toContain('r1-groq');
    expect(text).toContain('r2-google');
    expect(text).toContain('r3-mistral');
  });

  it('output contains L1/L2/L3 cost lines', async () => {
    const result = await dryRun(makeConfig(), SAMPLE_DIFF);
    const text = formatDryRunText(result);

    expect(text).toContain('L1 (Review)');
    expect(text).toContain('L2 (Discussion)');
    expect(text).toContain('L3 (Verdict)');
    expect(text).toContain('Total');
  });

  it('output contains Warnings section when warnings exist', async () => {
    const result = await dryRun(makeConfig(), SAMPLE_DIFF);
    // All API keys missing → warnings should be present
    expect(result.warnings.length).toBeGreaterThan(0);

    const text = formatDryRunText(result);
    expect(text).toContain('Warnings:');
  });

  it('output does not contain Warnings section when no warnings', async () => {
    process.env.GROQ_API_KEY = 'key1';
    process.env.GOOGLE_API_KEY = 'key2';
    process.env.MISTRAL_API_KEY = 'key3';

    const result = await dryRun(makeConfig(), SAMPLE_DIFF);
    const text = formatDryRunText(result);

    // Warnings section should be absent when there are none
    expect(text).not.toContain('Warnings:');
  });

  it('auto reviewer shows "auto" label in output', async () => {
    const config = makeConfig({
      reviewers: [
        { id: 'auto-1', auto: true as const, enabled: true },
      ],
    });

    const result = await dryRun(config, SAMPLE_DIFF);
    const text = formatDryRunText(result);

    expect(text).toContain('auto-1');
    expect(text).toContain('(auto)');
  });
});

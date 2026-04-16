/**
 * Package-level tests for packages/mcp/src/tools/
 *
 * Covers: module exports, zod input schema shapes, dry-run output structure,
 * and helpers function signatures. Does not make real LLM calls.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool module exports
// ---------------------------------------------------------------------------

describe('MCP tool module exports', () => {
  it('review-quick exports registerReviewQuick as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/review-quick.js');
    expect(typeof mod.registerReviewQuick).toBe('function');
  });

  it('review-full exports registerReviewFull as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/review-full.js');
    expect(typeof mod.registerReviewFull).toBe('function');
  });

  it('dry-run exports registerDryRun as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/dry-run.js');
    expect(typeof mod.registerDryRun).toBe('function');
  });

  it('explain exports registerExplain as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/explain.js');
    expect(typeof mod.registerExplain).toBe('function');
  });

  it('leaderboard exports registerLeaderboard as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/leaderboard.js');
    expect(typeof mod.registerLeaderboard).toBe('function');
  });

  it('stats exports registerStats as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/stats.js');
    expect(typeof mod.registerStats).toBe('function');
  });

  it('review-pr exports registerReviewPr as a function', async () => {
    const mod = await import('@codeagora/mcp/tools/review-pr.js');
    expect(typeof mod.registerReviewPr).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Helpers module exports
// ---------------------------------------------------------------------------

describe('MCP helpers module exports', () => {
  it('exports runReviewCompact as a function', async () => {
    const mod = await import('@codeagora/mcp/helpers.js');
    expect(typeof mod.runReviewCompact).toBe('function');
  });

  it('exports runReviewRaw as a function', async () => {
    const mod = await import('@codeagora/mcp/helpers.js');
    expect(typeof mod.runReviewRaw).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Input schema validation (zod schemas inline-tested to match tool definitions)
// ---------------------------------------------------------------------------

describe('review_quick input schema', () => {
  // Schema mirrors what the tool uses internally
  const schema = z.object({
    diff: z.string(),
    reviewer_count: z.number().optional().default(3),
  });

  it('accepts valid diff string', () => {
    const result = schema.safeParse({ diff: 'diff --git a/f b/f\n+added' });
    expect(result.success).toBe(true);
  });

  it('applies default reviewer_count of 3', () => {
    const result = schema.safeParse({ diff: 'some diff' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reviewer_count).toBe(3);
  });

  it('accepts explicit reviewer_count', () => {
    const result = schema.safeParse({ diff: 'diff', reviewer_count: 5 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reviewer_count).toBe(5);
  });

  it('rejects missing diff', () => {
    const result = schema.safeParse({ reviewer_count: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects non-string diff', () => {
    const result = schema.safeParse({ diff: 123 });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric reviewer_count', () => {
    const result = schema.safeParse({ diff: 'diff', reviewer_count: 'five' });
    expect(result.success).toBe(false);
  });
});

describe('review_full input schema', () => {
  const schema = z.object({ diff: z.string() });

  it('accepts a valid diff', () => {
    expect(schema.safeParse({ diff: '@@ -1 +1 @@\n+hello' }).success).toBe(true);
  });

  it('rejects empty input', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('explain_session input schema', () => {
  const schema = z.object({ session: z.string() });

  it('accepts a valid session path', () => {
    expect(schema.safeParse({ session: '2026-03-21/001' }).success).toBe(true);
  });

  it('rejects missing session', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects numeric session', () => {
    expect(schema.safeParse({ session: 42 }).success).toBe(false);
  });
});

describe('dry_run input schema', () => {
  const schema = z.object({ diff: z.string() });

  it('accepts a diff string', () => {
    expect(schema.safeParse({ diff: 'diff content' }).success).toBe(true);
  });

  it('accepts empty diff string', () => {
    // The tool accepts it; complexity module decides meaning
    expect(schema.safeParse({ diff: '' }).success).toBe(true);
  });

  it('rejects non-string diff', () => {
    expect(schema.safeParse({ diff: null }).success).toBe(false);
  });
});

describe('review_pr input schema', () => {
  const schema = z.object({ pr_url: z.string() });

  it('accepts a GitHub PR URL', () => {
    expect(
      schema.safeParse({ pr_url: 'https://github.com/owner/repo/pull/42' }).success,
    ).toBe(true);
  });

  it('rejects missing pr_url', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dry_run output structure via estimateDiffComplexity
// ---------------------------------------------------------------------------

describe('estimateDiffComplexity output shape', () => {
  it('returns expected fields for a simple diff', async () => {
    const { estimateDiffComplexity } = await import(
      '@codeagora/core/pipeline/diff-complexity.js'
    );

    const diff = [
      'diff --git a/src/index.ts b/src/index.ts',
      'index abc..def 100644',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1,3 +1,4 @@',
      ' const x = 1;',
      '+const y = 2;',
      '-const z = 3;',
      ' export {};',
    ].join('\n');

    const result = estimateDiffComplexity(diff);

    expect(typeof result.level).toBe('string');
    expect(typeof result.fileCount).toBe('number');
    expect(typeof result.totalLines).toBe('number');
    expect(typeof result.addedLines).toBe('number');
    expect(typeof result.removedLines).toBe('number');
    expect(typeof result.estimatedReviewCost).toBe('string');
    expect(Array.isArray(result.securitySensitiveFiles)).toBe(true);
  });

  it('counts added and removed lines correctly', async () => {
    const { estimateDiffComplexity } = await import(
      '@codeagora/core/pipeline/diff-complexity.js'
    );

    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,3 @@',
      '+added line 1',
      '+added line 2',
      '-removed line',
    ].join('\n');

    const result = estimateDiffComplexity(diff);
    expect(result.addedLines).toBe(2);
    expect(result.removedLines).toBe(1);
  });

  it('handles empty diff without throwing', async () => {
    const { estimateDiffComplexity } = await import(
      '@codeagora/core/pipeline/diff-complexity.js'
    );
    expect(() => estimateDiffComplexity('')).not.toThrow();
  });
});

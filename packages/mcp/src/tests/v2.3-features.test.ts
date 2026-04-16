/**
 * v2.3.0 Feature Tests
 *
 * Covers: new tool exports, extended schemas, helpers exports,
 * shared schema validation, config tool schemas, and PR number resolution.
 * Does not make real LLM calls.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { reviewOptionsSchema, stagedSchema, postReviewSchema } from '../tools/shared-schema.js';

// ============================================================================
// New tool module exports
// ============================================================================

describe('v2.3.0 tool module exports', () => {
  it('config-get exports registerConfigGet', async () => {
    const mod = await import('../tools/config-get.js');
    expect(typeof mod.registerConfigGet).toBe('function');
  });

  it('config-set exports registerConfigSet', async () => {
    const mod = await import('../tools/config-set.js');
    expect(typeof mod.registerConfigSet).toBe('function');
  });

  it('shared-schema exports reviewOptionsSchema', async () => {
    const mod = await import('../tools/shared-schema.js');
    expect(mod.reviewOptionsSchema).toBeDefined();
    expect(mod.stagedSchema).toBeDefined();
    expect(mod.postReviewSchema).toBeDefined();
  });
});

// ============================================================================
// Extended helpers exports
// ============================================================================

describe('v2.3.0 helpers exports', () => {
  it('exports runReviewRaw as a function', async () => {
    const mod = await import('../helpers.js');
    expect(typeof mod.runReviewRaw).toBe('function');
  });

  it('exports runReviewCompact as a function', async () => {
    const mod = await import('../helpers.js');
    expect(typeof mod.runReviewCompact).toBe('function');
  });

  it('exports getStagedDiff as a function', async () => {
    const mod = await import('../helpers.js');
    expect(typeof mod.getStagedDiff).toBe('function');
  });

});

// ============================================================================
// post-actions exports
// ============================================================================

describe('post-actions exports', () => {
  it('exports formatReviewResult', async () => {
    const mod = await import('../post-actions.js');
    expect(typeof mod.formatReviewResult).toBe('function');
  });

  it('exports postToGitHub', async () => {
    const mod = await import('../post-actions.js');
    expect(typeof mod.postToGitHub).toBe('function');
  });

  it('exports sendReviewNotification', async () => {
    const mod = await import('../post-actions.js');
    expect(typeof mod.sendReviewNotification).toBe('function');
  });
});

// ============================================================================
// Shared review options schema validation
// ============================================================================

describe('reviewOptionsSchema validation', () => {
  const schema = z.object(reviewOptionsSchema);

  it('accepts empty object (all optional)', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts provider override', () => {
    const result = schema.safeParse({ provider: 'groq' });
    expect(result.success).toBe(true);
  });

  it('accepts model override', () => {
    const result = schema.safeParse({ model: 'llama-3.3-70b-versatile' });
    expect(result.success).toBe(true);
  });

  it('accepts timeout_seconds as positive number', () => {
    expect(schema.safeParse({ timeout_seconds: 60 }).success).toBe(true);
  });

  it('rejects timeout_seconds <= 0', () => {
    expect(schema.safeParse({ timeout_seconds: 0 }).success).toBe(false);
    expect(schema.safeParse({ timeout_seconds: -1 }).success).toBe(false);
  });

  it('accepts reviewer_count in range 1-10', () => {
    expect(schema.safeParse({ reviewer_count: 1 }).success).toBe(true);
    expect(schema.safeParse({ reviewer_count: 10 }).success).toBe(true);
  });

  it('rejects reviewer_count out of range', () => {
    expect(schema.safeParse({ reviewer_count: 0 }).success).toBe(false);
    expect(schema.safeParse({ reviewer_count: 11 }).success).toBe(false);
  });

  it('accepts reviewer_names as string array', () => {
    expect(schema.safeParse({ reviewer_names: ['r1', 'r2'] }).success).toBe(true);
  });

  it('rejects reviewer_names with non-strings', () => {
    expect(schema.safeParse({ reviewer_names: [1, 2] }).success).toBe(false);
  });

  it('accepts no_cache boolean', () => {
    expect(schema.safeParse({ no_cache: true }).success).toBe(true);
    expect(schema.safeParse({ no_cache: false }).success).toBe(true);
  });

  it('accepts context_lines >= 0', () => {
    expect(schema.safeParse({ context_lines: 0 }).success).toBe(true);
    expect(schema.safeParse({ context_lines: 20 }).success).toBe(true);
  });

  it('rejects negative context_lines', () => {
    expect(schema.safeParse({ context_lines: -1 }).success).toBe(false);
  });

  it('accepts valid output_format values', () => {
    for (const fmt of ['compact', 'text', 'json', 'md', 'github', 'html', 'junit']) {
      expect(schema.safeParse({ output_format: fmt }).success).toBe(true);
    }
  });

  it('rejects invalid output_format', () => {
    expect(schema.safeParse({ output_format: 'xml' }).success).toBe(false);
  });

  it('accepts multiple options combined', () => {
    const result = schema.safeParse({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      timeout_seconds: 120,
      reviewer_count: 3,
      no_cache: true,
      context_lines: 10,
      output_format: 'json',
      notify: true,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Staged schema
// ============================================================================

describe('stagedSchema validation', () => {
  const schema = z.object(stagedSchema);

  it('accepts staged: true', () => {
    expect(schema.safeParse({ staged: true }).success).toBe(true);
  });

  it('accepts staged: false', () => {
    expect(schema.safeParse({ staged: false }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });
});

// ============================================================================
// Post-review schema
// ============================================================================

describe('postReviewSchema validation', () => {
  const schema = z.object(postReviewSchema);

  it('accepts post_review: true', () => {
    expect(schema.safeParse({ post_review: true }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });
});

// ============================================================================
// Extended review_quick schema (diff optional when staged=true)
// ============================================================================

describe('review_quick extended schema', () => {
  const schema = z.object({
    diff: z.string().optional(),
    ...reviewOptionsSchema,
    ...stagedSchema,
  });

  it('accepts diff without staged', () => {
    expect(schema.safeParse({ diff: 'some diff' }).success).toBe(true);
  });

  it('accepts staged without diff', () => {
    expect(schema.safeParse({ staged: true }).success).toBe(true);
  });

  it('accepts both diff and provider override', () => {
    const result = schema.safeParse({
      diff: 'some diff',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewer_count: 5,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Extended review_pr schema (pr_url or pr_number)
// ============================================================================

describe('review_pr extended schema', () => {
  const prUrlRegex = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/;
  const schema = z.object({
    pr_url: z.string().regex(prUrlRegex).optional(),
    pr_number: z.number().int().positive().optional(),
    ...reviewOptionsSchema,
    ...postReviewSchema,
  });

  it('accepts pr_url', () => {
    expect(schema.safeParse({ pr_url: 'https://github.com/owner/repo/pull/42' }).success).toBe(true);
  });

  it('accepts pr_number', () => {
    expect(schema.safeParse({ pr_number: 42 }).success).toBe(true);
  });

  it('accepts pr_url with post_review', () => {
    const result = schema.safeParse({
      pr_url: 'https://github.com/owner/repo/pull/42',
      post_review: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid pr_url format', () => {
    expect(schema.safeParse({ pr_url: 'not-a-url' }).success).toBe(false);
  });

  it('rejects negative pr_number', () => {
    expect(schema.safeParse({ pr_number: -1 }).success).toBe(false);
  });

  it('rejects float pr_number', () => {
    expect(schema.safeParse({ pr_number: 4.5 }).success).toBe(false);
  });
});

// ============================================================================
// config_get schema
// ============================================================================

describe('config_get schema', () => {
  const schema = z.object({
    key: z.string().optional(),
  });

  it('accepts empty (full config)', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts dot-notation key', () => {
    expect(schema.safeParse({ key: 'discussion.maxRounds' }).success).toBe(true);
  });

  it('accepts simple key', () => {
    expect(schema.safeParse({ key: 'mode' }).success).toBe(true);
  });
});

// ============================================================================
// config_set schema
// ============================================================================

describe('config_set schema', () => {
  const schema = z.object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  });

  it('accepts string value', () => {
    expect(schema.safeParse({ key: 'language', value: 'ko' }).success).toBe(true);
  });

  it('accepts number value', () => {
    expect(schema.safeParse({ key: 'discussion.maxRounds', value: 5 }).success).toBe(true);
  });

  it('accepts boolean value', () => {
    expect(schema.safeParse({ key: 'discussion.enabled', value: true }).success).toBe(true);
  });

  it('rejects missing key', () => {
    expect(schema.safeParse({ value: 'test' }).success).toBe(false);
  });

  it('rejects missing value', () => {
    expect(schema.safeParse({ key: 'mode' }).success).toBe(false);
  });

  it('rejects null value', () => {
    expect(schema.safeParse({ key: 'mode', value: null }).success).toBe(false);
  });
});

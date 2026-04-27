/**
 * Shared Zod Schema for Review Tools
 * Common optional parameters available across all review tools.
 */

import { z } from 'zod';

/**
 * Common optional parameters for review tools.
 * All fields mirror CLI review flags mapped to PipelineInput.
 */
export const reviewOptionsSchema = {
  provider: z.string().optional().describe('Override LLM provider for all reviewers'),
  model: z.string().optional().describe('Override LLM model for all reviewers'),
  timeout_seconds: z.number().positive().optional().describe('Pipeline-wide timeout in seconds'),
  reviewer_timeout_seconds: z.number().positive().optional().describe('Per-reviewer timeout in seconds'),
  reviewer_count: z.number().min(1).max(10).optional().describe('Number of reviewers (1-10)'),
  reviewer_names: z.array(z.string()).optional().describe('Specific reviewer IDs to use (e.g. ["r1", "r2"])'),
  no_cache: z.boolean().optional().describe('Skip result caching, always run fresh'),
  repo_path: z.string().optional().describe('Git repo root path for surrounding code context'),
  context_lines: z.number().min(0).optional().describe('Context lines around changes (default 20, 0 = disabled)'),
  output_format: z.enum(['compact', 'text', 'json', 'md', 'github', 'html', 'junit', 'sarif']).optional()
    .describe('Result format (default: compact; json returns the versioned codeagora.review.v1 agent contract)'),
};

/**
 * Schema for staged diff support (review_quick, review_full).
 */
export const stagedSchema = {
  staged: z.boolean().optional().describe('Review git staged changes instead of diff input'),
};

/**
 * Schema for PR posting (review_pr).
 */
export const postReviewSchema = {
  post_review: z.boolean().optional().describe('Post review comments to the GitHub PR'),
};

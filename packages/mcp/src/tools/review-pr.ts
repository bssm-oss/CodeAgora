/**
 * review_pr — Fetch PR diff and run full review (6.1)
 * Supports both PR URL and PR number (auto-detects owner/repo from git remote).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runReviewCompact, runReviewRaw, type ReviewOptions } from '../helpers.js';
import { formatReviewResult, postToGitHub, type OutputFormat } from '../post-actions.js';
import { reviewOptionsSchema, postReviewSchema } from './shared-schema.js';

/**
 * Resolve a PR URL from either a URL or a number + git remote.
 */
async function resolvePrUrl(prUrl?: string, prNumber?: number): Promise<string> {
  if (prUrl) return prUrl;

  if (prNumber == null) {
    throw new Error('Either pr_url or pr_number is required');
  }

  const { execFile: execFileCb } = await import('child_process');
  const { promisify } = await import('util');
  const execFile = promisify(execFileCb);

  const { stdout: remoteUrl } = await execFile('git', ['remote', 'get-url', 'origin']);
  const trimmed = remoteUrl.trim();

  // Parse owner/repo from git remote URL
  // Formats: https://github.com/owner/repo.git, git@github.com:owner/repo.git
  const httpsMatch = trimmed.match(/github\.com\/([^/]+)\/([^/.]+)/);
  const sshMatch = trimmed.match(/github\.com:([^/]+)\/([^/.]+)/);
  const match = httpsMatch ?? sshMatch;

  if (!match) {
    throw new Error(`Could not parse GitHub owner/repo from remote: ${trimmed}`);
  }

  return `https://github.com/${match[1]}/${match[2]}/pull/${prNumber}`;
}

export function registerReviewPr(server: McpServer): void {
  server.tool(
    'review_pr',
    'Review a GitHub PR — fetches the diff automatically and runs full multi-LLM review. Supports PR URL (https://github.com/owner/repo/pull/123) or just a PR number (auto-detects owner/repo from git remote). Can post results back as PR comments with --post_review.',
    {
      pr_url: z.string()
        .regex(
          /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/,
          'Must be a valid GitHub PR URL: https://github.com/owner/repo/pull/123',
        )
        .optional()
        .describe('GitHub PR URL (e.g. https://github.com/owner/repo/pull/123)'),
      pr_number: z.number().int().positive().optional()
        .describe('PR number (auto-detects owner/repo from git remote)'),
      ...reviewOptionsSchema,
      ...postReviewSchema,
    },
    async (params) => {
      try {
        const prUrl = await resolvePrUrl(params.pr_url, params.pr_number);

        // Fetch diff via gh CLI
        const { execFile: execFileCb } = await import('child_process');
        const { promisify } = await import('util');
        const execFile = promisify(execFileCb);
        const { stdout: diff } = await execFile('gh', ['pr', 'diff', prUrl]);

        const options: ReviewOptions = {
          ...(params.reviewer_count != null && { reviewerCount: params.reviewer_count }),
          ...(params.reviewer_names && { reviewerNames: params.reviewer_names }),
          ...(params.provider && { provider: params.provider }),
          ...(params.model && { model: params.model }),
          ...(params.timeout_seconds != null && { timeoutSeconds: params.timeout_seconds }),
          ...(params.reviewer_timeout_seconds != null && { reviewerTimeoutSeconds: params.reviewer_timeout_seconds }),
          ...(params.no_cache != null && { noCache: params.no_cache }),
          ...(params.repo_path && { repoPath: params.repo_path }),
          ...(params.context_lines != null && { contextLines: params.context_lines }),
        };

        // Post-pipeline actions need raw result
        if (params.post_review || (params.output_format && params.output_format !== 'compact')) {
          const rawResult = await runReviewRaw(diff, options);

          if (params.post_review) {
            await postToGitHub(rawResult, prUrl).catch(() => {});
          }
          if (params.output_format && params.output_format !== 'compact') {
            const formatted = await formatReviewResult(rawResult, params.output_format as OutputFormat);
            return { content: [{ type: 'text' as const, text: formatted }] };
          }
        }

        const result = await runReviewCompact(diff, options);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Failed to review PR: ${msg}` }) }], isError: true };
      }
    },
  );
}

/**
 * review_quick — L1-only fast review (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runReviewCompact, getStagedDiff, type ReviewOptions } from '../helpers.js';
import { formatReviewResult, type OutputFormat } from '../post-actions.js';
import { runReviewRaw } from '../helpers.js';
import { reviewOptionsSchema, stagedSchema } from './shared-schema.js';
import { errorMessage, mcpErrorResponse, resolveRepoPathOrError } from './shared-response.js';

export function registerReviewQuick(server: McpServer): void {
  server.tool(
    'review_quick',
    'Use when you need rapid feedback on a small diff from parallel reviewers without debate. Returns compact JSON with verdict, reasoning, grouped issues, severity, confidence, file locations, and session id. repo_path: omit when the MCP server already runs in the target workspace; otherwise pass the exact workspace root.',
    {
      diff: z.string().optional().describe('Unified diff content (optional if staged=true). Leave empty only when using staged=true.'),
      ...reviewOptionsSchema,
      ...stagedSchema,
    },
    async (params) => {
      try {
        const repoPath = await resolveRepoPathOrError(params.repo_path);
        if (!repoPath.ok) {
          return mcpErrorResponse(repoPath.error.code, repoPath.error.message, repoPath.error.details);
        }

        const diff = params.staged ? await getStagedDiff(repoPath.repoPath) : params.diff;
        if (!diff || diff.trim().length === 0) {
          return mcpErrorResponse('INVALID_INPUT', 'Either diff or staged=true is required');
        }

        const options: ReviewOptions = {
          skipDiscussion: true,
          skipHead: true,
          ...(params.reviewer_count != null && { reviewerCount: params.reviewer_count }),
          ...(params.reviewer_names && { reviewerNames: params.reviewer_names }),
          ...(params.provider && { provider: params.provider }),
          ...(params.model && { model: params.model }),
          ...(params.timeout_seconds != null && { timeoutSeconds: params.timeout_seconds }),
          ...(params.reviewer_timeout_seconds != null && { reviewerTimeoutSeconds: params.reviewer_timeout_seconds }),
          ...(params.no_cache != null && { noCache: params.no_cache }),
          ...(repoPath.repoPath && { repoPath: repoPath.repoPath }),
          ...(params.context_lines != null && { contextLines: params.context_lines }),
        };

        // If custom output format requested, use raw pipeline result
        if (params.output_format && params.output_format !== 'compact') {
          const rawResult = await runReviewRaw(diff, options);

          const formatted = await formatReviewResult(rawResult, params.output_format as OutputFormat);
          return { content: [{ type: 'text' as const, text: formatted }] };
        }

        const result = await runReviewCompact(diff, options);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return mcpErrorResponse('REVIEW_FAILED', errorMessage(err));
      }
    },
  );
}

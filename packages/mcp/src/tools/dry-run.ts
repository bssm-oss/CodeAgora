/**
 * dry_run — Cost estimation without LLM calls (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { estimateDiffComplexity } from '@codeagora/core/pipeline/diff-complexity.js';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

export function registerDryRun(server: McpServer): void {
  server.tool(
    'dry_run',
    'Preflight a diff without making LLM calls. Use before review_quick/review_full to estimate complexity, files, line counts, security-sensitive paths, and approximate review cost.',
    {
      diff: z.string().describe('Unified diff content to preflight before running a review'),
    },
    async ({ diff }) => {
      try {
        if (diff.trim().length === 0) {
          return mcpErrorResponse('INVALID_INPUT', 'diff must not be empty', {
            next_steps: [
              'Pass unified diff text in the diff field.',
              'Use review_quick or review_full with staged=true for staged git changes.',
            ],
          });
        }

        const complexity = estimateDiffComplexity(diff);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              complexity: complexity.level,
              files: complexity.fileCount,
              lines: { total: complexity.totalLines, added: complexity.addedLines, removed: complexity.removedLines },
              securitySensitive: complexity.securitySensitiveFiles,
              estimatedCost: complexity.estimatedReviewCost,
            }, null, 2),
          }],
        };
      } catch (err) {
        return mcpErrorResponse('DRY_RUN_FAILED', errorMessage(err));
      }
    },
  );
}

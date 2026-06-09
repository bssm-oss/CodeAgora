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
    'Use when you need a fast preflight for unified diff size, risk, and estimated review cost before running LLM reviewers. Returns JSON with complexity, file/line counts, security-sensitive files, and estimated cost. No repo_path: this tool only inspects the diff string passed in the request.',
    {
      diff: z.string().describe('Unified diff content'),
    },
    async ({ diff }) => {
      try {
        if (diff.trim().length === 0) {
          return mcpErrorResponse('INVALID_INPUT', 'diff must not be empty');
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

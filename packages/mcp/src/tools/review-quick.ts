/**
 * review_quick — L1-only fast review (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runQuickReview } from '../helpers.js';

export function registerReviewQuick(server: McpServer): void {
  server.tool(
    'review_quick',
    'Fast multi-LLM code review (L1 only, no debate). Returns structured issues with severity, confidence, and file locations.',
    {
      diff: z.string().describe('Unified diff content'),
      reviewer_count: z.number().optional().default(3).describe('Number of reviewers (default: 3)'),
    },
    async ({ diff, reviewer_count }) => {
      try {
        const result = await runQuickReview(diff, reviewer_count);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }], isError: true };
      }
    },
  );
}

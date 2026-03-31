/**
 * review_full — Full L0→L1→L2→L3 pipeline (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runFullReview } from '../helpers.js';

export function registerReviewFull(server: McpServer): void {
  server.tool(
    'review_full',
    'Full pipeline review with multi-model debate. Thorough consensus-based code review.',
    {
      diff: z.string().describe('Unified diff content'),
    },
    async ({ diff }) => {
      try {
        const result = await runFullReview(diff);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }], isError: true };
      }
    },
  );
}

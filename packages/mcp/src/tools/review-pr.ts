/**
 * review_pr — Fetch PR diff and run full review (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runFullReview } from '../helpers.js';

export function registerReviewPr(server: McpServer): void {
  server.tool(
    'review_pr',
    'Fetch a GitHub PR diff and run full multi-LLM code review.',
    {
      pr_url: z.string().describe('GitHub PR URL (e.g. https://github.com/owner/repo/pull/123)'),
    },
    async ({ pr_url }) => {
      // Fetch diff via gh CLI
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      try {
        const { stdout: diff } = await execFileAsync('gh', ['pr', 'diff', pr_url]);
        const result = await runFullReview(diff);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Failed to fetch PR: ${msg}` }) }], isError: true };
      }
    },
  );
}

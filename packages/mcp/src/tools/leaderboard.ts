/**
 * get_leaderboard — Model quality rankings (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getModelLeaderboard, formatLeaderboard } from '@codeagora/cli/commands/models.js';

export function registerLeaderboard(server: McpServer): void {
  server.tool(
    'get_leaderboard',
    'Show model performance leaderboard from Thompson Sampling data. No LLM calls.',
    {},
    async () => {
      try {
        const entries = await getModelLeaderboard();
        return { content: [{ type: 'text' as const, text: formatLeaderboard(entries) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}

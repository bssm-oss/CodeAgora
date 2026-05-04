/**
 * get_leaderboard — Model quality rankings (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getModelLeaderboard, formatLeaderboard } from '@codeagora/core/l0/leaderboard.js';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

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
        return mcpErrorResponse('LEADERBOARD_FAILED', errorMessage(err));
      }
    },
  );
}

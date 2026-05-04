/**
 * get_stats — Aggregate session statistics (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSessionStats, formatSessionStats } from '@codeagora/core/session/queries.js';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

export function registerStats(server: McpServer): void {
  server.tool(
    'get_stats',
    'Show aggregate review session statistics. No LLM calls.',
    {},
    async () => {
      try {
        const stats = await getSessionStats(process.cwd());
        return { content: [{ type: 'text' as const, text: formatSessionStats(stats) }] };
      } catch (err) {
        return mcpErrorResponse('STATS_FAILED', errorMessage(err));
      }
    },
  );
}

/**
 * get_stats — Aggregate session statistics (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSessionStats, formatSessionStats } from '@codeagora/core/session/queries.js';
import { errorMessage, mcpErrorResponse, resolveRepoPathOrError } from './shared-response.js';

export function registerStats(server: McpServer): void {
  server.tool(
    'get_stats',
    'Show aggregate review session statistics. No LLM calls.',
    {
      repo_path: z.string().optional().describe('Repo root path for session stats; must stay within the current repository boundary'),
    },
    async ({ repo_path }) => {
      try {
        const repoPath = await resolveRepoPathOrError(repo_path);
        if (!repoPath.ok) {
          return mcpErrorResponse(repoPath.error.code, repoPath.error.message, repoPath.error.details);
        }

        const stats = await getSessionStats(repoPath.repoPath ?? process.cwd());
        return { content: [{ type: 'text' as const, text: formatSessionStats(stats) }] };
      } catch (err) {
        return mcpErrorResponse('STATS_FAILED', errorMessage(err));
      }
    },
  );
}

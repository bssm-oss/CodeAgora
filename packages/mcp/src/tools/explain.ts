/**
 * explain_session — Session narrative explanation (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { explainSession } from '@codeagora/cli/commands/explain.js';
import { errorMessage, mcpErrorResponse, resolveRepoPathOrError } from './shared-response.js';

export function registerExplain(server: McpServer): void {
  server.tool(
    'explain_session',
    'Read session artifacts and produce a narrative summary of a past review. No LLM calls.',
    {
      session: z.string().describe('Session path (e.g. 2026-03-19/001)'),
      repo_path: z.string().optional().describe('Optional repo root override for session lookup. Omit it when the server already runs in the target workspace; otherwise pass the exact workspace root.'),
    },
    async ({ session, repo_path }) => {
      try {
        const repoPath = await resolveRepoPathOrError(repo_path);
        if (!repoPath.ok) {
          return mcpErrorResponse(repoPath.error.code, repoPath.error.message, repoPath.error.details);
        }

        const result = await explainSession(repoPath.repoPath ?? process.cwd(), session);
        return { content: [{ type: 'text' as const, text: result.narrative }] };
      } catch (err) {
        return mcpErrorResponse('EXPLAIN_SESSION_FAILED', errorMessage(err), { session });
      }
    },
  );
}

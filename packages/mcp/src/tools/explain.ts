/**
 * explain_session — Session narrative explanation (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { explainSession } from '@codeagora/cli/commands/explain.js';
import { errorMessage, mcpErrorResponse, resolveRepoPathOrError } from './shared-response.js';
import { REPO_PATH_DESCRIPTION } from './shared-schema.js';

export function registerExplain(server: McpServer): void {
  server.tool(
    'explain_session',
    'Explain a past CodeAgora review session from local artifacts. Use after review_quick/review_full or CLI runs when an IDE agent needs a narrative summary. No LLM calls.',
    {
      session: z.string().describe('Session path (e.g. 2026-03-19/001)'),
      repo_path: z.string().optional().describe(REPO_PATH_DESCRIPTION),
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

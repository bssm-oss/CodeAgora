/**
 * explain_session — Session narrative explanation (6.1)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { explainSession } from '@codeagora/cli/commands/explain.js';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

export function registerExplain(server: McpServer): void {
  server.tool(
    'explain_session',
    'Read session artifacts and produce a narrative summary of a past review. No LLM calls.',
    {
      session: z.string().describe('Session path (e.g. 2026-03-19/001)'),
    },
    async ({ session }) => {
      try {
        const result = await explainSession(process.cwd(), session);
        return { content: [{ type: 'text' as const, text: result.narrative }] };
      } catch (err) {
        return mcpErrorResponse('EXPLAIN_SESSION_FAILED', errorMessage(err), { session });
      }
    },
  );
}

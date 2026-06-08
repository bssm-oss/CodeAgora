/**
 * config_set — Update configuration values
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorMessage, mcpErrorResponse } from './shared-response.js';
import { resolveRepoPathOrError } from './shared-response.js';

export function registerConfigSet(server: McpServer): void {
  server.tool(
    'config_set',
    'Set a CodeAgora configuration value using dot-notation key. Validates against config schema.',
    {
      key: z.string().describe('Dot-notation key (e.g. "discussion.maxRounds")'),
      value: z.union([z.string(), z.number(), z.boolean()]).describe('Value to set'),
      repo_path: z.string().optional().describe('Optional repo root override for config mutation. Omit it when the server already runs in the target workspace; otherwise pass the exact workspace root.'),
    },
    async ({ key, value, repo_path }) => {
      try {
        const repoPath = await resolveRepoPathOrError(repo_path);
        if (!repoPath.ok) {
          return mcpErrorResponse(repoPath.error.code, repoPath.error.message, repoPath.error.details);
        }

        const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');
        await setConfigValue(repoPath.repoPath ?? process.cwd(), key, String(value));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'updated', key, value }) }],
        };
      } catch (err) {
        return mcpErrorResponse('CONFIG_SET_FAILED', errorMessage(err), { key });
      }
    },
  );
}

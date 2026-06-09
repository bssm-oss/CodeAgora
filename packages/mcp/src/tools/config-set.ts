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
    'Use when you need to update a CodeAgora setting from an MCP client without opening the config file manually. Returns JSON confirming the updated key and value after schema validation. repo_path: omit when the MCP server already runs in the target workspace; otherwise pass the exact workspace root.',
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

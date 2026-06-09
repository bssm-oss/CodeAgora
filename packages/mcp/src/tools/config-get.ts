/**
 * config_get — Read configuration values
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorMessage, mcpErrorResponse } from './shared-response.js';
import { resolveRepoPathOrError } from './shared-response.js';

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedKey(obj: Record<string, unknown>, dotKey: string): unknown {
  const parts = dotKey.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function registerConfigGet(server: McpServer): void {
  server.tool(
    'config_get',
    'Use when you need to inspect the active CodeAgora configuration before choosing reviewers or changing settings. Returns the full config as JSON, or one dot-notation key/value pair. repo_path: omit when the MCP server already runs in the target workspace; otherwise pass the exact workspace root.',
    {
      key: z.string().optional().describe('Dot-notation key (e.g. "discussion.maxRounds"). Omit for full config.'),
      repo_path: z.string().optional().describe('Optional repo root override for config lookup. Omit it when you are already inside the target workspace; otherwise pass the exact workspace root.'),
    },
    async ({ key, repo_path }) => {
      try {
        const repoPath = await resolveRepoPathOrError(repo_path);
        if (!repoPath.ok) {
          return mcpErrorResponse(repoPath.error.code, repoPath.error.message, repoPath.error.details);
        }

        const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
        const config = await loadConfigFrom(repoPath.repoPath ?? process.cwd());

        if (key) {
          const value = getNestedKey(config as unknown as Record<string, unknown>, key);
          if (value === undefined) {
            return mcpErrorResponse('CONFIG_GET_FAILED', `Key "${key}" not found in config`, { key, reason: 'missing-key' });
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ key, value }, null, 2) }] };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }] };
      } catch (err) {
        return mcpErrorResponse('CONFIG_GET_FAILED', errorMessage(err));
      }
    },
  );
}

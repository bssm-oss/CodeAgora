/**
 * config_get — Read configuration values
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorMessage, mcpErrorResponse } from './shared-response.js';
import { resolveRepoPathOrError } from './shared-response.js';
import { REPO_PATH_DESCRIPTION } from './shared-schema.js';

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
    'Read CodeAgora configuration for an IDE/agent. Use to inspect the full active config or one dot-notation key before running review tools.',
    {
      key: z.string().optional().describe('Dot-notation key (e.g. "discussion.maxRounds"). Omit for full config.'),
      repo_path: z.string().optional().describe(REPO_PATH_DESCRIPTION),
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
            return mcpErrorResponse('CONFIG_GET_FAILED', `Key "${key}" not found in config`, { key });
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

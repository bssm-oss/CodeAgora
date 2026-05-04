/**
 * config_get — Read configuration values
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

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
    'Read CodeAgora configuration. Returns full config or a specific value by dot-notation key.',
    {
      key: z.string().optional().describe('Dot-notation key (e.g. "discussion.maxRounds"). Omit for full config.'),
    },
    async ({ key }) => {
      try {
        const { loadConfig } = await import('@codeagora/core/config/loader.js');
        const config = await loadConfig();

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

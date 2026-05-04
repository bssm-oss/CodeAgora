/**
 * config_set — Update configuration values
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorMessage, mcpErrorResponse } from './shared-response.js';

export function registerConfigSet(server: McpServer): void {
  server.tool(
    'config_set',
    'Set a CodeAgora configuration value using dot-notation key. Validates against config schema.',
    {
      key: z.string().describe('Dot-notation key (e.g. "discussion.maxRounds")'),
      value: z.union([z.string(), z.number(), z.boolean()]).describe('Value to set'),
    },
    async ({ key, value }) => {
      try {
        const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');
        await setConfigValue(process.cwd(), key, String(value));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'updated', key, value }) }],
        };
      } catch (err) {
        return mcpErrorResponse('CONFIG_SET_FAILED', errorMessage(err), { key });
      }
    },
  );
}

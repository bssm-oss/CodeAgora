import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const serverEntry = path.resolve(packageRoot, 'dist/index.js');
const expectedToolNames = [
  'review_quick',
  'review_full',
  'review_pr',
  'dry_run',
  'explain_session',
  'get_leaderboard',
  'get_stats',
  'config_get',
  'config_set',
] as const;

const testWithBuiltServer = existsSync(serverEntry) ? it : it.skip;

describe('MCP stdio startup', () => {
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  testWithBuiltServer('advertises the expected tool list from dist/index.js', async () => {
    client = new Client(
      { name: 'mcp-stdio-regression', version: '1.0.0' },
      { capabilities: {} },
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      cwd: repoRoot,
    });

    await client.connect(transport);

    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual([...expectedToolNames].sort());
  });
});

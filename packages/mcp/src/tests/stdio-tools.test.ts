import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

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

const sampleDiff = [
  'diff --git a/a.ts b/a.ts',
  'new file mode 100644',
  'index 0000000..1111111',
  '--- /dev/null',
  '+++ b/a.ts',
  '@@ -0,0 +1 @@',
  '+const x = 1;',
  '',
].join('\n');

type ToolTextResult = {
  content?: Array<{ type?: string; text?: string }>;
};

describe('MCP stdio startup', () => {
  let client: Client | undefined;

  beforeAll(() => {
    execFileSync('pnpm', ['--filter', '@codeagora/mcp', 'build'], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' },
    });
  }, 30_000);

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  async function connectClient(): Promise<Client> {
    const nextClient = new Client(
      { name: 'mcp-stdio-regression', version: '1.0.0' },
      { capabilities: {} },
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      cwd: repoRoot,
    });

    await nextClient.connect(transport);
    client = nextClient;
    return nextClient;
  }

  it('advertises the expected tool list from dist/index.js', async () => {
    const connectedClient = await connectClient();

    const result = await connectedClient.listTools();
    const toolNames = result.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual([...expectedToolNames].sort());
  });

  it('runs dry_run through the dist stdio server', async () => {
    const connectedClient = await connectClient();

    const result = await connectedClient.callTool({
      name: 'dry_run',
      arguments: { diff: sampleDiff },
    }) as ToolTextResult;

    const text = result.content?.find((item) => item.type === 'text')?.text;
    expect(text).toBeDefined();

    const payload = JSON.parse(text!) as {
      files: number;
      lines: { total: number; added: number; removed: number };
      estimatedCost: string;
    };

    expect(payload.files).toBeGreaterThan(0);
    expect(payload.lines.added).toBe(1);
    expect(payload.estimatedCost).toMatch(/^~?\$[\d.]+$/);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { REQUIRED_MCP_TOOL_NAMES } from '../registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const packageRoot = path.join(repoRoot, 'packages/mcp');
const packageJsonPath = path.join(packageRoot, 'package.json');
const transcriptPath = path.join(repoRoot, '.sisyphus/evidence/mcp-sdk-stdio-tools-transcript.json');
const fixtureWorkspacePath = path.join(repoRoot, '.sisyphus/tmp/mcp-config-set-workspace');

type PackageJson = {
  bin?: Record<string, string>;
  version?: string;
};

type TranscriptMessage = {
  direction: 'client->server' | 'server->client';
  elapsedMs: number;
  message: JSONRPCMessage;
};

type TextContent = {
  type: 'text';
  text: string;
};

type ToolCallEvidence = {
  isError: boolean;
  payload: unknown;
  outcome: 'success' | 'structured_error';
};

type DryRunEvidence = ToolCallEvidence;

type ConfigGetEvidence = ToolCallEvidence;

type ConfigSetEvidence = ToolCallEvidence;

type ReviewQuickEvidence = ToolCallEvidence;

type ReviewFullEvidence = ToolCallEvidence;

type ReviewPrEvidence = ToolCallEvidence;

type ExplainSessionEvidence = ToolCallEvidence;

type LeaderboardEvidence = ToolCallEvidence;

type StatsEvidence = ToolCallEvidence;

function cloneMessage(message: JSONRPCMessage): JSONRPCMessage {
  return JSON.parse(JSON.stringify(message)) as JSONRPCMessage;
}

class RecordingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  readonly messages: TranscriptMessage[] = [];
  private readonly startedAt = Date.now();

  constructor(private readonly inner: StdioClientTransport) {}

  async start(): Promise<void> {
    this.inner.onclose = () => {
      this.onclose?.();
    };
    this.inner.onerror = (error) => {
      this.onerror?.(error);
    };
    this.inner.onmessage = (message) => {
      this.messages.push({
        direction: 'server->client',
        elapsedMs: Date.now() - this.startedAt,
        message: cloneMessage(message),
      });
      this.onmessage?.(message);
    };

    await this.inner.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.messages.push({
      direction: 'client->server',
      elapsedMs: Date.now() - this.startedAt,
      message: cloneMessage(message),
    });
    await this.inner.send(message);
  }

  async close(): Promise<void> {
    await this.inner.close();
  }
}

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
}

function getFirstTextContent(result: Awaited<ReturnType<Client['callTool']>>): TextContent {
  const content = (result as { content: unknown[] }).content;
  const firstContent = content[0] as TextContent | undefined;
  expect(firstContent?.type).toBe('text');
  expect(firstContent?.text).toEqual(expect.any(String));
  return firstContent as TextContent;
}

function resolvePackagedMcpCommand(): string {
  const pkg = readPackageJson();
  const binTarget = pkg.bin?.['codeagora-mcp'];
  if (!binTarget) {
    throw new Error('packages/mcp/package.json is missing the codeagora-mcp bin');
  }

  const commandPath = path.resolve(packageRoot, binTarget);
  if (!fs.existsSync(commandPath)) {
    throw new Error(`Build the MCP package before running startup smoke: missing ${commandPath}`);
  }
  return commandPath;
}

function writeFixtureConfig(): void {
  fs.rmSync(fixtureWorkspacePath, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureWorkspacePath, '.ca'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureWorkspacePath, '.ca/config.json'),
    `${JSON.stringify({
      mode: 'pragmatic',
      reviewers: [
        { id: 'r1', backend: 'api', provider: 'groq', model: 'test-model', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [
          { id: 's1', backend: 'api', provider: 'groq', model: 'test-model', timeout: 120, enabled: true },
        ],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', backend: 'api', provider: 'groq', model: 'test-model', timeout: 120, enabled: true },
        personaPool: ['.ca/personas/strict.md'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'api', provider: 'groq', model: 'test-model', timeout: 120 },
      head: { id: 'head', backend: 'api', provider: 'groq', model: 'test-model', timeout: 120, enabled: true },
      discussion: {
        enabled: true,
        maxRounds: 2,
        registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
        codeSnippetRange: 10,
        objectionTimeout: 60,
        maxObjectionRounds: 1,
      },
      errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
      autoApprove: { enabled: false },
      prompts: {},
      reviewContext: {},
    }, null, 2)}\n`,
    'utf-8',
  );
}

function parseToolJsonPayload(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const firstContent = getFirstTextContent(result);
  return JSON.parse(firstContent.text) as unknown;
}

function parseStructuredToolEvidence(
  result: Awaited<ReturnType<Client['callTool']>>,
  assertSuccess: (payload: unknown) => void,
): ToolCallEvidence {
  const payload = parseToolJsonPayload(result);
  if (result.isError === true) {
    expect(payload).toMatchObject({
      status: 'error',
      code: expect.any(String),
      message: expect.any(String),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  assertSuccess(payload);
  return { isError: false, payload, outcome: 'success' };
}

function parseConfigGetPayload(result: Awaited<ReturnType<Client['callTool']>>): ConfigGetEvidence {
  return parseStructuredToolEvidence(result, (payload) => {
    expect(payload).toEqual(expect.any(Object));
    expect(payload).not.toMatchObject({ status: 'error' });
  });
}

function parseConfigSetPayload(result: Awaited<ReturnType<Client['callTool']>>): ConfigSetEvidence {
  return parseStructuredToolEvidence(result, (payload) => {
    expect(payload).toMatchObject({
      status: 'updated',
      key: 'discussion.maxRounds',
      value: 3,
    });
  });
}

function parseDryRunPayload(result: Awaited<ReturnType<Client['callTool']>>): DryRunEvidence {
  return parseStructuredToolEvidence(result, (payload) => {
    expect(payload).toMatchObject({
      complexity: expect.any(String),
      files: expect.any(Number),
      lines: {
        total: expect.any(Number),
        added: expect.any(Number),
        removed: expect.any(Number),
      },
      securitySensitive: expect.any(Array),
      estimatedCost: expect.any(String),
    });
    expect(payload).not.toMatchObject({ status: 'error' });
  });
}

function parseReviewQuickPayload(result: Awaited<ReturnType<Client['callTool']>>): ReviewQuickEvidence {
  const payload = parseToolJsonPayload(result);
  if (result.isError === true) {
    expect(payload).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
      message: 'Either diff or staged=true is required',
      guidance: expect.arrayContaining([
        expect.stringContaining('Pass a unified diff'),
        expect.stringContaining('staged=true'),
      ]),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(payload).toMatchObject({
    decision: expect.any(String),
    reasoning: expect.any(String),
    issues: expect.any(Array),
    summary: expect.any(String),
  });
  expect(payload).not.toMatchObject({ status: 'error' });
  return { isError: false, payload, outcome: 'success' };
}

function parseReviewFullPayload(result: Awaited<ReturnType<Client['callTool']>>): ReviewFullEvidence {
  const payload = parseToolJsonPayload(result);
  if (result.isError === true) {
    expect(payload).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
      message: 'Either diff or staged=true is required',
      guidance: expect.arrayContaining([
        expect.stringContaining('Pass a unified diff'),
        expect.stringContaining('staged=true'),
      ]),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(payload).toMatchObject({
    decision: expect.any(String),
    reasoning: expect.any(String),
    issues: expect.any(Array),
    summary: expect.any(String),
  });
  expect(payload).not.toMatchObject({ status: 'error' });
  return { isError: false, payload, outcome: 'success' };
}

function parseReviewPrPayload(result: Awaited<ReturnType<Client['callTool']>>): ReviewPrEvidence {
  const payload = parseToolJsonPayload(result);
  if (result.isError === true) {
    expect(payload).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
      message: 'Either pr_url or pr_number is required',
      guidance: expect.arrayContaining([
        expect.stringContaining('Check the tool schema'),
      ]),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(payload).toMatchObject({
    decision: expect.any(String),
    reasoning: expect.any(String),
    issues: expect.any(Array),
    summary: expect.any(String),
  });
  expect(payload).not.toMatchObject({ status: 'error' });
  return { isError: false, payload, outcome: 'success' };
}

function parseExplainSessionPayload(result: Awaited<ReturnType<Client['callTool']>>): ExplainSessionEvidence {
  const firstContent = getFirstTextContent(result);

  if (result.isError === true) {
    const payload = JSON.parse(firstContent.text) as unknown;
    expect(payload).toMatchObject({
      status: 'error',
      code: expect.any(String),
      message: expect.any(String),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(firstContent.text).toEqual(expect.any(String));
  expect(firstContent.text.length).toBeGreaterThan(0);
  return {
    isError: false,
    payload: { narrative: firstContent.text },
    outcome: 'success',
  };
}

function parseLeaderboardPayload(result: Awaited<ReturnType<Client['callTool']>>): LeaderboardEvidence {
  const firstContent = getFirstTextContent(result);

  if (result.isError === true) {
    const payload = JSON.parse(firstContent.text) as unknown;
    expect(payload).toMatchObject({
      status: 'error',
      code: 'LEADERBOARD_FAILED',
      message: expect.any(String),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(firstContent.text).toEqual(expect.any(String));
  expect(firstContent.text.length).toBeGreaterThan(0);
  return {
    isError: false,
    payload: { text: firstContent.text },
    outcome: 'success',
  };
}

function parseStatsPayload(result: Awaited<ReturnType<Client['callTool']>>): StatsEvidence {
  const firstContent = getFirstTextContent(result);

  if (result.isError === true) {
    const payload = JSON.parse(firstContent.text) as unknown;
    expect(payload).toMatchObject({
      status: 'error',
      code: 'STATS_FAILED',
      message: expect.any(String),
    });
    return { isError: true, payload, outcome: 'structured_error' };
  }

  expect(firstContent.text).toEqual(expect.any(String));
  expect(firstContent.text).toContain('Total sessions:');
  return {
    isError: false,
    payload: { text: firstContent.text },
    outcome: 'success',
  };
}

function writeClientTranscript({
  configGet,
  configSet,
  commandPath,
  cwd,
  dryRun,
  explainSession,
  leaderboard,
  reviewQuick,
  reviewFull,
  reviewPr,
  stderr,
  status,
  stats,
  serverVersion,
  toolNames,
  transport,
}: {
  configGet?: ConfigGetEvidence;
  configSet?: ConfigSetEvidence;
  commandPath: string;
  cwd: string;
  dryRun?: DryRunEvidence;
  explainSession?: ExplainSessionEvidence;
  leaderboard?: LeaderboardEvidence;
  reviewQuick?: ReviewQuickEvidence;
  reviewFull?: ReviewFullEvidence;
  reviewPr?: ReviewPrEvidence;
  stderr: Buffer[];
  status: 'passed' | 'failed';
  stats?: StatsEvidence;
  serverVersion: ReturnType<Client['getServerVersion']>;
  toolNames: string[];
  transport: RecordingTransport;
}): void {
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      schemaVersion: 'codeagora.mcp-sdk-stdio-tools-transcript.v1',
      status,
      generatedAt: new Date().toISOString(),
      command: path.relative(repoRoot, commandPath),
      cwd: path.relative(repoRoot, cwd) || '.',
      client: {
        name: 'codeagora-mcp-stdio-startup-test',
        transport: 'StdioClientTransport',
        method: 'Client.listTools and Client.callTool',
      },
      serverVersion: serverVersion ?? null,
      toolCount: toolNames.length,
      toolNames,
      configGet: configGet ?? null,
      configSet: configSet ?? null,
      dryRun: dryRun ?? null,
      explainSession: explainSession ?? null,
      leaderboard: leaderboard ?? null,
      reviewQuick: reviewQuick ?? null,
      reviewFull: reviewFull ?? null,
      reviewPr: reviewPr ?? null,
      stats: stats ?? null,
      messages: transport.messages,
      stderr: Buffer.concat(stderr).toString('utf-8'),
    }, null, 2)}\n`,
  );
}

describe('MCP packaged stdio startup', () => {
  it('launches the package command, initializes, lists tools, and records an SDK client transcript', async () => {
    const commandPath = resolvePackagedMcpCommand();
    writeFixtureConfig();
    const stderr: Buffer[] = [];
    const stdioTransport = new StdioClientTransport({
      command: commandPath,
      args: [],
      cwd: fixtureWorkspacePath,
      stderr: 'pipe',
      env: {
        HOME: fixtureWorkspacePath,
        TMPDIR: fixtureWorkspacePath,
        XDG_CONFIG_HOME: fixtureWorkspacePath,
      },
    });
    stdioTransport.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    const transport = new RecordingTransport(stdioTransport);

    const client = new Client({
      name: 'codeagora-mcp-stdio-startup-test',
      version: '0.0.0',
    });
    let serverVersion: ReturnType<Client['getServerVersion']>;
    let toolNames: string[] = [];
    let configGet: ConfigGetEvidence | undefined;
    let configSet: ConfigSetEvidence | undefined;
    let dryRun: DryRunEvidence | undefined;
    let explainSession: ExplainSessionEvidence | undefined;
    let leaderboard: LeaderboardEvidence | undefined;
    let reviewQuick: ReviewQuickEvidence | undefined;
    let reviewFull: ReviewFullEvidence | undefined;
    let reviewPr: ReviewPrEvidence | undefined;
    let stats: StatsEvidence | undefined;

    try {
      await client.connect(transport, { timeout: 5_000 });

      serverVersion = client.getServerVersion();
      expect(serverVersion?.name).toBe('codeagora');
      expect(serverVersion?.version).toBe(readPackageJson().version);

      const tools = await client.listTools(undefined, { timeout: 5_000 });
      toolNames = tools.tools.map((tool) => tool.name);

      expect([...toolNames].sort()).toEqual([...REQUIRED_MCP_TOOL_NAMES].sort());
      expect(tools.tools).toHaveLength(REQUIRED_MCP_TOOL_NAMES.length);
      for (const tool of tools.tools) {
        expect(tool.description, `${tool.name} should expose a description`).toEqual(expect.any(String));
        expect((tool.description ?? '').length, `${tool.name} should expose a non-empty description`).toBeGreaterThan(0);
        expect(tool.inputSchema, `${tool.name} should expose an input schema`).toEqual(expect.any(Object));
      }

      const configGetResult = await client.callTool({ name: 'config_get', arguments: {} }, undefined, { timeout: 5_000 });
      configGet = parseConfigGetPayload(configGetResult);

      const configSetResult = await client.callTool(
        { name: 'config_set', arguments: { key: 'discussion.maxRounds', value: 3 } },
        undefined,
        { timeout: 5_000 },
      );
      configSet = parseConfigSetPayload(configSetResult);

      const dryRunResult = await client.callTool(
        {
          name: 'dry_run',
          arguments: {
            diff: [
              'diff --git a/src/index.ts b/src/index.ts',
              'index 1111111..2222222 100644',
              '--- a/src/index.ts',
              '+++ b/src/index.ts',
              '@@ -1,2 +1,3 @@',
              ' export const value = 1;',
              '+export const nextValue = value + 1;',
            ].join('\n'),
          },
        },
        undefined,
        { timeout: 5_000 },
      );
      dryRun = parseDryRunPayload(dryRunResult);

      const explainSessionResult = await client.callTool(
        { name: 'explain_session', arguments: { session: '2026-03-19/001' } },
        undefined,
        { timeout: 5_000 },
      );
      explainSession = parseExplainSessionPayload(explainSessionResult);

      const leaderboardResult = await client.callTool(
        { name: 'get_leaderboard', arguments: {} },
        undefined,
        { timeout: 5_000 },
      );
      leaderboard = parseLeaderboardPayload(leaderboardResult);

      const statsResult = await client.callTool(
        { name: 'get_stats', arguments: {} },
        undefined,
        { timeout: 5_000 },
      );
      stats = parseStatsPayload(statsResult);

      const reviewQuickResult = await client.callTool(
        { name: 'review_quick', arguments: {} },
        undefined,
        { timeout: 5_000 },
      );
      reviewQuick = parseReviewQuickPayload(reviewQuickResult);

      const reviewFullResult = await client.callTool(
        { name: 'review_full', arguments: {} },
        undefined,
        { timeout: 5_000 },
      );
      reviewFull = parseReviewFullPayload(reviewFullResult);

      const reviewPrResult = await client.callTool(
        { name: 'review_pr', arguments: {} },
        undefined,
        { timeout: 5_000 },
      );
      reviewPr = parseReviewPrPayload(reviewPrResult);

      writeClientTranscript({
        configGet,
        configSet,
        commandPath,
        cwd: fixtureWorkspacePath,
        dryRun,
        explainSession,
        leaderboard,
        reviewQuick,
        reviewFull,
        reviewPr,
        stderr,
        status: 'passed',
        stats,
        serverVersion,
        toolNames,
        transport,
      });
      expect(fs.existsSync(transcriptPath)).toBe(true);
      const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8')) as {
        configSet?: ConfigSetEvidence;
        dryRun?: DryRunEvidence;
        explainSession?: ExplainSessionEvidence;
        leaderboard?: LeaderboardEvidence;
        messages?: TranscriptMessage[];
        reviewQuick?: ReviewQuickEvidence;
        reviewFull?: ReviewFullEvidence;
        reviewPr?: ReviewPrEvidence;
        stats?: StatsEvidence;
        toolNames?: string[];
      };
      expect([...(transcript.toolNames ?? [])].sort()).toEqual([...REQUIRED_MCP_TOOL_NAMES].sort());
      expect(transcript.configSet?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.dryRun?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.explainSession?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.leaderboard?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.reviewQuick?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.reviewFull?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.reviewPr?.outcome).toMatch(/^(success|structured_error)$/);
      expect(transcript.stats?.outcome).toMatch(/^(success|structured_error)$/);
      if (transcript.dryRun?.outcome === 'success') {
        expect(transcript.dryRun.payload).toMatchObject({
          complexity: expect.any(String),
          files: expect.any(Number),
          lines: expect.objectContaining({
            added: expect.any(Number),
            removed: expect.any(Number),
          }),
          estimatedCost: expect.any(String),
        });
      }
      if (transcript.dryRun?.outcome === 'structured_error') {
        expect(transcript.dryRun.payload).toMatchObject({
          status: 'error',
          code: expect.stringMatching(/^(INVALID_INPUT|DRY_RUN_FAILED)$/),
          message: expect.any(String),
        });
      }
      if (transcript.explainSession?.outcome === 'success') {
        expect(transcript.explainSession.payload).toMatchObject({
          narrative: expect.any(String),
        });
      }
      if (transcript.explainSession?.outcome === 'structured_error') {
        expect(transcript.explainSession.payload).toMatchObject({
          status: 'error',
          code: expect.any(String),
          message: expect.any(String),
        });
      }
      if (transcript.leaderboard?.outcome === 'success') {
        expect(transcript.leaderboard.payload).toMatchObject({
          text: expect.any(String),
        });
      }
      if (transcript.leaderboard?.outcome === 'structured_error') {
        expect(transcript.leaderboard.payload).toMatchObject({
          status: 'error',
          code: 'LEADERBOARD_FAILED',
          message: expect.any(String),
        });
      }
      if (transcript.stats?.outcome === 'success') {
        expect(transcript.stats.payload).toMatchObject({
          text: expect.stringContaining('Total sessions:'),
        });
      }
      if (transcript.stats?.outcome === 'structured_error') {
        expect(transcript.stats.payload).toMatchObject({
          status: 'error',
          code: 'STATS_FAILED',
          message: expect.any(String),
        });
      }
      if (transcript.reviewQuick?.outcome === 'structured_error') {
        expect(transcript.reviewQuick.payload).toMatchObject({
          status: 'error',
          code: 'INVALID_INPUT',
          message: 'Either diff or staged=true is required',
        });
      }
      if (transcript.reviewFull?.outcome === 'structured_error') {
        expect(transcript.reviewFull.payload).toMatchObject({
          status: 'error',
          code: 'INVALID_INPUT',
          message: 'Either diff or staged=true is required',
        });
      }
      if (transcript.reviewPr?.outcome === 'structured_error') {
        expect(transcript.reviewPr.payload).toMatchObject({
          status: 'error',
          code: 'INVALID_INPUT',
          message: 'Either pr_url or pr_number is required',
        });
      }
      expect(transcript.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({ method: 'initialize' }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({ method: 'tools/list' }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'config_get' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'config_set' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'dry_run' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'explain_session' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'get_leaderboard' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'get_stats' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'review_quick' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'review_full' }),
            }),
          }),
          expect.objectContaining({
            direction: 'client->server',
            message: expect.objectContaining({
              method: 'tools/call',
              params: expect.objectContaining({ name: 'review_pr' }),
            }),
          }),
        ]),
      );
    } catch (error) {
      writeClientTranscript({
        configGet,
        configSet,
        commandPath,
        cwd: fixtureWorkspacePath,
        dryRun,
        explainSession,
        leaderboard,
        reviewQuick,
        reviewFull,
        reviewPr,
        stderr,
        status: 'failed',
        stats,
        serverVersion,
        toolNames,
        transport,
      });
      const stderrText = Buffer.concat(stderr).toString('utf-8');
      throw new Error(`MCP SDK stdio startup failed. stderr=${stderrText}`, { cause: error });
    } finally {
      await client.close();
    }
  });
});

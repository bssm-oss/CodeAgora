/**
 * CLI Commands Tests — init, doctor, providers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

vi.mock('@codeagora/shared/utils/cli-detect.js', () => ({
  detectCliBackends: vi.fn(),
}));

import { runInit, generateReviewIgnore } from '@codeagora/cli/commands/init.js';
import { runDoctor, formatDoctorReport } from '@codeagora/cli/commands/doctor.js';
import { listProviders, formatProviderList } from '@codeagora/cli/commands/providers.js';
import { parseCredentialInput, detectProviderFromKey } from '@codeagora/cli/utils/inline-setup.js';
import { buildDefaultConfig } from '@codeagora/core/config/loader.js';
import { detectCliBackends, type DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import type { Config } from '@codeagora/core/types/config.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const mockDetectCliBackends = vi.mocked(detectCliBackends);

const API_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENCODE_API_KEY',
  'GROQ_API_KEY',
];

const CLI_FIXTURE: DetectedCli[] = [
  { backend: 'antigravity', bin: 'agy', available: false },
  { backend: 'claude', bin: 'claude', available: false },
  { backend: 'codex', bin: 'codex', available: false },
  { backend: 'copilot', bin: 'copilot', available: false },
  { backend: 'cursor', bin: 'agent', available: false },
  { backend: 'gemini', bin: 'gemini', available: false },
  { backend: 'opencode', bin: 'opencode', available: false },
  { backend: 'pi', bin: 'pi', available: false },
];

async function writeConfig(baseDir: string, config: Config): Promise<void> {
  const caDir = path.join(baseDir, '.ca');
  await fs.mkdir(caDir, { recursive: true });
  await fs.writeFile(path.join(caDir, 'config.json'), JSON.stringify(config, null, 2));
}

// ============================================================================
// init
// ============================================================================

describe('generateReviewIgnore()', () => {
  it('includes node_modules/', () => {
    expect(generateReviewIgnore()).toContain('node_modules/');
  });

  it('includes dist/', () => {
    expect(generateReviewIgnore()).toContain('dist/');
  });

  it('includes .git/', () => {
    expect(generateReviewIgnore()).toContain('.git/');
  });

  it('includes *.lock', () => {
    expect(generateReviewIgnore()).toContain('*.lock');
  });

  it('includes package-lock.json', () => {
    expect(generateReviewIgnore()).toContain('package-lock.json');
  });
});

describe('runInit()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .ca/ directory and config.json', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.ca', 'config.json'));
    const stat = await fs.stat(path.join(tmpDir, '.ca'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates .reviewignore', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.reviewignore'));
    const content = await fs.readFile(path.join(tmpDir, '.reviewignore'), 'utf-8');
    expect(content).toContain('node_modules/');
  });

  it('creates config.yaml when format is yaml', async () => {
    const result = await runInit({ format: 'yaml', force: false, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.ca', 'config.yaml'));
    const content = await fs.readFile(path.join(tmpDir, '.ca', 'config.yaml'), 'utf-8');
    expect(content).toBeTruthy();
  });

  it('skips existing files when force is false', async () => {
    // Create files first
    await runInit({ format: 'json', force: false, baseDir: tmpDir });
    // Run again — should skip
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.skipped).toContain(path.join(tmpDir, '.ca', 'config.json'));
    expect(result.skipped).toContain(path.join(tmpDir, '.reviewignore'));
    expect(result.created).toHaveLength(0);
  });

  it('overwrites existing files when force is true', async () => {
    await runInit({ format: 'json', force: false, baseDir: tmpDir });
    const result = await runInit({ format: 'json', force: true, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.ca', 'config.json'));
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty warnings on normal init', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// doctor
// ============================================================================

describe('runDoctor()', () => {
  let tmpDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-doctor-'));
    savedEnv = {};
    for (const envVar of API_ENV_VARS) {
      savedEnv[envVar] = process.env[envVar];
      delete process.env[envVar];
    }
    mockDetectCliBackends.mockResolvedValue(CLI_FIXTURE);
  });

  afterEach(async () => {
    for (const envVar of API_ENV_VARS) {
      if (savedEnv[envVar] === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = savedEnv[envVar];
      }
    }
    vi.clearAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns a DoctorResult with checks array and summary', async () => {
    const result = await runDoctor(tmpDir);
    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.summary).toHaveProperty('pass');
    expect(result.summary).toHaveProperty('fail');
    expect(result.summary).toHaveProperty('warn');
  });

  it('includes a Node.js version check', async () => {
    const result = await runDoctor(tmpDir);
    const nodeCheck = result.checks.find((c) => c.name === 'Node.js version');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass'); // running on Node 18+
  });

  it('reports missing .ca/ directory as warn when dir does not exist', async () => {
    const result = await runDoctor(tmpDir);
    const caCheck = result.checks.find((c) => c.name === '.ca/ directory');
    expect(caCheck).toBeDefined();
    expect(caCheck!.status).toBe('fail');
  });

  it('reports .ca/ directory as pass when it exists', async () => {
    await fs.mkdir(path.join(tmpDir, '.ca'), { recursive: true });
    const result = await runDoctor(tmpDir);
    const caCheck = result.checks.find((c) => c.name === '.ca/ directory');
    expect(caCheck!.status).toBe('pass');
  });

  it('reports missing config file as fail', async () => {
    const result = await runDoctor(tmpDir);
    const configCheck = result.checks.find((c) => c.name === 'Config file');
    expect(configCheck).toBeDefined();
    expect(configCheck!.status).toBe('fail');
  });

  it('reports config as pass when valid config.json exists', async () => {
    // Create valid config
    await runInit({ format: 'json', force: false, baseDir: tmpDir });
    const result = await runDoctor(tmpDir);
    const configCheck = result.checks.find((c) => c.name === 'Config file');
    expect(configCheck!.status).toBe('pass');
  });

  it('summary counts match checks array', async () => {
    const result = await runDoctor(tmpDir);
    const pass = result.checks.filter((c) => c.status === 'pass').length;
    const fail = result.checks.filter((c) => c.status === 'fail').length;
    const warn = result.checks.filter((c) => c.status === 'warn').length;
    expect(result.summary.pass).toBe(pass);
    expect(result.summary.fail).toBe(fail);
    expect(result.summary.warn).toBe(warn);
  });

  it('reports only API keys required by the active config as blocking', async () => {
    await writeConfig(tmpDir, buildDefaultConfig('openrouter'));

    const result = await runDoctor(tmpDir);
    const configuredApi = result.checks.find((c) => c.name === 'Configured API credentials');
    const unrelatedEnvChecks = result.checks.filter((c) => c.name.endsWith('_API_KEY'));

    expect(configuredApi?.status).toBe('fail');
    expect(configuredApi?.message).toContain('OPENROUTER_API_KEY for openrouter');
    expect(configuredApi?.message).not.toContain('GROQ_API_KEY');
    expect(unrelatedEnvChecks).toHaveLength(0);
  });

  it('deduplicates shared API env vars in availability summary', async () => {
    process.env['OPENCODE_API_KEY'] = 'test-key';
    await writeConfig(tmpDir, buildDefaultConfig('opencode-zen'));

    const result = await runDoctor(tmpDir);
    const configuredApi = result.checks.find((c) => c.name === 'Configured API credentials');
    const availableApi = result.checks.find((c) => c.name === 'Available API keys');

    expect(configuredApi?.status).toBe('pass');
    expect(availableApi?.status).toBe('pass');
    expect(availableApi?.message).toContain('opencode-go');
    expect(availableApi?.message).toContain('opencode-zen');
    expect(availableApi?.message.match(/OPENCODE_API_KEY/g)).toHaveLength(1);
  });

  it('reports missing CLI backends required by config without warning for every CLI', async () => {
    const cliConfig: Config = {
      ...buildDefaultConfig('groq'),
      reviewers: [
        { id: 'r1', model: 'opus', backend: 'claude', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'opus', backend: 'claude', timeout: 120, enabled: true }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'opus', backend: 'claude', timeout: 120, enabled: true },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'claude', model: 'opus', timeout: 120 },
      head: { backend: 'claude', model: 'opus', timeout: 120, enabled: true },
    };
    await writeConfig(tmpDir, cliConfig);

    const result = await runDoctor(tmpDir);
    const configuredCli = result.checks.find((c) => c.name === 'Configured CLI backends');
    const perCliChecks = result.checks.filter((c) => c.name.startsWith('CLI: '));

    expect(configuredCli?.status).toBe('fail');
    expect(configuredCli?.message).toContain('claude (claude)');
    expect(perCliChecks).toHaveLength(0);
  });

  it('passes CLI config when the configured backend is available', async () => {
    mockDetectCliBackends.mockResolvedValue(
      CLI_FIXTURE.map((cli) => (
        cli.backend === 'claude'
          ? { ...cli, available: true, path: '/usr/local/bin/claude' }
          : cli
      )),
    );
    const cliConfig: Config = {
      ...buildDefaultConfig('groq'),
      reviewers: [
        { id: 'r1', model: 'opus', backend: 'claude', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'opus', backend: 'claude', timeout: 120, enabled: true }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'opus', backend: 'claude', timeout: 120, enabled: true },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'claude', model: 'opus', timeout: 120 },
      head: { backend: 'claude', model: 'opus', timeout: 120, enabled: true },
    };
    await writeConfig(tmpDir, cliConfig);

    const result = await runDoctor(tmpDir);
    const configuredCli = result.checks.find((c) => c.name === 'Configured CLI backends');
    const reviewBackend = result.checks.find((c) => c.name === 'Review backend');

    expect(configuredCli?.status).toBe('pass');
    expect(reviewBackend?.status).toBe('pass');
    expect(reviewBackend?.message).toContain('CLI');
  });
});

describe('formatDoctorReport()', () => {
  it('uses ✓ for pass checks', () => {
    const result = {
      checks: [{ name: 'test', status: 'pass' as const, message: 'All good' }],
      summary: { pass: 1, fail: 0, warn: 0 },
    };
    expect(stripAnsi(formatDoctorReport(result))).toContain('✓ All good');
  });

  it('uses ✗ for fail checks', () => {
    const result = {
      checks: [{ name: 'test', status: 'fail' as const, message: 'Something broke' }],
      summary: { pass: 0, fail: 1, warn: 0 },
    };
    expect(stripAnsi(formatDoctorReport(result))).toContain('✗ Something broke');
  });

  it('uses ! for warn checks', () => {
    const result = {
      checks: [{ name: 'test', status: 'warn' as const, message: 'Minor issue' }],
      summary: { pass: 0, fail: 0, warn: 1 },
    };
    expect(stripAnsi(formatDoctorReport(result))).toContain('! Minor issue');
  });

  it('includes summary line', () => {
    const result = {
      checks: [
        { name: 'a', status: 'pass' as const, message: 'ok' },
        { name: 'b', status: 'fail' as const, message: 'nope' },
        { name: 'c', status: 'warn' as const, message: 'hmm' },
      ],
      summary: { pass: 1, fail: 1, warn: 1 },
    };
    const report = stripAnsi(formatDoctorReport(result));
    expect(report).toContain('1 passed');
    expect(report).toContain('1 failed');
    expect(report).toContain('1 warnings');
  });

  it('groups checks and adds next steps', () => {
    const result = {
      checks: [
        { name: '.ca/ directory', status: 'fail' as const, message: '.ca/ directory missing — run \'agora init\' to set up' },
        { name: 'GROQ_API_KEY', status: 'warn' as const, message: 'GROQ_API_KEY: missing' },
        { name: 'Node.js version', status: 'pass' as const, message: 'Node.js v22.0.0' },
      ],
      summary: { pass: 1, fail: 1, warn: 1 },
    };

    const report = stripAnsi(formatDoctorReport(result));
    expect(report).toContain('Blocking issues (1)');
    expect(report).toContain('Warnings (1)');
    expect(report).toContain('Ready checks (1)');
    expect(report).toContain('Next steps');
    expect(report).toContain('agora init');
  });

  it('adds API next step for API availability warnings', () => {
    const result = {
      checks: [
        { name: 'Available API keys', status: 'warn' as const, message: 'No API keys found. Set one of: GROQ_API_KEY' },
        { name: 'Available CLI backends', status: 'pass' as const, message: 'CLI backends found: claude (claude)' },
      ],
      summary: { pass: 1, fail: 0, warn: 1 },
    };

    const report = stripAnsi(formatDoctorReport(result));
    expect(report).toContain('agora env set openrouter <api-key>');
    expect(report).toContain('agora doctor --live');
  });
});

// ============================================================================
// inline setup helpers
// ============================================================================

describe('inline setup credential parsing', () => {
  it('detects common provider key prefixes', () => {
    expect(detectProviderFromKey('gsk_test')).toBe('groq');
    expect(detectProviderFromKey('sk-ant-test')).toBe('anthropic');
    expect(detectProviderFromKey('sk-or-test')).toBe('openrouter');
    expect(detectProviderFromKey('sk-test')).toBe('openai');
    expect(detectProviderFromKey('oc_test')).toBe('opencode-go');
    expect(detectProviderFromKey('plain-secret')).toBe('unknown');
  });

  it('accepts ENV_VAR=value credential input', () => {
    expect(parseCredentialInput('OPENROUTER_API_KEY=sk-or-test', 'groq')).toEqual({
      provider: 'openrouter',
      envVar: 'OPENROUTER_API_KEY',
      key: 'sk-or-test',
    });
  });

  it('uses selected provider for unknown raw keys', () => {
    expect(parseCredentialInput('plain-secret', 'opencode-zen')).toEqual({
      provider: 'opencode-zen',
      envVar: 'OPENCODE_API_KEY',
      key: 'plain-secret',
    });
  });

  it('accepts human provider names and numeric choices for unknown raw keys', () => {
    expect(parseCredentialInput('plain-secret', 'OpenCode Zen').provider).toBe('opencode-zen');
    expect(parseCredentialInput('plain-secret', '2').provider).toBe('openrouter');
  });

  it('uses selected OpenCode variant when OPENCODE_API_KEY is pasted', () => {
    expect(parseCredentialInput('OPENCODE_API_KEY=oc_test', 'opencode-zen')).toEqual({
      provider: 'opencode-zen',
      envVar: 'OPENCODE_API_KEY',
      key: 'oc_test',
    });
  });
});

// ============================================================================
// providers
// ============================================================================

describe('listProviders()', () => {
  it('returns the retained API provider set', () => {
    const providers = listProviders();
    expect(providers.map((p) => p.name).sort()).toEqual([
      'anthropic',
      'groq',
      'openai',
      'opencode-go',
      'opencode-zen',
      'openrouter',
    ]);
  });

  it('each entry has name, apiKeyEnvVar, apiKeySet', () => {
    const providers = listProviders();
    for (const p of providers) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.apiKeyEnvVar).toBe('string');
      expect(typeof p.apiKeySet).toBe('boolean');
    }
  });

  it('includes groq with GROQ_API_KEY', () => {
    const providers = listProviders();
    const groq = providers.find((p) => p.name === 'groq');
    expect(groq).toBeDefined();
    expect(groq!.apiKeyEnvVar).toBe('GROQ_API_KEY');
  });

  it('includes OpenCode providers with OPENCODE_API_KEY', () => {
    const providers = listProviders();
    const opencodeGo = providers.find((p) => p.name === 'opencode-go');
    const opencodeZen = providers.find((p) => p.name === 'opencode-zen');
    expect(opencodeGo).toBeDefined();
    expect(opencodeZen).toBeDefined();
    expect(opencodeGo!.apiKeyEnvVar).toBe('OPENCODE_API_KEY');
    expect(opencodeZen!.apiKeyEnvVar).toBe('OPENCODE_API_KEY');
  });

  it('apiKeySet is true when env var is present', () => {
    const original = process.env['GROQ_API_KEY'];
    process.env['GROQ_API_KEY'] = 'test-key';
    try {
      const providers = listProviders();
      const groq = providers.find((p) => p.name === 'groq');
      expect(groq!.apiKeySet).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env['GROQ_API_KEY'];
      } else {
        process.env['GROQ_API_KEY'] = original;
      }
    }
  });

  it('apiKeySet is false when env var is absent', () => {
    const original = process.env['GROQ_API_KEY'];
    delete process.env['GROQ_API_KEY'];
    try {
      const providers = listProviders();
      const groq = providers.find((p) => p.name === 'groq');
      expect(groq!.apiKeySet).toBe(false);
    } finally {
      if (original !== undefined) {
        process.env['GROQ_API_KEY'] = original;
      }
    }
  });
});

describe('formatProviderList()', () => {
  it('includes header row', () => {
    const providers = listProviders();
    const output = formatProviderList(providers);
    expect(output).toContain('Provider');
    expect(output).toContain('API Key');
    expect(output).toContain('Status');
  });

  it('includes a divider line', () => {
    const providers = listProviders();
    const output = formatProviderList(providers);
    expect(output).toContain('\u2500');
  });

  it('shows "available" for a provider with API key set', () => {
    const providers: import('@codeagora/cli/commands/providers.js').ProviderInfo[] = [
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: true, tier: 1 },
    ];
    expect(formatProviderList(providers)).toContain('available');
  });

  it('shows "no key" for a provider without API key', () => {
    const providers: import('@codeagora/cli/commands/providers.js').ProviderInfo[] = [
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: false, tier: 1 },
    ];
    expect(formatProviderList(providers)).toContain('no key');
  });

  it('shows ✓ for providers with key and ✗ for those without', () => {
    const providers: import('@codeagora/cli/commands/providers.js').ProviderInfo[] = [
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: true, tier: 1 },
      { name: 'opencode-go', apiKeyEnvVar: 'OPENCODE_API_KEY', apiKeySet: false, tier: 2 },
    ];
    const output = formatProviderList(providers);
    expect(output).toContain('\u2713 GROQ_API_KEY');
    expect(output).toContain('\u2717 OPENCODE_API_KEY');
  });
});

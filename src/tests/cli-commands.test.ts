/**
 * CLI Commands Tests — init, doctor, providers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import { runInit, generateReviewIgnore } from '@codeagora/cli/commands/init.js';
import { runDoctor, formatDoctorReport } from '@codeagora/cli/commands/doctor.js';
import { listProviders, formatProviderList } from '@codeagora/cli/commands/providers.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

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

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-doctor-'));
  });

  afterEach(async () => {
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
    expect(caCheck!.status).toBe('warn');
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
});

// ============================================================================
// providers
// ============================================================================

describe('listProviders()', () => {
  it('returns 15 providers', () => {
    const providers = listProviders();
    expect(providers).toHaveLength(15);
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

  it('includes google with GOOGLE_API_KEY', () => {
    const providers = listProviders();
    const google = providers.find((p) => p.name === 'google');
    expect(google).toBeDefined();
    expect(google!.apiKeyEnvVar).toBe('GOOGLE_API_KEY');
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
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: true },
    ];
    expect(formatProviderList(providers)).toContain('available');
  });

  it('shows "no key" for a provider without API key', () => {
    const providers: import('@codeagora/cli/commands/providers.js').ProviderInfo[] = [
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: false },
    ];
    expect(formatProviderList(providers)).toContain('no key');
  });

  it('shows ✓ for providers with key and ✗ for those without', () => {
    const providers: import('@codeagora/cli/commands/providers.js').ProviderInfo[] = [
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: true },
      { name: 'google', apiKeyEnvVar: 'GOOGLE_API_KEY', apiKeySet: false },
    ];
    const output = formatProviderList(providers);
    expect(output).toContain('\u2713 GROQ_API_KEY');
    expect(output).toContain('\u2717 GOOGLE_API_KEY');
  });
});

/**
 * Tests for packages/cli/src/commands/status.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import { getStatus } from '@codeagora/cli/commands/status.js';

// ============================================================================
// Helpers
// ============================================================================

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function makeDir(base: string, ...segments: string[]): Promise<string> {
  const full = path.join(base, ...segments);
  await fs.mkdir(full, { recursive: true });
  return full;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================================
// Setup
// ============================================================================

let tmpDir: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-status-test-'));
  // Save and clear all provider env vars so tests are isolated
  savedEnv = {};
  const providerVars = [
    'GROQ_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY', 'MISTRAL_API_KEY', 'NVIDIA_API_KEY', 'CEREBRAS_API_KEY',
    'TOGETHER_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY',
    'ZAI_API_KEY', 'GITHUB_TOKEN', 'GITHUB_COPILOT_TOKEN', 'FIREWORKS_API_KEY',
    'COHERE_API_KEY', 'DEEPINFRA_API_KEY', 'MOONSHOT_API_KEY', 'PERPLEXITY_API_KEY',
    'HUGGINGFACE_API_KEY', 'BASETEN_API_KEY', 'SILICONFLOW_API_KEY', 'NOVITA_API_KEY',
  ];
  for (const v of providerVars) {
    savedEnv[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  // Restore env vars
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('getStatus()', () => {
  describe('title and structure', () => {
    it('always outputs a title line', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      // The title is from i18n key cli.status.title - just ensure there's content
      expect(output.length).toBeGreaterThan(0);
    });

    it('outputs a separator line of dashes', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('─'.repeat(40));
    });

    it('outputs a config section header', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      // The config section contains "Config" or the i18n equivalent
      const lines = output.split('\n');
      expect(lines.length).toBeGreaterThan(2);
    });
  });

  describe('config section', () => {
    it('shows "Not found" when no config exists', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('✗');
      expect(output).toContain('Not found');
    });

    it('shows config found when config.json exists', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'config.json'), { language: 'en', reviewers: [] });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('✓');
      expect(output).toContain('config.json');
    });

    it('shows language from config', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'config.json'), { language: 'ko', reviewers: [] });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('ko');
    });

    it('shows config.yaml when yaml config exists', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await makeDir(caDir);
      await fs.writeFile(path.join(caDir, 'config.yaml'), 'language: en\n', 'utf-8');

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('config.yaml');
    });

    it('prefers config.json over config.yaml when both exist', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'config.json'), { language: 'en', reviewers: [] });
      await fs.writeFile(path.join(caDir, 'config.yaml'), 'language: ko\n', 'utf-8');

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('config.json');
      expect(output).not.toContain('config.yaml');
    });

    it('shows declarative mode when reviewers has count field', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'config.json'), {
        language: 'en',
        reviewers: { count: 3, providers: ['groq'] },
      });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('declarative');
    });

    it('shows explicit mode when reviewers is an array', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'config.json'), {
        language: 'en',
        reviewers: [{ id: 'r1', provider: 'groq', model: 'm', backend: 'api' }],
      });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('explicit');
    });
  });

  describe('providers section', () => {
    it('shows 0 providers when no API keys set', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('0 with API keys');
    });

    it('shows provider count when keys are set', async () => {
      process.env['GROQ_API_KEY'] = 'test-key';

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('1 with API keys');
      expect(output).toContain('groq');
    });

    it('shows multiple providers when multiple keys are set', async () => {
      process.env['GROQ_API_KEY'] = 'key1';
      process.env['OPENAI_API_KEY'] = 'key2';

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('2 with API keys');
      expect(output).toContain('groq');
      expect(output).toContain('openai');
    });
  });

  describe('sessions section', () => {
    it('shows "no sessions" when sessions dir does not exist', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      // The i18n key is cli.status.noSessions
      const lines = output.split('\n');
      const sessionLines = lines.filter(l => l.toLowerCase().includes('session') || l.includes('No'));
      expect(sessionLines.length).toBeGreaterThan(0);
    });

    it('shows session count when sessions exist', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      const dateDir = path.join(sessionsDir, '2026-04-01');
      const sessionDir = path.join(dateDir, 'abc123');
      await fs.mkdir(sessionDir, { recursive: true });
      await writeJson(path.join(sessionDir, 'metadata.json'), {
        sessionId: 'abc123',
        status: 'completed',
      });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('Total: 1');
    });

    it('shows last review date when sessions exist', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      const dateDir = path.join(sessionsDir, '2026-04-01');
      const sessionDir = path.join(dateDir, 'abc123');
      await fs.mkdir(sessionDir, { recursive: true });
      await writeJson(path.join(sessionDir, 'metadata.json'), {
        sessionId: 'abc123',
        status: 'completed',
      });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('2026-04-01');
    });

    it('shows verdict from last session when head-verdict.json exists', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      const dateDir = path.join(sessionsDir, '2026-04-01');
      const sessionDir = path.join(dateDir, 'abc123');
      await fs.mkdir(sessionDir, { recursive: true });
      await writeJson(path.join(sessionDir, 'head-verdict.json'), { decision: 'ACCEPT' });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('ACCEPT');
    });

    it('counts sessions across multiple date directories', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      for (const date of ['2026-04-01', '2026-04-02']) {
        const sessionDir = path.join(sessionsDir, date, `session-${date}`);
        await fs.mkdir(sessionDir, { recursive: true });
        await writeJson(path.join(sessionDir, 'metadata.json'), { sessionId: `s-${date}` });
      }

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('Total: 2');
    });

    it('shows most recent date first (latest date in Last Review)', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      for (const date of ['2026-04-01', '2026-04-10']) {
        const sessionDir = path.join(sessionsDir, date, `sess-${date}`);
        await fs.mkdir(sessionDir, { recursive: true });
        await writeJson(path.join(sessionDir, 'metadata.json'), { sessionId: `s-${date}` });
      }

      const output = stripAnsi(await getStatus(tmpDir));
      // Last review should be the most recent date
      expect(output).toContain('2026-04-10');
    });
  });

  describe('model quality section', () => {
    it('shows top 3 models from model-quality.json', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'model-quality.json'), {
        arms: {
          'groq/llama-3': { alpha: 9, beta: 1 },
          'openai/gpt-4o': { alpha: 8, beta: 2 },
          'anthropic/claude-3': { alpha: 7, beta: 3 },
          'google/gemini': { alpha: 1, beta: 9 },
        },
      });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('Models (top 3)');
      expect(output).toContain('groq/llama-3');
      expect(output).toContain('openai/gpt-4o');
      expect(output).toContain('anthropic/claude-3');
      // worst model should be excluded
      expect(output).not.toContain('google/gemini');
    });

    it('shows win rate percentages for models', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'model-quality.json'), {
        arms: {
          'model-a': { alpha: 9, beta: 1 },
        },
      });

      const output = stripAnsi(await getStatus(tmpDir));
      // 9/(9+1) = 90%
      expect(output).toContain('90.0%');
    });

    it('skips model section when model-quality.json does not exist', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).not.toContain('Models (top 3)');
    });

    it('skips model section when arms is missing from model-quality.json', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await writeJson(path.join(caDir, 'model-quality.json'), { version: 1 });

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).not.toContain('Models (top 3)');
    });
  });

  describe('disk usage section', () => {
    it('shows disk usage when sessions have content', async () => {
      const sessionsDir = path.join(tmpDir, '.ca', 'sessions');
      const dateDir = path.join(sessionsDir, '2026-04-01');
      const sessionDir = path.join(dateDir, 'abc123');
      await fs.mkdir(sessionDir, { recursive: true });
      // Write a file with known content to generate non-zero size
      await fs.writeFile(path.join(sessionDir, 'data.json'), 'x'.repeat(1024), 'utf-8');

      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).toContain('Disk');
      expect(output).toContain('Sessions:');
    });

    it('skips disk section when sessions dir is empty or missing', async () => {
      const output = stripAnsi(await getStatus(tmpDir));
      expect(output).not.toContain('Disk');
    });
  });

  describe('empty base dir', () => {
    it('handles empty base dir gracefully without throwing', async () => {
      await expect(getStatus(tmpDir)).resolves.toBeTruthy();
    });

    it('returns a string when .ca directory does not exist', async () => {
      const output = await getStatus(tmpDir);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });
});

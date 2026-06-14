/**
 * Tests for register-init command behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../commands/register-init.js';
import * as init from '../commands/init.js';
import { validateConfig } from '@codeagora/core/types/config.js';

describe('registerInitCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes runInit directly when --preset is provided', async () => {
    const runInit = vi.spyOn(init, 'runInit').mockResolvedValue({
      created: ['/tmp/.ca/config.json'],
      skipped: [],
      warnings: [],
    });
    const runInitInteractive = vi.spyOn(init, 'runInitInteractive').mockResolvedValue({
      created: [],
      skipped: [],
      warnings: [],
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerInitCommand(program);

    await program.parseAsync(['node', 'agora', 'init', '--preset', 'budget', '--yes']);

    expect(runInit).toHaveBeenCalledOnce();
    expect(runInit).toHaveBeenCalledWith({
      format: 'json',
      force: false,
      baseDir: process.cwd(),
      ci: false,
      preset: 'budget',
    });
    expect(runInitInteractive).not.toHaveBeenCalled();
  });

  it('prints gh secret guidance when action preset creates a workflow', async () => {
    vi.spyOn(init, 'runInit').mockResolvedValue({
      created: ['/tmp/.ca/config.json', '/tmp/.github/workflows/codeagora-review.yml'],
      skipped: [],
      warnings: [],
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message ?? ''));
    });

    const program = new Command();
    registerInitCommand(program);

    await program.parseAsync(['node', 'agora', 'init', '--preset', 'action', '--ci', '--yes']);

    const output = logs.join('\n');
    expect(output).toContain('Created: .github/workflows/codeagora-review.yml');
    expect(output).toContain('OPENROUTER_API_KEY');
    expect(output).toContain('gh secret set OPENROUTER_API_KEY');
  });

  it('builds schema-valid generated groq config for non-interactive init paths', () => {
    const generated = init.buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    });

    expect(() => validateConfig(generated)).not.toThrow();
  });

  it('exits with code 1 when runInit rejects', async () => {
    vi.spyOn(init, 'runInit').mockRejectedValue(new Error('Unknown preset "x"'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const program = new Command();
    registerInitCommand(program);

    await expect(
      program.parseAsync(['node', 'agora', 'init', '--preset', 'x', '--yes']),
    ).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

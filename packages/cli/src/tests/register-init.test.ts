/**
 * Tests for register-init command behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../commands/register-init.js';
import * as init from '../commands/init.js';

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

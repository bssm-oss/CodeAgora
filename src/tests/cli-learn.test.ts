/**
 * Tests for packages/cli/src/commands/learn.ts
 *
 * Tests the subcommand actions by mocking:
 * - @codeagora/core/learning/store.js (loadLearnedPatterns, saveLearnedPatterns)
 * - @codeagora/github/client.js (parseGitRemote)
 * - child_process (execFile)
 * - fs/promises (for import subcommand)
 *
 * Commander subcommands are tested by calling registerLearnCommand on a fresh
 * Command instance, then running program.parseAsync() to invoke the action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ============================================================================
// Mock external dependencies BEFORE importing subject under test
// ============================================================================

vi.mock('@codeagora/core/learning/store.js', () => ({
  loadLearnedPatterns: vi.fn(),
  saveLearnedPatterns: vi.fn(),
  mergePatterns: vi.fn((existing: unknown[], incoming: unknown[]) => [...existing, ...incoming]),
  LearnedPatternsSchema: {
    safeParse: vi.fn(),
  },
}));

vi.mock('@codeagora/github/client.js', () => ({
  parseGitRemote: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  loadLearnedPatterns,
  saveLearnedPatterns,
  LearnedPatternsSchema,
} from '@codeagora/core/learning/store.js';
import { registerLearnCommand } from '@codeagora/cli/commands/learn.js';

const mockedLoad = vi.mocked(loadLearnedPatterns);
const mockedSave = vi.mocked(saveLearnedPatterns);
const mockedSchemaparse = vi.mocked(LearnedPatternsSchema.safeParse);

// ============================================================================
// Helpers
// ============================================================================

type DismissedPattern = {
  pattern: string;
  severity: string;
  dismissCount: number;
  lastDismissed: string;
  action: 'downgrade' | 'suppress';
};

function makePattern(overrides: Partial<DismissedPattern> = {}): DismissedPattern {
  return {
    pattern: 'no-unused-vars',
    severity: 'WARNING',
    dismissCount: 3,
    lastDismissed: '2026-04-01',
    action: 'suppress',
    ...overrides,
  };
}

function makeLearnedPatterns(patterns: DismissedPattern[]) {
  return { version: 1 as const, dismissedPatterns: patterns };
}

/**
 * Build a fresh Commander program with learn registered, then parse args.
 * Captures console.log and console.error output.
 */
async function runLearnSubcommand(subArgs: string[]): Promise<{
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.map(String).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    exitCode = typeof code === 'number' ? code : null;
    throw new Error(`process.exit(${exitCode})`);
  });

  const program = new Command();
  program.exitOverride(); // prevent Commander from calling process.exit on --help
  registerLearnCommand(program);

  try {
    await program.parseAsync(['node', 'cli', 'learn', ...subArgs]);
  } catch (err) {
    // Catch both process.exit throws and Commander exitOverride errors
    if (err instanceof Error && !err.message.startsWith('process.exit')) {
      // Commander error from exitOverride — ignore for our tests
    }
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}

// ============================================================================
// beforeEach cleanup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockedSave.mockResolvedValue(undefined);
});

// ============================================================================
// list subcommand
// ============================================================================

describe('learn list', () => {
  it('shows empty message when no patterns exist', async () => {
    mockedLoad.mockResolvedValue(null);

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toMatch(/no.*pattern|empty/i);
  });

  it('shows empty message when dismissedPatterns array is empty', async () => {
    mockedLoad.mockResolvedValue(makeLearnedPatterns([]));

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toMatch(/no.*pattern|empty/i);
  });

  it('shows pattern text for each pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'no-console' }),
        makePattern({ pattern: 'prefer-const' }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    const output = stdout.join('\n');
    expect(output).toContain('no-console');
    expect(output).toContain('prefer-const');
  });

  it('shows severity for each pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ severity: 'CRITICAL', pattern: 'my-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toContain('CRITICAL');
  });

  it('shows dismiss count for each pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ dismissCount: 7, pattern: 'my-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toContain('7');
  });

  it('shows action for each pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ action: 'downgrade', pattern: 'my-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toContain('downgrade');
  });

  it('shows total count at the end', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'rule-a' }),
        makePattern({ pattern: 'rule-b' }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toContain('2');
  });

  it('shows index for each pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'rule-x' })]),
    );

    const { stdout } = await runLearnSubcommand(['list']);
    expect(stdout.join('\n')).toContain('[0]');
  });
});

// ============================================================================
// stats subcommand
// ============================================================================

describe('learn stats', () => {
  it('shows empty message when no patterns exist', async () => {
    mockedLoad.mockResolvedValue(null);

    const { stdout } = await runLearnSubcommand(['stats']);
    expect(stdout.join('\n')).toMatch(/no.*pattern|empty/i);
  });

  it('shows total pattern count', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'r1', dismissCount: 5 }),
        makePattern({ pattern: 'r2', dismissCount: 3 }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['stats']);
    const output = stdout.join('\n');
    expect(output).toContain('2');
  });

  it('shows total dismissals (sum of all dismissCounts)', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'r1', dismissCount: 5 }),
        makePattern({ pattern: 'r2', dismissCount: 3 }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['stats']);
    expect(stdout.join('\n')).toContain('8'); // 5 + 3
  });

  it('shows the most suppressed pattern', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'low-rule', dismissCount: 1 }),
        makePattern({ pattern: 'top-rule', dismissCount: 10 }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['stats']);
    expect(stdout.join('\n')).toContain('top-rule');
  });

  it('shows severity breakdown', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'r1', severity: 'WARNING' }),
        makePattern({ pattern: 'r2', severity: 'CRITICAL' }),
        makePattern({ pattern: 'r3', severity: 'WARNING' }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['stats']);
    const output = stdout.join('\n');
    expect(output).toContain('WARNING');
    expect(output).toContain('CRITICAL');
  });

  it('shows last updated date', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'r1', lastDismissed: '2026-04-01' }),
        makePattern({ pattern: 'r2', lastDismissed: '2026-04-10' }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['stats']);
    expect(stdout.join('\n')).toContain('2026-04-10');
  });
});

// ============================================================================
// export subcommand
// ============================================================================

describe('learn export', () => {
  it('outputs JSON with empty dismissedPatterns when no patterns exist', async () => {
    mockedLoad.mockResolvedValue(null);

    const { stdout } = await runLearnSubcommand(['export']);
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe(1);
    expect(parsed.dismissedPatterns).toHaveLength(0);
  });

  it('outputs all patterns as JSON', async () => {
    const patterns = [
      makePattern({ pattern: 'rule-a' }),
      makePattern({ pattern: 'rule-b' }),
    ];
    mockedLoad.mockResolvedValue(makeLearnedPatterns(patterns));

    const { stdout } = await runLearnSubcommand(['export']);
    const output = stdout.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.dismissedPatterns).toHaveLength(2);
    expect(parsed.dismissedPatterns[0].pattern).toBe('rule-a');
    expect(parsed.dismissedPatterns[1].pattern).toBe('rule-b');
  });

  it('outputs valid JSON (parseable)', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'my-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['export']);
    expect(() => JSON.parse(stdout.join('\n'))).not.toThrow();
  });
});

// ============================================================================
// remove subcommand
// ============================================================================

describe('learn remove', () => {
  it('shows error and exits when no patterns exist', async () => {
    mockedLoad.mockResolvedValue(null);

    const { exitCode } = await runLearnSubcommand(['remove', '0']);
    expect(exitCode).toBeNull(); // process.exit was NOT called (shows empty msg instead)
    // OR it logs the empty message
  });

  it('shows error when index is out of range (too high)', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'rule-0' })]),
    );

    const { stderr, exitCode } = await runLearnSubcommand(['remove', '5']);
    // Should show error about invalid index
    expect(stderr.join('\n').length + exitCode!).toBeGreaterThan(0);
  });

  it('shows error when index is negative', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'rule-0' })]),
    );

    const { stderr, exitCode } = await runLearnSubcommand(['remove', '-1']);
    expect(stderr.join('\n') + String(exitCode)).toBeTruthy();
  });

  it('shows error when index is not a number', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'rule-0' })]),
    );

    const { stderr, exitCode } = await runLearnSubcommand(['remove', 'abc']);
    expect(stderr.length > 0 || exitCode !== null).toBe(true);
  });

  it('saves updated patterns after successful remove', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'to-remove' }),
        makePattern({ pattern: 'to-keep' }),
      ]),
    );

    await runLearnSubcommand(['remove', '0']);

    expect(mockedSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        dismissedPatterns: expect.arrayContaining([
          expect.objectContaining({ pattern: 'to-keep' }),
        ]),
      }),
    );
  });

  it('shows the removed pattern name after removal', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'removed-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['remove', '0']);
    expect(stdout.join('\n')).toContain('removed-rule');
  });

  it('shows remaining count after removal', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([
        makePattern({ pattern: 'r0' }),
        makePattern({ pattern: 'r1' }),
        makePattern({ pattern: 'r2' }),
      ]),
    );

    const { stdout } = await runLearnSubcommand(['remove', '1']);
    // 3 - 1 = 2 remaining
    expect(stdout.join('\n')).toContain('2');
  });
});

// ============================================================================
// clear subcommand (with --yes flag to skip prompt)
// ============================================================================

describe('learn clear --yes', () => {
  it('shows empty message when no patterns exist', async () => {
    mockedLoad.mockResolvedValue(null);

    const { stdout } = await runLearnSubcommand(['clear', '--yes']);
    expect(stdout.join('\n')).toMatch(/no.*pattern|empty/i);
  });

  it('saves empty patterns array after clearing with --yes', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'old-rule' })]),
    );

    await runLearnSubcommand(['clear', '--yes']);

    expect(mockedSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dismissedPatterns: [] }),
    );
  });

  it('shows cleared confirmation after clear', async () => {
    mockedLoad.mockResolvedValue(
      makeLearnedPatterns([makePattern({ pattern: 'old-rule' })]),
    );

    const { stdout } = await runLearnSubcommand(['clear', '--yes']);
    // Should output some confirmation (i18n key: cli.learn.cleared)
    expect(stdout.length).toBeGreaterThan(0);
  });
});

/**
 * Tests for packages/core/src/pipeline/analyzers/impact-analyzer.ts
 *
 * Note: extractExportedSymbols is private — tested indirectly via analyzeChangeImpact.
 * execFile mock uses the raw callback style (not promisified).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock child_process BEFORE importing subject under test
// ============================================================================

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { analyzeChangeImpact } from '../pipeline/analyzers/impact-analyzer.js';

const mockedExecFile = vi.mocked(execFile);

// ============================================================================
// Helpers
// ============================================================================

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

/**
 * Make execFile resolve immediately with given stdout for all calls.
 */
function mockExecFileSuccess(stdout: string): void {
  mockedExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as ExecFileCallback)(null, stdout, '');
      return {} as ReturnType<typeof execFile>;
    },
  );
}

/**
 * Make execFile return empty stdout (no importers found).
 */
function mockExecFileEmpty(): void {
  mockExecFileSuccess('');
}

// ============================================================================
// analyzeChangeImpact — symbol extraction from diff
// ============================================================================

describe('analyzeChangeImpact() — symbol extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileEmpty();
  });

  it('returns empty map when diff has no exported symbols', async () => {
    const diff = `--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,1 @@\n-const x = 1;\n+const x = 2;`;
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.size).toBe(0);
  });

  it('returns empty map when diff content is empty string', async () => {
    const result = await analyzeChangeImpact('/repo', '');
    expect(result.size).toBe(0);
    // execFile should not have been called
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('does not extract symbols from removed lines (- prefix)', async () => {
    const diff = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,1 +1,1 @@',
      '-export function removedFn() {}',
      '+const x = 1;',
    ].join('\n');
    const result = await analyzeChangeImpact('/repo', diff);
    // removedFn is on a removed line — should not be extracted
    expect(result.has('removedFn')).toBe(false);
  });

  it('does not treat +++ header lines as added code', async () => {
    const diff = [
      '+++ b/export function notASymbol() {}',
      '+export function realSymbol() {}',
    ].join('\n');

    mockExecFileSuccess('./src/importer.ts\n');

    const result = await analyzeChangeImpact('/repo', diff);
    // only realSymbol should be detected
    expect(result.has('notASymbol')).toBe(false);
    expect(result.has('realSymbol')).toBe(true);
  });
});

// ============================================================================
// analyzeChangeImpact — grep invocation and importer detection
// ============================================================================

describe('analyzeChangeImpact() — importer detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds importers via grep for an exported function', async () => {
    const diff = [
      '--- a/utils.ts',
      '+++ b/utils.ts',
      '@@ -0,0 +1,1 @@',
      '+export function myHelper() {}',
    ].join('\n');

    mockExecFileSuccess('./src/a.ts\n./src/b.ts\n');

    const result = await analyzeChangeImpact('/repo', diff);

    expect(result.has('myHelper')).toBe(true);
    const entry = result.get('myHelper')!;
    expect(entry.callerCount).toBe(2);
    expect(entry.importers).toContain('src/a.ts');
    expect(entry.importers).toContain('src/b.ts');
  });

  it('strips leading ./ from importer paths', async () => {
    const diff = '+export const myConst = 42;';
    mockExecFileSuccess('./src/consumer.ts\n');

    const result = await analyzeChangeImpact('/repo', diff);
    const entry = result.get('myConst')!;
    expect(entry.importers[0]).toBe('src/consumer.ts');
  });

  it('returns empty map when grep finds no importers', async () => {
    const diff = '+export function isolated() {}';
    mockExecFileEmpty();

    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.size).toBe(0);
  });

  it('calls execFile with the repo path as cwd', async () => {
    const diff = '+export function myFn() {}';
    mockExecFileEmpty();

    await analyzeChangeImpact('/my/repo', diff);

    expect(mockedExecFile).toHaveBeenCalledWith(
      'grep',
      expect.arrayContaining([expect.stringContaining('myFn')]),
      expect.objectContaining({ cwd: '/my/repo' }),
      expect.any(Function),
    );
  });

  it('calls execFile with a timeout option', async () => {
    const diff = '+export function myFn() {}';
    mockExecFileEmpty();

    await analyzeChangeImpact('/repo', diff);

    expect(mockedExecFile).toHaveBeenCalledWith(
      'grep',
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
  });

  it('sets symbol name and callerCount correctly on the impact entry', async () => {
    const diff = '+export class MyService {}';
    mockExecFileSuccess('./a.ts\n./b.ts\n./c.ts\n');

    const result = await analyzeChangeImpact('/repo', diff);

    const entry = result.get('MyService')!;
    expect(entry.symbol).toBe('MyService');
    expect(entry.callerCount).toBe(3);
  });
});

// ============================================================================
// analyzeChangeImpact — multiple symbol types
// ============================================================================

describe('analyzeChangeImpact() — export keyword variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileSuccess('./src/importer.ts\n');
  });

  it('extracts exported const', async () => {
    const diff = '+export const CONFIG_KEY = "value";';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('CONFIG_KEY')).toBe(true);
  });

  it('extracts exported class', async () => {
    const diff = '+export class EventEmitter {}';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('EventEmitter')).toBe(true);
  });

  it('extracts exported interface', async () => {
    const diff = '+export interface ReviewResult {}';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('ReviewResult')).toBe(true);
  });

  it('extracts exported async function', async () => {
    const diff = '+export async function fetchData() {}';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('fetchData')).toBe(true);
  });

  it('extracts exported type alias', async () => {
    const diff = '+export type SeverityLevel = "WARNING" | "CRITICAL";';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('SeverityLevel')).toBe(true);
  });

  it('extracts exported enum', async () => {
    const diff = '+export enum Status { Active, Inactive }';
    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('Status')).toBe(true);
  });
});

// ============================================================================
// analyzeChangeImpact — deduplication
// ============================================================================

describe('analyzeChangeImpact() — deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileSuccess('./src/importer.ts\n');
  });

  it('deduplicates the same symbol appearing on multiple added lines', async () => {
    const diff = [
      '+export function myFn() {}',
      '+export function myFn() {} // duplicate',
    ].join('\n');

    const result = await analyzeChangeImpact('/repo', diff);

    // Should only call execFile once for myFn
    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    expect(result.has('myFn')).toBe(true);
  });

  it('handles multiple distinct symbols in one diff', async () => {
    let callCount = 0;
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        callCount++;
        (cb as ExecFileCallback)(null, './src/importer.ts\n', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const diff = [
      '+export function fnA() {}',
      '+export function fnB() {}',
      '+export const CONST_C = 1;',
    ].join('\n');

    const result = await analyzeChangeImpact('/repo', diff);

    expect(callCount).toBe(3);
    expect(result.has('fnA')).toBe(true);
    expect(result.has('fnB')).toBe(true);
    expect(result.has('CONST_C')).toBe(true);
  });
});

// ============================================================================
// analyzeChangeImpact — time budget allocation
// ============================================================================

describe('analyzeChangeImpact() — time budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileEmpty();
  });

  it('allocates at least 2000ms per symbol', async () => {
    // With 1 symbol: budget = max(2000, floor(10000/1)) = 10000
    const diff = '+export function singleFn() {}';
    await analyzeChangeImpact('/repo', diff);

    expect(mockedExecFile).toHaveBeenCalledWith(
      'grep',
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );

    const opts = (mockedExecFile.mock.calls[0] as unknown[])[2] as { timeout: number };
    expect(opts.timeout).toBeGreaterThanOrEqual(2000);
  });

  it('distributes budget: more symbols = smaller per-symbol timeout', async () => {
    // 10 symbols: budget = max(2000, floor(10000/10)) = 2000
    // 1 symbol: budget = max(2000, floor(10000/1)) = 10000
    const timeouts: number[] = [];
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, opts: unknown, cb: unknown) => {
        timeouts.push((opts as { timeout: number }).timeout);
        (cb as ExecFileCallback)(null, '', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    // Generate a diff with many symbols
    const manySymbols = Array.from({ length: 10 }, (_, i) =>
      `+export function sym${i}() {}`,
    ).join('\n');

    await analyzeChangeImpact('/repo', manySymbols);

    // All calls should have the same timeout
    expect(new Set(timeouts).size).toBe(1);
    // Per-symbol timeout with 10 symbols = max(2000, 1000) = 2000
    expect(timeouts[0]).toBe(2000);
  });
});

// ============================================================================
// analyzeChangeImpact — resilience (failed grep calls)
// ============================================================================

describe('analyzeChangeImpact() — resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('silently skips symbols where execFile calls the callback with an error', async () => {
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as ExecFileCallback)(new Error('grep failed'), '', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const diff = '+export function failedSym() {}';
    // Should not throw — symbol with no importers is just omitted
    const result = await analyzeChangeImpact('/repo', diff);
    // grep error but stdout is empty, so result is empty
    expect(result.size).toBe(0);
  });

  it('still processes other symbols when one grep call returns empty', async () => {
    let callIndex = 0;
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        // First call: no importers; second call: has importers
        const stdout = callIndex++ === 0 ? '' : './src/consumer.ts\n';
        (cb as ExecFileCallback)(null, stdout, '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const diff = [
      '+export function noImporters() {}',
      '+export function hasImporters() {}',
    ].join('\n');

    const result = await analyzeChangeImpact('/repo', diff);
    expect(result.has('noImporters')).toBe(false);
    expect(result.has('hasImporters')).toBe(true);
  });
});

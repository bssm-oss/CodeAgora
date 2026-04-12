import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTscDiagnostics } from '../pipeline/analyzers/tsc-runner.js';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

import { execFile } from 'child_process';
import { access } from 'fs/promises';

const mockExecFile = vi.mocked(execFile);
const mockAccess = vi.mocked(access);

function simulateExecFile(stdout: string, stderr = '', exitCode = 0): void {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
    const err = exitCode !== 0 ? Object.assign(new Error('exit'), { code: exitCode }) : null;
    callback(err, stdout, stderr);
    return { on: vi.fn() } as unknown as ReturnType<typeof execFile>;
  });
}

describe('runTscDiagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAccess.mockResolvedValue(undefined);
  });

  it('should return empty array when tsconfig.json does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const result = await runTscDiagnostics('/repo', ['src/file.ts']);
    expect(result).toEqual([]);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should parse tsc error output for changed files', async () => {
    simulateExecFile(
      'src/utils.ts(10,5): error TS2322: Type string is not assignable to type number\n' +
      'src/index.ts(20,3): error TS2345: Argument of type X is not assignable\n',
      '',
      1,
    );

    const result = await runTscDiagnostics('/repo', ['src/utils.ts', 'src/index.ts']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      file: 'src/utils.ts',
      line: 10,
      code: 2322,
      message: 'Type string is not assignable to type number',
    });
    expect(result[1]).toEqual({
      file: 'src/index.ts',
      line: 20,
      code: 2345,
      message: 'Argument of type X is not assignable',
    });
  });

  it('should filter out diagnostics for unchanged files', async () => {
    simulateExecFile(
      'src/utils.ts(10,5): error TS2322: Some error\n' +
      'src/other.ts(5,1): error TS2345: Other error\n',
    );

    const result = await runTscDiagnostics('/repo', ['src/utils.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/utils.ts');
  });

  it('should return empty array when tsc produces no output', async () => {
    simulateExecFile('', '');
    const result = await runTscDiagnostics('/repo', ['src/file.ts']);
    expect(result).toEqual([]);
  });

  it('should handle stderr output', async () => {
    simulateExecFile(
      '',
      'src/file.ts(5,1): error TS1005: ; expected\n',
    );

    const result = await runTscDiagnostics('/repo', ['src/file.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe(1005);
  });

  it('should match files with tail portion matching', async () => {
    simulateExecFile(
      './src/deep/nested/file.ts(1,1): error TS2322: err\n',
    );
    // Changed file doesn't have ./ prefix
    const result = await runTscDiagnostics('/repo', ['src/deep/nested/file.ts']);
    expect(result).toHaveLength(1);
  });

  it('should strip leading ./ from file paths', async () => {
    simulateExecFile(
      './src/utils.ts(10,5): error TS2322: Type error\n',
    );
    const result = await runTscDiagnostics('/repo', ['src/utils.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/utils.ts');
  });

  it('should ignore non-error lines', async () => {
    simulateExecFile(
      'Found 2 errors.\n' +
      '\n' +
      'src/file.ts(1,1): error TS2322: Real error\n',
    );
    const result = await runTscDiagnostics('/repo', ['src/file.ts']);
    expect(result).toHaveLength(1);
  });

  it('should handle child process error event', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, _cb) => {
      const child = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'error') handler();
          return child;
        }),
      };
      return child as unknown as ReturnType<typeof execFile>;
    });

    const result = await runTscDiagnostics('/repo', ['src/file.ts']);
    expect(result).toEqual([]);
  });

  it('should handle leading slash in changed files', async () => {
    simulateExecFile('src/file.ts(1,1): error TS2322: err\n');
    const result = await runTscDiagnostics('/repo', ['/src/file.ts']);
    expect(result).toHaveLength(1);
  });
});

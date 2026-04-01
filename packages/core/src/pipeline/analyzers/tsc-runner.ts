/**
 * TSC Runner (#414)
 * Run TypeScript diagnostics on changed files to provide
 * type-error context to reviewers.
 */

import { execFile } from 'child_process';
import { access } from 'fs/promises';
import path from 'path';

export interface TscDiagnostic {
  file: string;
  line: number;
  code: number;
  message: string;
}

/** Regex to parse tsc output: `file.ts(line,col): error TScode: message` */
const TSC_LINE_RE = /^(.+?)\((\d+),\d+\):\s+error\s+TS(\d+):\s+(.+)$/;

/**
 * Run `npx tsc --noEmit` and return diagnostics filtered to changed files.
 *
 * @param repoPath - Git repo root path
 * @param changedFiles - List of changed file paths (relative to repo root)
 * @returns Array of diagnostics for changed files only
 */
export async function runTscDiagnostics(
  repoPath: string,
  changedFiles: string[],
): Promise<TscDiagnostic[]> {
  // Check tsconfig.json exists
  try {
    await access(path.join(repoPath, 'tsconfig.json'));
  } catch {
    return [];
  }

  // Normalize changed file paths for comparison
  const changedSet = new Set(
    changedFiles.map((f) => f.replace(/^\//, '')),
  );

  return new Promise<TscDiagnostic[]>((resolve) => {
    const child = execFile(
      'npx',
      ['tsc', '--noEmit'],
      {
        cwd: repoPath,
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      (error, stdout, stderr) => {
        // tsc returns exit code 1 on type errors — that's expected
        const output = (stdout || '') + (stderr || '');
        if (!output.trim()) {
          resolve([]);
          return;
        }

        const diagnostics: TscDiagnostic[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
          const match = line.match(TSC_LINE_RE);
          if (!match) continue;

          const [, rawFile, rawLine, rawCode, message] = match;
          const file = rawFile.trim();

          // Filter to changed files only
          const normalizedFile = file.replace(/^\.\//, '');
          if (!changedSet.has(normalizedFile)) {
            // Try matching against tail portions of changed paths
            const matches = [...changedSet].some(
              (cf) => cf.endsWith(normalizedFile) || normalizedFile.endsWith(cf),
            );
            if (!matches) continue;
          }

          diagnostics.push({
            file: normalizedFile,
            line: parseInt(rawLine, 10),
            code: parseInt(rawCode, 10),
            message: message.trim(),
          });
        }

        resolve(diagnostics);
      },
    );

    // Safety: kill on timeout (execFile timeout sends SIGTERM)
    child.on('error', () => resolve([]));
  });
}

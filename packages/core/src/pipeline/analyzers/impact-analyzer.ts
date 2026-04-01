/**
 * Impact Analyzer (#415)
 * Find callers/importers of changed exports to assess change blast radius.
 */

import { execFile } from 'child_process';

export interface ImpactEntry {
  symbol: string;
  callerCount: number;
  importers: string[];
}

/** Regex to extract exported names from diff added lines */
const EXPORT_RE =
  /export\s+(?:async\s+)?(?:function|const|class|let|var|enum|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;

/**
 * Extract exported symbol names from added lines in a diff.
 */
function extractExportedSymbols(diffContent: string): string[] {
  const symbols: string[] = [];
  const lines = diffContent.split('\n');

  for (const line of lines) {
    // Only look at added lines
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    const match = line.slice(1).match(EXPORT_RE);
    if (match?.[1]) {
      symbols.push(match[1]);
    }
  }

  return [...new Set(symbols)];
}

/**
 * Search for importers of a specific symbol using grep.
 * Returns list of importing file paths.
 */
function findImporters(
  repoPath: string,
  symbolName: string,
  timeoutMs: number,
): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    // Search for import statements containing the symbol name
    // Covers: import { name }, import { name as alias }, import name
    execFile(
      'grep',
      [
        '-r',
        '-l',
        `import.*${symbolName}`,
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.js',
        '--include=*.jsx',
        '--include=*.mts',
        '--include=*.mjs',
        '.',
      ],
      {
        cwd: repoPath,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
      },
      (error, stdout) => {
        if (!stdout?.trim()) {
          resolve([]);
          return;
        }

        const files = stdout
          .trim()
          .split('\n')
          .map((f) => f.replace(/^\.\//, ''))
          .filter(Boolean);

        resolve(files);
      },
    );
  });
}

/**
 * Analyze the impact of changed exports by finding their importers.
 *
 * @param repoPath - Git repo root path
 * @param diffContent - Full unified diff string
 * @returns Map from symbol name to impact entry
 */
export async function analyzeChangeImpact(
  repoPath: string,
  diffContent: string,
): Promise<Map<string, ImpactEntry>> {
  const result = new Map<string, ImpactEntry>();

  const symbols = extractExportedSymbols(diffContent);
  if (symbols.length === 0) return result;

  // Allocate time budget across symbols (total 10s)
  const perSymbolTimeout = Math.max(2000, Math.floor(10_000 / symbols.length));

  const searches = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const importers = await findImporters(repoPath, symbol, perSymbolTimeout);
      return { symbol, importers };
    }),
  );

  for (const search of searches) {
    if (search.status === 'fulfilled') {
      const { symbol, importers } = search.value;
      if (importers.length > 0) {
        result.set(symbol, {
          symbol,
          callerCount: importers.length,
          importers,
        });
      }
    }
    // Failed searches are silently skipped
  }

  return result;
}

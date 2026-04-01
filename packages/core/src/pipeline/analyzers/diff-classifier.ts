/**
 * Diff Classifier (#411)
 * Classifies each file in a diff by change type using lightweight heuristics.
 * No AST parsing — 80% accuracy is the target.
 */

export type FileClassification =
  | 'rename'
  | 'logic'
  | 'refactor'
  | 'config'
  | 'test'
  | 'docs'
  | 'dependency';

// ============================================================================
// Path-based classification
// ============================================================================

const TEST_PATH_RE = /(?:__tests__|\.test\.|\.spec\.|test\/|tests\/|spec\/)/i;
const DOCS_EXT_RE = /\.(md|txt|rst|adoc|rdoc)$/i;
const CONFIG_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.base.json',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'jest.config.js',
  'jest.config.ts',
  'vitest.config.ts',
  'vitest.config.js',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'babel.config.js',
  'babel.config.json',
  '.babelrc',
]);
const CONFIG_EXT_RE = /\.(yaml|yml|toml|env|ini|cfg)$/i;
const DEPENDENCY_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  'Cargo.lock',
  'poetry.lock',
]);

/**
 * Try to classify a file purely by its path.
 * Returns undefined if no path-based rule matches.
 */
function classifyByPath(filePath: string): FileClassification | undefined {
  const basename = filePath.split('/').pop() ?? filePath;

  if (DEPENDENCY_FILES.has(basename)) return 'dependency';
  if (TEST_PATH_RE.test(filePath)) return 'test';
  if (DOCS_EXT_RE.test(basename)) return 'docs';
  if (CONFIG_FILES.has(basename)) return 'config';
  if (CONFIG_EXT_RE.test(basename)) return 'config';
  if (basename.startsWith('.env')) return 'config';

  return undefined;
}

// ============================================================================
// Content-based classification (rename / refactor heuristics)
// ============================================================================

/**
 * Tokenize a line into identifiers by splitting on non-word characters.
 */
function tokenize(line: string): string[] {
  return line.split(/[^a-zA-Z0-9_$]+/).filter(Boolean);
}

/**
 * Count how many tokens differ between two lines.
 */
function tokenDiff(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const maxLen = Math.max(tokensA.length, tokensB.length);
  if (maxLen === 0) return 0;

  let diffs = 0;
  for (let i = 0; i < maxLen; i++) {
    if (tokensA[i] !== tokensB[i]) diffs++;
  }
  return diffs;
}

/**
 * Compute Jaccard similarity between two sets of strings.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersect = 0;
  for (const token of a) {
    if (b.has(token)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 1 : intersect / union;
}

/**
 * Attempt content-based classification for a single file diff section.
 * Returns 'rename', 'refactor', or undefined (fall through to 'logic').
 */
function classifyByContent(diffSection: string): FileClassification | undefined {
  const lines = diffSection.split('\n');
  const removed: string[] = [];
  const added: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      removed.push(line.slice(1).trim());
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1).trim());
    }
  }

  // Not enough signal
  if (removed.length === 0 && added.length === 0) return undefined;

  // ── Rename heuristic ──
  // If most changed line pairs differ by only 1-2 tokens, it's likely a rename.
  // Require at least 3 changed line pairs and multi-token lines for meaningful signal.
  if (removed.length >= 3 && added.length >= 3 && Math.abs(removed.length - added.length) <= 2) {
    const pairCount = Math.min(removed.length, added.length);
    let renameCount = 0;
    let substantiveLines = 0;

    for (let i = 0; i < pairCount; i++) {
      const removedTokens = tokenize(removed[i]);
      // Only consider lines with enough tokens to be meaningful
      if (removedTokens.length < 2) continue;
      substantiveLines++;
      const diff = tokenDiff(removed[i], added[i]);
      if (diff <= 2 && diff > 0) renameCount++;
    }

    if (substantiveLines >= 3 && renameCount / substantiveLines >= 0.6) {
      return 'rename';
    }
  }

  // ── Refactor heuristic ──
  // Lines deleted from one spot appear (with high similarity) as added lines.
  // Check if removed and added lines have high token overlap but different order/placement.
  if (removed.length >= 3 && added.length >= 3) {
    const removedTokens = new Set(removed.flatMap(tokenize));
    const addedTokens = new Set(added.flatMap(tokenize));
    const similarity = jaccardSimilarity(removedTokens, addedTokens);

    // High token overlap (>70%) but not identical lines → likely code movement
    if (similarity > 0.7) {
      const identicalLines = removed.filter((r) => added.includes(r)).length;
      const identicalRatio = identicalLines / Math.max(removed.length, added.length);
      // If not ALL lines are identical (that would be a no-op), it's a refactor
      if (identicalRatio < 0.9) {
        return 'refactor';
      }
    }
  }

  return undefined;
}

// ============================================================================
// Main Entry
// ============================================================================

/**
 * Classify each file in a unified diff by change type.
 *
 * @param diffContent - Full unified diff string
 * @returns Map from file path to classification
 */
export function classifyDiffFiles(
  diffContent: string,
): Map<string, FileClassification> {
  const result = new Map<string, FileClassification>();
  if (!diffContent.trim()) return result;

  const sections = diffContent.split(/(?=diff --git )/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith('diff --git ')) continue;

    const match = trimmed.match(/diff --git a\/(.+?) b\/(.+)/);
    if (!match) continue;

    const filePath = match[2];

    // 1. Try path-based classification (fast, high confidence)
    const pathClass = classifyByPath(filePath);
    if (pathClass) {
      result.set(filePath, pathClass);
      continue;
    }

    // 2. Try content-based classification (rename/refactor heuristics)
    const contentClass = classifyByContent(trimmed);
    if (contentClass) {
      result.set(filePath, contentClass);
      continue;
    }

    // 3. Default
    result.set(filePath, 'logic');
  }

  return result;
}

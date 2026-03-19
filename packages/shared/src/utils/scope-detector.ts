/**
 * Regex-based function/class scope detection.
 * Lightweight — no AST parsing.
 */

export interface ScopeInfo {
  name: string;
  type: 'function' | 'class' | 'method' | 'unknown';
  startLine: number;
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export function detectLanguage(filePath: string): 'ts' | 'python' | 'go' | 'unknown' {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  if (TS_EXTENSIONS.has(ext)) return 'ts';
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  return 'unknown';
}

// TS/JS patterns — order matters (most specific first)
const TS_PATTERNS: Array<{ re: RegExp; type: ScopeInfo['type'] }> = [
  // class NAME
  { re: /^(?:export\s+(?:default\s+)?|abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/, type: 'class' },
  // export async function NAME( | async function NAME( | export function NAME( | function NAME(
  { re: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)[\s(<]/, type: 'function' },
  // const NAME = ... (arrow or function expression)
  { re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/, type: 'function' },
  { re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function/, type: 'function' },
  // method: NAME( when indented (inside class body) — must have leading whitespace
  { re: /^[ \t]+(?:(?:public|private|protected|static|async|override|abstract)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/, type: 'method' },
];

const PYTHON_PATTERNS: Array<{ re: RegExp; type: ScopeInfo['type'] }> = [
  { re: /^class\s+([A-Za-z_][A-Za-z0-9_]*)[\s:(]/, type: 'class' },
  { re: /^[ \t]*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/, type: 'function' },
];

const GO_PATTERNS: Array<{ re: RegExp; type: ScopeInfo['type'] }> = [
  // func (receiver Type) NAME(  → method
  { re: /^func\s+\([^)]+\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/, type: 'method' },
  // func NAME(  → function
  { re: /^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/, type: 'function' },
];

const MAX_SCAN_LINES = 50;

export function detectScope(
  filePath: string,
  lineNumber: number,
  codeLines: string[],
): ScopeInfo | null {
  if (!codeLines.length) return null;

  const lang = detectLanguage(filePath);
  if (lang === 'unknown') return null;

  const patterns =
    lang === 'ts' ? TS_PATTERNS : lang === 'python' ? PYTHON_PATTERNS : GO_PATTERNS;

  // lineNumber is 1-based; convert to 0-based index
  const startIdx = Math.min(lineNumber - 1, codeLines.length - 1);
  const endIdx = Math.max(0, startIdx - MAX_SCAN_LINES);

  let methodCandidate: ScopeInfo | null = null;

  for (let i = startIdx; i >= endIdx; i--) {
    const line = codeLines[i];
    for (const { re, type } of patterns) {
      const m = line.match(re);
      if (m && m[1]) {
        if (type === 'method' && methodCandidate === null) {
          // Record the method but keep scanning upward for the enclosing class
          methodCandidate = { name: m[1], type, startLine: i + 1 };
        } else if (type !== 'method') {
          // Found a non-method scope — prefer it over a previously seen method
          return { name: m[1], type, startLine: i + 1 };
        }
        break; // only first matching pattern per line
      }
    }
  }

  // Nothing better found — return the method candidate if any
  return methodCandidate;
}

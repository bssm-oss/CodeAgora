/**
 * Session Trace CLI Command (#477)
 * Renders per-finding confidence trace breakdown from a session's result.json.
 *
 * Why: "Why is this finding at X% confidence?" is a core debug question when
 * tuning calibration. Before this command users had to hand-parse the raw
 * result.json stored under .ca/sessions/{date}/{id}/. Now: `agora trace
 * 2026-04-20/001`.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  formatFindingTrace,
  formatSessionTrace,
  type TraceableDoc,
} from '@codeagora/shared/utils/confidence-trace-formatter.js';

export interface TraceOptions {
  finding?: number;
}

export interface TraceResult {
  sessionPath: string;
  findingCount: number;
  output: string;
}

interface MinimalSessionResult {
  evidenceDocs?: TraceableDoc[];
  summary?: { decision?: string };
}

function assertSafeSessionPath(baseDir: string, date: string, id: string): string {
  if (date.includes('..') || id.includes('..')) {
    throw new Error('Path traversal detected in session path');
  }
  // Null-byte injection guard (some platforms interpret \0 as path terminator)
  if (date.includes('\0') || id.includes('\0')) {
    throw new Error('Path traversal detected in session path');
  }
  const sessionDir = path.join(baseDir, '.ca', 'sessions', date, id);
  const resolved = path.resolve(sessionDir);
  const expectedPrefix = path.resolve(path.join(baseDir, '.ca', 'sessions'));
  // Use path.relative for cross-platform containment check. startsWith on
  // Windows is case-sensitive but the file system is not, so a path like
  // `C:\...` could match `c:\...` only at runtime, creating a traversal
  // bypass. path.relative normalizes both sides and yields a clean answer:
  // if the relative path starts with `..` or is absolute, `resolved` is
  // outside `expectedPrefix`. See #485 self-review (HARSHLY_CRITICAL).
  const rel = path.relative(expectedPrefix, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Session path resolves outside sessions directory');
  }
  return sessionDir;
}

/**
 * Read a session's result.json and render the confidence trace.
 */
export async function traceSession(
  baseDir: string,
  sessionPath: string,
  options: TraceOptions = {},
): Promise<TraceResult> {
  const [date, id] = sessionPath.split('/');
  if (!date || !id) {
    throw new Error('Session path must be in YYYY-MM-DD/NNN format');
  }

  const sessionDir = assertSafeSessionPath(baseDir, date, id);
  const resultPath = path.join(sessionDir, 'result.json');

  let result: MinimalSessionResult;
  try {
    const raw = await fs.readFile(resultPath, 'utf-8');
    result = JSON.parse(raw) as MinimalSessionResult;
  } catch (err) {
    const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? `Session result not found: ${sessionPath} (no result.json at ${resultPath})`
      : `Failed to read session result: ${(err as Error).message}`;
    throw new Error(msg);
  }

  const docs = result.evidenceDocs ?? [];
  const lines: string[] = [];
  const decision = result.summary?.decision ?? 'unknown';
  lines.push(`Session ${sessionPath} — ${decision} (${docs.length} finding${docs.length === 1 ? '' : 's'})`);
  lines.push('');

  if (docs.length === 0) {
    lines.push(...formatSessionTrace([]));
  } else if (options.finding !== undefined) {
    const idx = options.finding;
    // Number.isInteger guard: CLI parseInt can yield NaN on non-numeric input
    // (e.g. `--finding abc`). NaN fails every comparison silently, so without
    // this check docs[NaN-1] would be undefined and downstream formatting
    // would crash. See #485 self-review.
    if (!Number.isInteger(idx) || idx < 1 || idx > docs.length) {
      throw new Error(`Finding index ${idx} out of range (session has ${docs.length} findings, use 1-${docs.length})`);
    }
    lines.push(...formatFindingTrace(docs[idx - 1], idx));
  } else {
    lines.push(...formatSessionTrace(docs));
  }

  return {
    sessionPath,
    findingCount: docs.length,
    output: lines.join('\n'),
  };
}

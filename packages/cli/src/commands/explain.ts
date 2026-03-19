/**
 * Session Explain CLI Command (4.3)
 * Reads session artifacts and produces a narrative summary.
 */

import fs from 'fs/promises';
import path from 'path';

export interface ExplainResult {
  sessionPath: string;
  narrative: string;
}

/**
 * Generate a narrative explanation of a review session.
 * Reads metadata, reviews, discussions, and verdict from session directory.
 */
export async function explainSession(baseDir: string, sessionPath: string): Promise<ExplainResult> {
  const [date, id] = sessionPath.split('/');
  if (!date || !id) {
    throw new Error('Session path must be in YYYY-MM-DD/NNN format');
  }

  // Path traversal guard
  if (date.includes('..') || id.includes('..')) {
    throw new Error('Path traversal detected in session path');
  }

  const sessionDir = path.join(baseDir, '.ca', 'sessions', date, id);
  const resolved = path.resolve(sessionDir);
  const expectedPrefix = path.resolve(path.join(baseDir, '.ca', 'sessions'));
  if (!resolved.startsWith(expectedPrefix + path.sep)) {
    throw new Error('Session path resolves outside sessions directory');
  }
  const lines: string[] = [];

  // Read metadata
  let metadata: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8');
    metadata = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Session not found: ${sessionPath}`);
  }

  // Read head verdict
  let verdict: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(path.join(sessionDir, 'head-verdict.json'), 'utf-8');
    verdict = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // No verdict yet
  }

  const decision = String(verdict['decision'] ?? metadata['status'] ?? 'unknown');
  lines.push(`Session ${sessionPath} \u2014 ${decision}`);
  lines.push('');

  // Read reviews
  const reviewsDir = path.join(sessionDir, 'reviews');
  let reviewFiles: string[] = [];
  try {
    reviewFiles = (await fs.readdir(reviewsDir)).filter(f => f.endsWith('.md') || f.endsWith('.json'));
  } catch {
    // No reviews
  }

  lines.push(`L1: ${reviewFiles.length} reviewer output(s) recorded`);

  // Read discussions
  const discussionsDir = path.join(sessionDir, 'discussions');
  let discussionDirs: string[] = [];
  try {
    const entries = await fs.readdir(discussionsDir);
    discussionDirs = entries.filter(e => e.startsWith('d'));
  } catch {
    // No discussions
  }

  if (discussionDirs.length > 0) {
    lines.push('');
    lines.push(`L2: ${discussionDirs.length} discussion(s) opened`);

    for (const dId of discussionDirs.slice(0, 10)) {
      const dDir = path.join(discussionsDir, dId);
      try {
        const verdictRaw = await fs.readFile(path.join(dDir, 'verdict.json'), 'utf-8');
        const dVerdict = JSON.parse(verdictRaw) as Record<string, unknown>;
        const severity = String(dVerdict['finalSeverity'] ?? '?');
        const rounds = Number(dVerdict['rounds'] ?? 0);
        const consensus = dVerdict['consensusReached'] ? 'consensus' : 'forced';
        lines.push(`  \u2192 ${dId}: ${rounds} round(s), ${consensus} \u2192 ${severity}`);
      } catch {
        lines.push(`  \u2192 ${dId}: (no verdict)`);
      }
    }
  }

  // Head verdict details
  if (verdict['decision']) {
    lines.push('');
    lines.push(`L3: Head verdict \u2014 ${verdict['decision']}`);
    if (verdict['reasoning']) {
      lines.push(`  \u2192 ${String(verdict['reasoning']).slice(0, 200)}`);
    }
    const questions = verdict['questionsForHuman'] as string[] | undefined;
    if (questions && questions.length > 0) {
      lines.push(`  \u2192 Questions for human: ${questions.length}`);
      for (const q of questions.slice(0, 3)) {
        lines.push(`    \u2022 "${q}"`);
      }
    }
  }

  return {
    sessionPath,
    narrative: lines.join('\n'),
  };
}

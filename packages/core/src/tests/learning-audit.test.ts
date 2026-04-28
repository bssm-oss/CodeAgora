import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { auditLearnedPatterns, formatLearningAuditText } from '../learning/audit.js';
import type { DismissedPattern } from '../learning/store.js';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

describe('auditLearnedPatterns', () => {
  it('reports active suppress and downgrade candidates from benchmark results', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeagora-learning-audit-'));
    const resultsDir = path.join(root, 'results');
    await writeJson(path.join(resultsDir, 'case-a.json'), [
      {
        issueTitle: 'Noisy retry warning',
        problem: 'details',
        severity: 'WARNING',
        filePath: 'src/a.ts',
        lineRange: [1, 1],
      },
      {
        issueTitle: 'Serious auth bug',
        problem: 'details',
        severity: 'CRITICAL',
        filePath: 'src/b.ts',
        lineRange: [2, 2],
      },
    ]);

    const patterns: DismissedPattern[] = [
      {
        pattern: 'Noisy retry',
        severity: 'WARNING',
        dismissCount: 3,
        lastDismissed: '2026-04-28',
        action: 'suppress',
      },
      {
        pattern: 'Serious auth',
        severity: 'CRITICAL',
        dismissCount: 4,
        lastDismissed: '2026-04-28',
        action: 'downgrade',
      },
      {
        pattern: 'inactive',
        severity: 'WARNING',
        dismissCount: 1,
        lastDismissed: '2026-04-28',
        action: 'suppress',
      },
    ];

    const report = await auditLearnedPatterns({
      sourcePath: resultsDir,
      patterns,
      threshold: 3,
      generatedAt: '2026-04-28T00:00:00.000Z',
    });

    expect(report).toMatchObject({
      totalPatterns: 3,
      activePatterns: 2,
      totalFindings: 2,
      matchedFindings: 2,
      activeMatches: 2,
      suppressCandidates: 1,
      downgradeCandidates: 1,
    });
    expect(formatLearningAuditText(report)).toContain('Suppress candidates: 1');
  });
});

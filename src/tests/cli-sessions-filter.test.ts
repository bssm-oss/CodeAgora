/**
 * CLI Sessions Filtering, Sorting, and Stats Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import {
  listSessions,
  getSessionStats,
  formatSessionStats,
  type SessionStats,
} from '@codeagora/cli/commands/sessions.js';

// ============================================================================
// Helpers
// ============================================================================

async function makeSession(
  baseDir: string,
  date: string,
  sessionId: string,
  options?: {
    status?: string;
    verdict?: Record<string, unknown>;
  }
): Promise<string> {
  const sessionDir = path.join(baseDir, '.ca', 'sessions', date, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const metadata = {
    sessionId,
    date,
    timestamp: Date.now(),
    diffPath: '/tmp/test.patch',
    status: options?.status ?? 'completed',
    startedAt: Date.now(),
  };
  await fs.writeFile(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata));

  if (options?.verdict) {
    await fs.writeFile(
      path.join(sessionDir, 'head-verdict.json'),
      JSON.stringify(options.verdict)
    );
  }

  return sessionDir;
}

// ============================================================================
// listSessions with filters
// ============================================================================

describe('listSessions with filters', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-filter-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('filters by status', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'failed' });
    await makeSession(tmpDir, '2026-03-14', '001', { status: 'completed' });

    const result = await listSessions(tmpDir, { status: 'completed' });
    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.status).toBe('completed');
    }
  });

  it('filters by after date', async () => {
    await makeSession(tmpDir, '2026-03-11', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-15', '001', { status: 'completed' });

    const result = await listSessions(tmpDir, { after: '2026-03-13' });
    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.date >= '2026-03-13').toBe(true);
    }
  });

  it('filters by before date', async () => {
    await makeSession(tmpDir, '2026-03-11', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-15', '001', { status: 'completed' });

    const result = await listSessions(tmpDir, { before: '2026-03-13' });
    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.date <= '2026-03-13').toBe(true);
    }
  });

  it('combines status + date filters', async () => {
    await makeSession(tmpDir, '2026-03-11', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'failed' });
    await makeSession(tmpDir, '2026-03-15', '001', { status: 'completed' });

    const result = await listSessions(tmpDir, { status: 'completed', after: '2026-03-12', before: '2026-03-14' });
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-03-13');
    expect(result[0].status).toBe('completed');
  });

  it('sorts by status alphabetically', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'failed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '003', { status: 'in_progress' });

    const result = await listSessions(tmpDir, { sort: 'status', limit: 10 });
    expect(result).toHaveLength(3);
    const statuses = result.map((s) => s.status);
    const sorted = [...statuses].sort((a, b) => a.localeCompare(b));
    expect(statuses).toEqual(sorted);
  });

  it('sorts by issues count descending', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', {
      verdict: { issues: [{ title: 'A', severity: 'CRITICAL' }] },
    });
    await makeSession(tmpDir, '2026-03-13', '002', {
      verdict: {
        issues: [
          { title: 'B', severity: 'WARNING' },
          { title: 'C', severity: 'WARNING' },
          { title: 'D', severity: 'WARNING' },
        ],
      },
    });
    await makeSession(tmpDir, '2026-03-13', '003', {
      verdict: { issues: [{ title: 'E', severity: 'SUGGESTION' }, { title: 'F', severity: 'SUGGESTION' }] },
    });

    const result = await listSessions(tmpDir, { sort: 'issues', limit: 10 });
    expect(result).toHaveLength(3);
    // First should be the session with 3 issues
    expect(result[0].sessionId).toBe('002');
    expect(result[1].sessionId).toBe('003');
    expect(result[2].sessionId).toBe('001');
  });

  it('returns empty array when no sessions match filter', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });

    const result = await listSessions(tmpDir, { status: 'failed' });
    expect(result).toEqual([]);
  });

  it('respects limit after filtering', async () => {
    for (let i = 1; i <= 5; i++) {
      await makeSession(tmpDir, '2026-03-13', String(i).padStart(3, '0'), { status: 'completed' });
    }

    const result = await listSessions(tmpDir, { status: 'completed', limit: 3 });
    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// getSessionStats
// ============================================================================

describe('getSessionStats', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-stats-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns zeros for empty sessions dir', async () => {
    const stats = await getSessionStats(tmpDir);
    expect(stats.totalSessions).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.inProgress).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.severityDistribution).toEqual({});
  });

  it('counts sessions by status', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '003', { status: 'failed' });
    await makeSession(tmpDir, '2026-03-13', '004', { status: 'in_progress' });

    const stats = await getSessionStats(tmpDir);
    expect(stats.totalSessions).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.inProgress).toBe(1);
  });

  it('calculates success rate', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '003', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '004', { status: 'failed' });

    const stats = await getSessionStats(tmpDir);
    expect(stats.successRate).toBe(75);
  });

  it('aggregates severity distribution from verdicts', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', {
      status: 'completed',
      verdict: {
        issues: [
          { title: 'A', severity: 'CRITICAL' },
          { title: 'B', severity: 'WARNING' },
        ],
      },
    });
    await makeSession(tmpDir, '2026-03-13', '002', {
      status: 'completed',
      verdict: {
        issues: [
          { title: 'C', severity: 'CRITICAL' },
          { title: 'D', severity: 'SUGGESTION' },
        ],
      },
    });

    const stats = await getSessionStats(tmpDir);
    expect(stats.severityDistribution['CRITICAL']).toBe(2);
    expect(stats.severityDistribution['WARNING']).toBe(1);
    expect(stats.severityDistribution['SUGGESTION']).toBe(1);
  });

  it('handles sessions without verdicts gracefully', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'failed' });

    const stats = await getSessionStats(tmpDir);
    expect(stats.totalSessions).toBe(2);
    expect(stats.severityDistribution).toEqual({});
  });

  it('calculates 100% success rate when all completed', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'completed' });

    const stats = await getSessionStats(tmpDir);
    expect(stats.successRate).toBe(100);
  });
});

// ============================================================================
// formatSessionStats
// ============================================================================

describe('formatSessionStats', () => {
  it('includes total sessions count', () => {
    const stats: SessionStats = {
      totalSessions: 42,
      completed: 38,
      failed: 3,
      inProgress: 1,
      successRate: 90.5,
      severityDistribution: {},
    };
    const output = formatSessionStats(stats);
    expect(output).toContain('42');
  });

  it('includes success rate percentage', () => {
    const stats: SessionStats = {
      totalSessions: 10,
      completed: 9,
      failed: 1,
      inProgress: 0,
      successRate: 90,
      severityDistribution: {},
    };
    const output = formatSessionStats(stats);
    expect(output).toContain('90.0%');
  });

  it('includes severity distribution', () => {
    const stats: SessionStats = {
      totalSessions: 5,
      completed: 5,
      failed: 0,
      inProgress: 0,
      successRate: 100,
      severityDistribution: {
        CRITICAL: 3,
        WARNING: 7,
        SUGGESTION: 12,
      },
    };
    const output = formatSessionStats(stats);
    expect(output).toContain('3');
    expect(output).toContain('7');
    expect(output).toContain('12');
  });

  it('includes Review Statistics header', () => {
    const stats: SessionStats = {
      totalSessions: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      successRate: 0,
      severityDistribution: {},
    };
    const output = formatSessionStats(stats);
    expect(output).toContain('Review Statistics');
  });

  it('shows no issues message when severity distribution is empty', () => {
    const stats: SessionStats = {
      totalSessions: 1,
      completed: 1,
      failed: 0,
      inProgress: 0,
      successRate: 100,
      severityDistribution: {},
    };
    const output = formatSessionStats(stats);
    expect(output).toContain('No issues recorded.');
  });

  it('includes completed and failed counts', () => {
    const stats: SessionStats = {
      totalSessions: 10,
      completed: 7,
      failed: 2,
      inProgress: 1,
      successRate: 70,
      severityDistribution: {},
    };
    const output = formatSessionStats(stats);
    // Strip ANSI color codes for checking numbers
    const stripped = output.replace(/\x1B\[[0-9;]*m/g, '');
    expect(stripped).toContain('7');
    expect(stripped).toContain('2');
  });
});

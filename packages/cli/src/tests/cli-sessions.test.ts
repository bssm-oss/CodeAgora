/**
 * CLI Sessions Tests
 * Tests pruneSessions() and formatSessionStats() from commands/sessions.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pruneSessions, formatSessionStats } from '../commands/sessions.js';
import type { SessionStats } from '../commands/sessions.js';
import fs from 'fs/promises';

// ============================================================================
// Helpers
// ============================================================================

function makeStats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    totalSessions: 10,
    completed: 8,
    failed: 1,
    inProgress: 1,
    interrupted: 0,
    successRate: 80.0,
    severityDistribution: {
      CRITICAL: 3,
      WARNING: 5,
    },
    ...overrides,
  };
}

// ============================================================================
// pruneSessions
// ============================================================================

describe('pruneSessions()', () => {
  let readdirCalls: string[] = [];
  let statMap: Map<string, { isDirectory: () => boolean }>;
  let sessionIdsMap: Map<string, string[]>;
  let rmCalls: string[] = [];
  let rmdirCalls: string[] = [];

  beforeEach(() => {
    readdirCalls = [];
    rmCalls = [];
    rmdirCalls = [];
    statMap = new Map();
    sessionIdsMap = new Map();

    vi.spyOn(fs, 'readdir').mockImplementation(async (p) => {
      const pathStr = String(p);
      readdirCalls.push(pathStr);
      // Root sessions dir returns date dirs
      if (pathStr.endsWith('/sessions')) {
        return ['2020-01-01', '2020-01-02', '9999-12-31'] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      }
      // Specific date dir returns session ids
      const sessionIds = sessionIdsMap.get(pathStr);
      if (sessionIds !== undefined) {
        return sessionIds as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      }
      return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
    });

    vi.spyOn(fs, 'stat').mockImplementation(async (p) => {
      const pathStr = String(p);
      const entry = statMap.get(pathStr);
      if (entry) return entry as unknown as Awaited<ReturnType<typeof fs.stat>>;
      return { isDirectory: () => true } as unknown as Awaited<ReturnType<typeof fs.stat>>;
    });

    vi.spyOn(fs, 'rm').mockImplementation(async (p) => {
      rmCalls.push(String(p));
    });

    vi.spyOn(fs, 'rmdir').mockImplementation(async (p) => {
      rmdirCalls.push(String(p));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns {deleted:0, errors:0} when sessions dir does not exist', async () => {
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('ENOENT'));
    const result = await pruneSessions('/tmp/base', 30);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('deletes sessions in date dirs older than maxAgeDays', async () => {
    sessionIdsMap.set('/tmp/base/.ca/sessions/2020-01-01', ['sess-a', 'sess-b']);
    sessionIdsMap.set('/tmp/base/.ca/sessions/2020-01-02', ['sess-c']);

    const result = await pruneSessions('/tmp/base', 30);

    // 3 sessions deleted (2 from 2020-01-01 + 1 from 2020-01-02)
    expect(result.deleted).toBe(3);
    expect(result.errors).toBe(0);
    expect(rmCalls).toHaveLength(3);
  });

  it('skips date dirs not older than the cutoff', async () => {
    // '9999-12-31' is in the future — should be skipped
    sessionIdsMap.set('/tmp/base/.ca/sessions/9999-12-31', ['sess-future']);

    const result = await pruneSessions('/tmp/base', 30);
    // Only dates older than cutoff are pruned; '9999-12-31' is skipped
    expect(result.deleted).toBe(0);
  });

  it('counts errors when rm throws', async () => {
    sessionIdsMap.set('/tmp/base/.ca/sessions/2020-01-01', ['sess-fail']);
    vi.spyOn(fs, 'rm').mockRejectedValue(new Error('Permission denied'));

    const result = await pruneSessions('/tmp/base', 30);
    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('removes empty date directories after session deletion', async () => {
    sessionIdsMap.set('/tmp/base/.ca/sessions/2020-01-01', ['sess-x']);
    // After deletion, readdir of the date dir returns empty
    vi.spyOn(fs, 'readdir')
      .mockImplementationOnce(async () => ['2020-01-01'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockImplementationOnce(async () => ['sess-x'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockImplementationOnce(async () => [] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    await pruneSessions('/tmp/base', 30);
    expect(rmdirCalls.length).toBeGreaterThan(0);
  });

  it('skips non-directory entries', async () => {
    statMap.set('/tmp/base/.ca/sessions/2020-01-01', { isDirectory: () => false });

    const result = await pruneSessions('/tmp/base', 30);
    expect(result.deleted).toBe(0);
  });

  it('respects maxAgeDays parameter (default 30)', async () => {
    sessionIdsMap.set('/tmp/base/.ca/sessions/2020-01-01', ['sess-a']);
    const result = await pruneSessions('/tmp/base'); // default 30
    expect(result.deleted).toBe(1);
  });
});

// ============================================================================
// formatSessionStats
// ============================================================================

describe('formatSessionStats()', () => {
  it('includes "Review Statistics" header', () => {
    const output = formatSessionStats(makeStats());
    expect(output).toContain('Review Statistics');
  });

  it('displays total sessions count', () => {
    const output = formatSessionStats(makeStats({ totalSessions: 42 }));
    expect(output).toContain('42');
  });

  it('displays success rate percentage', () => {
    const output = formatSessionStats(makeStats({ totalSessions: 10, completed: 8, successRate: 80.0 }));
    expect(output).toContain('80.0%');
  });

  it('shows failure count', () => {
    const output = formatSessionStats(makeStats({ failed: 3 }));
    expect(output).toContain('3');
  });

  it('shows in-progress count', () => {
    const output = formatSessionStats(makeStats({ inProgress: 2 }));
    expect(output).toContain('2');
  });

  it('shows "Severity Distribution" section header', () => {
    const output = formatSessionStats(makeStats());
    expect(output).toContain('Severity Distribution');
  });

  it('shows "No issues recorded." when severityDistribution is empty', () => {
    const output = formatSessionStats(makeStats({ severityDistribution: {} }));
    expect(output).toContain('No issues recorded.');
  });

  it('displays each severity key and its count', () => {
    const output = formatSessionStats(
      makeStats({
        severityDistribution: {
          CRITICAL: 5,
          WARNING: 12,
          SUGGESTION: 3,
        },
      }),
    );
    expect(output).toContain('5');
    expect(output).toContain('12');
    expect(output).toContain('3');
  });

  it('shows 0.0% success rate when totalSessions is 0', () => {
    const output = formatSessionStats(
      makeStats({ totalSessions: 0, completed: 0, failed: 0, inProgress: 0, successRate: 0 }),
    );
    expect(output).toContain('0.0%');
  });

  it('uses 0% for failed/inProgress pct when totalSessions is 0', () => {
    const output = formatSessionStats(
      makeStats({ totalSessions: 0, failed: 0, inProgress: 0, successRate: 0 }),
    );
    // No percentage expressions should appear for failed/inProgress when total is 0
    // The pct() helper returns '' when totalSessions === 0
    expect(output).not.toContain('NaN');
  });
});

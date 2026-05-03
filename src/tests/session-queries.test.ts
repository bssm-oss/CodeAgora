/**
 * #184 Session Queries Tests
 * Verifies listSessions and getSessionStats in @codeagora/core/session/queries.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listSessions, getSessionStats, showSession } from '@codeagora/core/session/queries.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SESSION_ARTIFACT_SCHEMA_VERSION } from '@codeagora/shared/contracts/stable.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_BASE = path.join(os.tmpdir(), `codeagora-session-queries-${process.pid}`);

async function createSession(
  date: string,
  sessionId: string,
  metadata: Record<string, unknown>,
  verdict?: Record<string, unknown>
): Promise<void> {
  const sessionDir = path.join(TEST_BASE, '.ca', 'sessions', date, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata), 'utf-8');
  if (verdict) {
    await fs.writeFile(path.join(sessionDir, 'head-verdict.json'), JSON.stringify(verdict), 'utf-8');
  }
}

// ============================================================================
// listSessions
// ============================================================================

describe('stable session artifact contract', () => {
  it('declares a versioned session artifact schema marker', () => {
    expect(SESSION_ARTIFACT_SCHEMA_VERSION).toBe('codeagora.session.v1');
  });
});

// ============================================================================
// listSessions
// ============================================================================

describe('listSessions', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_BASE, { recursive: true, force: true });
  });

  it('returns empty array when sessions directory does not exist', async () => {
    const result = await listSessions(TEST_BASE);
    expect(result).toEqual([]);
  });

  it('returns sessions sorted newest first', async () => {
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-12', '001', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'failed' });

    const result = await listSessions(TEST_BASE, { limit: 10 });

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2026-01-12');
    expect(result[1].date).toBe('2026-01-11');
    expect(result[2].date).toBe('2026-01-10');
  });

  it('respects the limit option', async () => {
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'completed' });
    await createSession('2026-01-12', '001', { status: 'completed' });

    const result = await listSessions(TEST_BASE, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('filters by status', async () => {
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'failed' });
    await createSession('2026-01-12', '001', { status: 'completed' });

    const result = await listSessions(TEST_BASE, { status: 'completed', limit: 10 });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.status === 'completed')).toBe(true);
  });

  it('filters by date range: after', async () => {
    await createSession('2026-01-09', '001', { status: 'completed' });
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'completed' });

    const result = await listSessions(TEST_BASE, { after: '2026-01-10', limit: 10 });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.date >= '2026-01-10')).toBe(true);
  });

  it('filters by date range: before', async () => {
    await createSession('2026-01-09', '001', { status: 'completed' });
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'completed' });

    const result = await listSessions(TEST_BASE, { before: '2026-01-10', limit: 10 });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.date <= '2026-01-10')).toBe(true);
  });

  it('returns session entries with correct structure', async () => {
    await createSession('2026-01-15', '001', { status: 'completed' });

    const result = await listSessions(TEST_BASE, { limit: 5 });
    expect(result).toHaveLength(1);

    const entry = result[0];
    expect(entry.id).toBe('2026-01-15/001');
    expect(entry.date).toBe('2026-01-15');
    expect(entry.sessionId).toBe('001');
    expect(entry.status).toBe('completed');
    expect(entry.dirPath).toContain('2026-01-15');
  });

  it('uses "unknown" status when metadata.json is missing', async () => {
    const sessionDir = path.join(TEST_BASE, '.ca', 'sessions', '2026-01-20', '001');
    await fs.mkdir(sessionDir, { recursive: true });
    // No metadata.json written

    const result = await listSessions(TEST_BASE, { limit: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unknown');
  });

  it('classifies sessions without schemaVersion as legacy best-effort in details', async () => {
    await createSession('2026-01-21', '001', { status: 'completed', diffPath: '/tmp/legacy.diff' });

    const detail = await showSession(TEST_BASE, '2026-01-21/001');

    expect(detail.metadata?.['schemaVersion']).toBeUndefined();
    expect(detail.metadata?.['artifactContract']).toBe('legacy/best-effort');
  });

  it('sorts by status when sort=status', async () => {
    await createSession('2026-01-10', '001', { status: 'failed' });
    await createSession('2026-01-11', '001', { status: 'completed' });
    await createSession('2026-01-12', '001', { status: 'failed' });

    const result = await listSessions(TEST_BASE, { sort: 'status', limit: 10 });
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('failed');
    expect(result[2].status).toBe('failed');
  });
});

// ============================================================================
// getSessionStats
// ============================================================================

describe('getSessionStats', () => {
  beforeEach(async () => {
    await fs.rm(TEST_BASE, { recursive: true, force: true });
    await fs.mkdir(TEST_BASE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_BASE, { recursive: true, force: true });
  });

  it('returns zero stats when sessions directory does not exist', async () => {
    const stats = await getSessionStats(TEST_BASE);
    expect(stats.totalSessions).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.inProgress).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.severityDistribution).toEqual({});
  });

  it('counts sessions by status correctly', async () => {
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-10', '002', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'failed' });
    await createSession('2026-01-11', '002', { status: 'in_progress' });

    const stats = await getSessionStats(TEST_BASE);
    expect(stats.totalSessions).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.inProgress).toBe(1);
  });

  it('calculates successRate correctly', async () => {
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-10', '002', { status: 'completed' });
    await createSession('2026-01-11', '001', { status: 'failed' });
    await createSession('2026-01-11', '002', { status: 'failed' });

    const stats = await getSessionStats(TEST_BASE);
    // 2 completed / 4 total = 50.0%
    expect(stats.successRate).toBe(50.0);
  });

  it('aggregates severity distribution from verdict files', async () => {
    await createSession(
      '2026-01-10',
      '001',
      { status: 'completed' },
      {
        issues: [
          { title: 'Issue A', severity: 'CRITICAL' },
          { title: 'Issue B', severity: 'WARNING' },
          { title: 'Issue C', severity: 'CRITICAL' },
        ],
      }
    );
    await createSession(
      '2026-01-10',
      '002',
      { status: 'completed' },
      {
        issues: [
          { title: 'Issue D', severity: 'WARNING' },
          { title: 'Issue E', severity: 'SUGGESTION' },
        ],
      }
    );

    const stats = await getSessionStats(TEST_BASE);
    expect(stats.severityDistribution['CRITICAL']).toBe(2);
    expect(stats.severityDistribution['WARNING']).toBe(2);
    expect(stats.severityDistribution['SUGGESTION']).toBe(1);
  });

  it('handles successRate with one decimal precision', async () => {
    // 1 out of 3 = 33.3%
    await createSession('2026-01-10', '001', { status: 'completed' });
    await createSession('2026-01-10', '002', { status: 'failed' });
    await createSession('2026-01-10', '003', { status: 'failed' });

    const stats = await getSessionStats(TEST_BASE);
    expect(stats.successRate).toBe(33.3);
  });
});

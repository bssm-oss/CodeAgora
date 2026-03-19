/**
 * CLI Sessions Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import {
  listSessions,
  showSession,
  diffSessions,
  formatSessionList,
  formatSessionDetail,
  formatSessionDiff,
  type SessionEntry,
  type SessionDetail,
  type SessionDiff,
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
// listSessions
// ============================================================================

describe('listSessions()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-sessions-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for empty base directory', async () => {
    const result = await listSessions(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when .ca/sessions/ does not exist', async () => {
    const result = await listSessions(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns sessions when they exist', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });
    await makeSession(tmpDir, '2026-03-13', '002', { status: 'failed' });

    const result = await listSessions(tmpDir);
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain('2026-03-13/001');
    expect(ids).toContain('2026-03-13/002');
  });

  it('includes correct fields on each entry', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });

    const result = await listSessions(tmpDir);
    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.id).toBe('2026-03-13/001');
    expect(entry.date).toBe('2026-03-13');
    expect(entry.sessionId).toBe('001');
    expect(entry.status).toBe('completed');
    expect(typeof entry.dirPath).toBe('string');
  });

  it('applies limit option', async () => {
    await makeSession(tmpDir, '2026-03-11', '001');
    await makeSession(tmpDir, '2026-03-12', '001');
    await makeSession(tmpDir, '2026-03-13', '001');

    const result = await listSessions(tmpDir, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('defaults to limit 10', async () => {
    for (let i = 1; i <= 12; i++) {
      const sessionId = String(i).padStart(3, '0');
      await makeSession(tmpDir, '2026-03-13', sessionId);
    }

    const result = await listSessions(tmpDir);
    expect(result).toHaveLength(10);
  });

  it('returns newest sessions first (by date)', async () => {
    await makeSession(tmpDir, '2026-03-11', '001');
    await makeSession(tmpDir, '2026-03-13', '001');
    await makeSession(tmpDir, '2026-03-12', '001');

    const result = await listSessions(tmpDir);
    expect(result[0].date).toBe('2026-03-13');
    expect(result[1].date).toBe('2026-03-12');
    expect(result[2].date).toBe('2026-03-11');
  });

  it('reads status from metadata.json', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'failed' });

    const result = await listSessions(tmpDir);
    expect(result[0].status).toBe('failed');
  });

  it('uses "unknown" status when metadata.json is missing', async () => {
    // Create session dir without metadata
    const sessionDir = path.join(tmpDir, '.ca', 'sessions', '2026-03-13', '001');
    await fs.mkdir(sessionDir, { recursive: true });

    const result = await listSessions(tmpDir);
    expect(result[0].status).toBe('unknown');
  });
});

// ============================================================================
// showSession
// ============================================================================

describe('showSession()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-sessions-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns SessionDetail for a valid session', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });

    const detail = await showSession(tmpDir, '2026-03-13/001');
    expect(detail.entry.id).toBe('2026-03-13/001');
    expect(detail.entry.status).toBe('completed');
    expect(detail.metadata).toBeDefined();
  });

  it('includes metadata from metadata.json', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', { status: 'completed' });

    const detail = await showSession(tmpDir, '2026-03-13/001');
    expect(detail.metadata).toBeDefined();
    expect(detail.metadata!['status']).toBe('completed');
    expect(detail.metadata!['diffPath']).toBe('/tmp/test.patch');
  });

  it('includes verdict from head-verdict.json when present', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', {
      verdict: { issues: [{ title: 'Missing null check' }] },
    });

    const detail = await showSession(tmpDir, '2026-03-13/001');
    expect(detail.verdict).toBeDefined();
    expect(Array.isArray((detail.verdict as Record<string, unknown>)['issues'])).toBe(true);
  });

  it('has undefined verdict when head-verdict.json is absent', async () => {
    await makeSession(tmpDir, '2026-03-13', '001');

    const detail = await showSession(tmpDir, '2026-03-13/001');
    expect(detail.verdict).toBeUndefined();
  });

  it('throws for a non-existent session', async () => {
    await expect(showSession(tmpDir, '2026-03-13/999')).rejects.toThrow(
      /Session not found/
    );
  });

  it('throws for invalid session path format', async () => {
    await expect(showSession(tmpDir, 'invalid')).rejects.toThrow();
  });
});

// ============================================================================
// diffSessions
// ============================================================================

describe('diffSessions()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-sessions-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns zero changes when comparing identical sessions', async () => {
    const verdict = { issues: [{ title: 'Issue A' }, { title: 'Issue B' }] };
    await makeSession(tmpDir, '2026-03-13', '001', { verdict });
    await makeSession(tmpDir, '2026-03-13', '002', { verdict });

    const diff = await diffSessions(tmpDir, '2026-03-13/001', '2026-03-13/002');
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(2);
  });

  it('detects added issues in session2', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', {
      verdict: { issues: [{ title: 'Issue A' }] },
    });
    await makeSession(tmpDir, '2026-03-13', '002', {
      verdict: { issues: [{ title: 'Issue A' }, { title: 'Issue B' }] },
    });

    const diff = await diffSessions(tmpDir, '2026-03-13/001', '2026-03-13/002');
    expect(diff.added).toContain('Issue B');
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it('detects removed issues (resolved in session2)', async () => {
    await makeSession(tmpDir, '2026-03-13', '001', {
      verdict: { issues: [{ title: 'Issue A' }, { title: 'Issue B' }] },
    });
    await makeSession(tmpDir, '2026-03-13', '002', {
      verdict: { issues: [{ title: 'Issue A' }] },
    });

    const diff = await diffSessions(tmpDir, '2026-03-13/001', '2026-03-13/002');
    expect(diff.removed).toContain('Issue B');
    expect(diff.added).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it('handles sessions with no verdicts', async () => {
    await makeSession(tmpDir, '2026-03-13', '001');
    await makeSession(tmpDir, '2026-03-13', '002');

    const diff = await diffSessions(tmpDir, '2026-03-13/001', '2026-03-13/002');
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
  });

  it('throws if session1 does not exist', async () => {
    await makeSession(tmpDir, '2026-03-13', '002');
    await expect(
      diffSessions(tmpDir, '2026-03-13/999', '2026-03-13/002')
    ).rejects.toThrow(/Session not found/);
  });

  it('returns correct session1 and session2 fields', async () => {
    await makeSession(tmpDir, '2026-03-13', '001');
    await makeSession(tmpDir, '2026-03-13', '002');

    const diff = await diffSessions(tmpDir, '2026-03-13/001', '2026-03-13/002');
    expect(diff.session1).toBe('2026-03-13/001');
    expect(diff.session2).toBe('2026-03-13/002');
  });
});

// ============================================================================
// formatSessionList
// ============================================================================

describe('formatSessionList()', () => {
  it('returns "No sessions found." for empty array', () => {
    expect(formatSessionList([])).toBe('No sessions found.');
  });

  it('includes header row with Session, Date, Status', () => {
    const sessions: SessionEntry[] = [
      { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
    ];
    const output = formatSessionList(sessions);
    expect(output).toContain('Session');
    expect(output).toContain('Date');
    expect(output).toContain('Status');
  });

  it('includes a divider line', () => {
    const sessions: SessionEntry[] = [
      { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
    ];
    const output = formatSessionList(sessions);
    expect(output).toContain('\u2500');
  });

  it('includes session id, date, and status for each entry', () => {
    const sessions: SessionEntry[] = [
      { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'success', dirPath: '/tmp/x' },
    ];
    const output = formatSessionList(sessions);
    expect(output).toContain('2026-03-13/001');
    expect(output).toContain('2026-03-13');
    expect(output).toContain('success');
  });

  it('renders multiple sessions', () => {
    const sessions: SessionEntry[] = [
      { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
      { id: '2026-03-12/001', date: '2026-03-12', sessionId: '001', status: 'failed', dirPath: '/tmp/y' },
    ];
    const output = formatSessionList(sessions);
    expect(output).toContain('2026-03-13/001');
    expect(output).toContain('2026-03-12/001');
    expect(output).toContain('failed');
  });
});

// ============================================================================
// formatSessionDetail
// ============================================================================

describe('formatSessionDetail()', () => {
  it('includes session id', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
    };
    expect(formatSessionDetail(detail)).toContain('2026-03-13/001');
  });

  it('includes status', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
    };
    expect(formatSessionDetail(detail)).toContain('completed');
  });

  it('includes date', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
    };
    expect(formatSessionDetail(detail)).toContain('2026-03-13');
  });

  it('includes diffPath from metadata when present', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
      metadata: { diffPath: '/path/to/my.patch', status: 'completed' },
    };
    expect(formatSessionDetail(detail)).toContain('/path/to/my.patch');
  });

  it('includes issue count when verdict is present', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'completed', dirPath: '/tmp/x' },
      verdict: { issues: [{ title: 'Issue A' }, { title: 'Issue B' }] },
    };
    const output = formatSessionDetail(detail);
    expect(output).toContain('Issues:');
    expect(output).toContain('2');
  });

  it('works without metadata or verdict', () => {
    const detail: SessionDetail = {
      entry: { id: '2026-03-13/001', date: '2026-03-13', sessionId: '001', status: 'unknown', dirPath: '/tmp/x' },
    };
    const output = formatSessionDetail(detail);
    expect(output).toContain('Session: 2026-03-13/001');
  });
});

// ============================================================================
// formatSessionDiff
// ============================================================================

describe('formatSessionDiff()', () => {
  it('includes both session identifiers', () => {
    const diff: SessionDiff = {
      session1: '2026-03-13/001',
      session2: '2026-03-13/002',
      added: [],
      removed: [],
      unchanged: 5,
    };
    const output = formatSessionDiff(diff);
    expect(output).toContain('2026-03-13/001');
    expect(output).toContain('2026-03-13/002');
  });

  it('shows summary counts', () => {
    const diff: SessionDiff = {
      session1: '2026-03-13/001',
      session2: '2026-03-13/002',
      added: ['New issue'],
      removed: ['Old issue', 'Another old'],
      unchanged: 3,
    };
    const output = formatSessionDiff(diff);
    expect(output).toContain('New: 1');
    expect(output).toContain('Resolved: 2');
    expect(output).toContain('Unchanged: 3');
  });

  it('lists added issues', () => {
    const diff: SessionDiff = {
      session1: '2026-03-13/001',
      session2: '2026-03-13/002',
      added: ['Missing null check'],
      removed: [],
      unchanged: 0,
    };
    const output = formatSessionDiff(diff);
    expect(output).toContain('Missing null check');
    expect(output).toContain('+');
  });

  it('lists removed issues', () => {
    const diff: SessionDiff = {
      session1: '2026-03-13/001',
      session2: '2026-03-13/002',
      added: [],
      removed: ['Old bug'],
      unchanged: 0,
    };
    const output = formatSessionDiff(diff);
    expect(output).toContain('Old bug');
    expect(output).toContain('-');
  });

  it('handles no changes gracefully', () => {
    const diff: SessionDiff = {
      session1: '2026-03-13/001',
      session2: '2026-03-13/002',
      added: [],
      removed: [],
      unchanged: 5,
    };
    const output = formatSessionDiff(diff);
    expect(output).toContain('New: 0');
    expect(output).toContain('Resolved: 0');
    expect(output).toContain('Unchanged: 5');
  });
});

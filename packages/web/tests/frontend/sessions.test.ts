/**
 * Session Browser — Utility Function Tests
 * Tests filterSessions, sortSessions, compareSessions, and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  filterSessions,
  sortSessions,
  compareSessions,
  formatDuration,
  countActiveFilters,
} from '../../src/frontend/utils/session-filters.js';
import type {
  SessionMetadata,
  SessionFilters,
  SessionDetail,
} from '../../src/frontend/utils/session-filters.js';

// ============================================================================
// Test Data
// ============================================================================

const session1: SessionMetadata = {
  sessionId: '001',
  date: '2025-01-15',
  timestamp: 1705312800000,
  diffPath: 'src/main.ts',
  status: 'completed',
  startedAt: 1705312800000,
  completedAt: 1705312860000, // 60 seconds
};

const session2: SessionMetadata = {
  sessionId: '002',
  date: '2025-01-16',
  timestamp: 1705399200000,
  diffPath: 'lib/utils.ts',
  status: 'failed',
  startedAt: 1705399200000,
  completedAt: 1705399230000, // 30 seconds
};

const session3: SessionMetadata = {
  sessionId: '003',
  date: '2025-01-16',
  timestamp: 1705399300000,
  diffPath: 'src/config.ts',
  status: 'in_progress',
  startedAt: 1705399300000,
};

const session4: SessionMetadata = {
  sessionId: '004',
  date: '2025-01-17',
  timestamp: 1705485600000,
  diffPath: 'test/app.test.ts',
  status: 'completed',
  startedAt: 1705485600000,
  completedAt: 1705485780000, // 180 seconds
};

const allSessions: SessionMetadata[] = [session1, session2, session3, session4];

const defaultFilters: SessionFilters = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

// ============================================================================
// filterSessions Tests
// ============================================================================

describe('filterSessions', () => {
  it('should return all sessions with default filters', () => {
    const result = filterSessions(allSessions, defaultFilters);
    expect(result).toHaveLength(4);
  });

  it('should filter by text search matching sessionId', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, search: '002' });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('002');
  });

  it('should filter by text search matching diffPath', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, search: 'utils' });
    expect(result).toHaveLength(1);
    expect(result[0].diffPath).toBe('lib/utils.ts');
  });

  it('should filter by text search matching date', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, search: '2025-01-16' });
    expect(result).toHaveLength(2);
  });

  it('should filter by text search case-insensitively', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, search: 'MAIN' });
    expect(result).toHaveLength(1);
    expect(result[0].diffPath).toBe('src/main.ts');
  });

  it('should filter by status', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, status: 'completed' });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.status === 'completed')).toBe(true);
  });

  it('should filter by status: failed', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, status: 'failed' });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('002');
  });

  it('should filter by status: in_progress', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, status: 'in_progress' });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('003');
  });

  it('should filter by date range — from', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, dateFrom: '2025-01-16' });
    expect(result).toHaveLength(3);
  });

  it('should filter by date range — to', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, dateTo: '2025-01-15' });
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-01-15');
  });

  it('should filter by date range — from and to', () => {
    const result = filterSessions(allSessions, {
      ...defaultFilters,
      dateFrom: '2025-01-16',
      dateTo: '2025-01-16',
    });
    expect(result).toHaveLength(2);
  });

  it('should combine text search and status filter', () => {
    const result = filterSessions(allSessions, {
      ...defaultFilters,
      search: 'src',
      status: 'completed',
    });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('001');
  });

  it('should return empty array when no sessions match', () => {
    const result = filterSessions(allSessions, { ...defaultFilters, search: 'nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('should handle empty session list', () => {
    const result = filterSessions([], defaultFilters);
    expect(result).toHaveLength(0);
  });

  it('should combine all filters together', () => {
    const result = filterSessions(allSessions, {
      search: '001',
      status: 'completed',
      dateFrom: '2025-01-15',
      dateTo: '2025-01-15',
    });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('001');
  });
});

// ============================================================================
// sortSessions Tests
// ============================================================================

describe('sortSessions', () => {
  it('should sort by date ascending', () => {
    const result = sortSessions(allSessions, 'date', 'asc');
    expect(result[0].date).toBe('2025-01-15');
    expect(result[result.length - 1].date).toBe('2025-01-17');
  });

  it('should sort by date descending', () => {
    const result = sortSessions(allSessions, 'date', 'desc');
    expect(result[0].date).toBe('2025-01-17');
    expect(result[result.length - 1].date).toBe('2025-01-15');
  });

  it('should sort by sessionId ascending', () => {
    const result = sortSessions(allSessions, 'sessionId', 'asc');
    expect(result[0].sessionId).toBe('001');
    expect(result[result.length - 1].sessionId).toBe('004');
  });

  it('should sort by sessionId descending', () => {
    const result = sortSessions(allSessions, 'sessionId', 'desc');
    expect(result[0].sessionId).toBe('004');
    expect(result[result.length - 1].sessionId).toBe('001');
  });

  it('should sort by status ascending', () => {
    const result = sortSessions(allSessions, 'status', 'asc');
    expect(result[0].status).toBe('completed');
    expect(result[result.length - 1].status).toBe('in_progress');
  });

  it('should sort by duration ascending', () => {
    const result = sortSessions(allSessions, 'duration', 'asc');
    // session3 has no completedAt (duration=0), session2=30s, session1=60s, session4=180s
    expect(result[0].sessionId).toBe('003');
    expect(result[1].sessionId).toBe('002');
    expect(result[2].sessionId).toBe('001');
    expect(result[3].sessionId).toBe('004');
  });

  it('should sort by duration descending', () => {
    const result = sortSessions(allSessions, 'duration', 'desc');
    expect(result[0].sessionId).toBe('004');
    expect(result[result.length - 1].sessionId).toBe('003');
  });

  it('should sort by diffPath ascending', () => {
    const result = sortSessions(allSessions, 'diffPath', 'asc');
    expect(result[0].diffPath).toBe('lib/utils.ts');
    expect(result[result.length - 1].diffPath).toBe('test/app.test.ts');
  });

  it('should not mutate the original array', () => {
    const original = [...allSessions];
    sortSessions(allSessions, 'date', 'desc');
    expect(allSessions).toEqual(original);
  });

  it('should handle empty array', () => {
    const result = sortSessions([], 'date', 'asc');
    expect(result).toHaveLength(0);
  });

  it('should handle single session', () => {
    const result = sortSessions([session1], 'date', 'asc');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(session1);
  });
});

// ============================================================================
// compareSessions Tests
// ============================================================================

describe('compareSessions', () => {
  const detail1: SessionDetail = {
    metadata: session1,
    reviews: [
      {
        reviewerId: 'r1',
        model: 'gpt-4',
        group: 'src/',
        rawResponse: '',
        status: 'success',
        issues: [
          { title: 'Missing null check', severity: 'WARNING', file: 'main.ts', line: 10 },
          { title: 'Unused variable', severity: 'SUGGESTION', file: 'main.ts', line: 20 },
        ],
      },
    ],
    discussions: [],
    verdict: null,
  };

  const detail2: SessionDetail = {
    metadata: session2,
    reviews: [
      {
        reviewerId: 'r1',
        model: 'gpt-4',
        group: 'src/',
        rawResponse: '',
        status: 'success',
        issues: [
          { title: 'Missing null check', severity: 'WARNING', file: 'main.ts', line: 10 },
          { title: 'SQL injection risk', severity: 'CRITICAL', file: 'db.ts', line: 5 },
        ],
      },
    ],
    discussions: [],
    verdict: null,
  };

  it('should identify new issues in session2', () => {
    const result = compareSessions(detail1, detail2);
    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].title).toBe('SQL injection risk');
  });

  it('should identify resolved issues from session1', () => {
    const result = compareSessions(detail1, detail2);
    expect(result.resolvedIssues).toHaveLength(1);
    expect(result.resolvedIssues[0].title).toBe('Unused variable');
  });

  it('should identify unchanged issues', () => {
    const result = compareSessions(detail1, detail2);
    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0].title).toBe('Missing null check');
  });

  it('should handle sessions with no issues', () => {
    const emptyDetail: SessionDetail = {
      metadata: session1,
      reviews: [],
      discussions: [],
      verdict: null,
    };
    const result = compareSessions(emptyDetail, emptyDetail);
    expect(result.newIssues).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('should handle issues from verdict', () => {
    const detailWithVerdict: SessionDetail = {
      metadata: session1,
      reviews: [],
      discussions: [],
      verdict: {
        decision: 'REJECT',
        issues: [{ title: 'Critical bug', severity: 'CRITICAL', file: 'app.ts' }],
      },
    };
    const result = compareSessions(detail1, detailWithVerdict);
    expect(result.newIssues).toHaveLength(1);
    expect(result.newIssues[0].title).toBe('Critical bug');
    expect(result.resolvedIssues).toHaveLength(2); // both original issues gone
  });

  it('should handle identical sessions', () => {
    const result = compareSessions(detail1, detail1);
    expect(result.newIssues).toHaveLength(0);
    expect(result.resolvedIssues).toHaveLength(0);
    expect(result.unchanged).toHaveLength(2);
  });
});

// ============================================================================
// formatDuration Tests
// ============================================================================

describe('formatDuration', () => {
  it('should return "--" for zero duration', () => {
    expect(formatDuration(0)).toBe('--');
  });

  it('should return "--" for negative duration', () => {
    expect(formatDuration(-100)).toBe('--');
  });

  it('should format seconds', () => {
    expect(formatDuration(45000)).toBe('45s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

// ============================================================================
// countActiveFilters Tests
// ============================================================================

describe('countActiveFilters', () => {
  it('should return 0 for default filters', () => {
    expect(countActiveFilters(defaultFilters)).toBe(0);
  });

  it('should count search as active', () => {
    expect(countActiveFilters({ ...defaultFilters, search: 'test' })).toBe(1);
  });

  it('should count status as active', () => {
    expect(countActiveFilters({ ...defaultFilters, status: 'completed' })).toBe(1);
  });

  it('should count all active filters', () => {
    expect(countActiveFilters({
      search: 'test',
      status: 'failed',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    })).toBe(4);
  });
});

/**
 * Tests for src/learning/filter.ts
 */

import { describe, it, expect } from 'vitest';
import { applyLearnedPatterns } from '@codeagora/core/learning/filter.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import type { DismissedPattern } from '@codeagora/core/learning/store.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL Injection Risk',
    problem: 'User input is directly interpolated into SQL query.',
    evidence: ['Line 42: query = `SELECT * FROM users WHERE id = ${userId}`'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries.',
    filePath: 'src/db.ts',
    lineRange: [42, 42],
    ...overrides,
  };
}

function makePattern(overrides: Partial<DismissedPattern> = {}): DismissedPattern {
  return {
    pattern: 'sql injection',
    severity: 'CRITICAL',
    dismissCount: 3,
    lastDismissed: '2026-03-01',
    action: 'downgrade',
    ...overrides,
  };
}

// ============================================================================
// suppress action
// ============================================================================

describe('applyLearnedPatterns — suppress', () => {
  it('removes a doc when pattern matches, dismissCount >= threshold, action is suppress', () => {
    const doc = makeDoc();
    const pattern = makePattern({ action: 'suppress', dismissCount: 3 });
    const { filtered, suppressed } = applyLearnedPatterns([doc], [pattern]);
    expect(suppressed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it('does not suppress when dismissCount is below threshold', () => {
    const doc = makeDoc();
    const pattern = makePattern({ action: 'suppress', dismissCount: 2 });
    const { filtered, suppressed } = applyLearnedPatterns([doc], [pattern], 3);
    expect(suppressed).toHaveLength(0);
    expect(filtered).toHaveLength(1);
  });
});

// ============================================================================
// downgrade action
// ============================================================================

describe('applyLearnedPatterns — downgrade', () => {
  it('downgrades CRITICAL to WARNING when pattern matches and threshold met', () => {
    const doc = makeDoc({ severity: 'CRITICAL' });
    const pattern = makePattern({ action: 'downgrade', dismissCount: 5 });
    const { filtered, downgraded } = applyLearnedPatterns([doc], [pattern]);
    expect(downgraded).toHaveLength(1);
    expect(downgraded[0]!.severity).toBe('WARNING');
    expect(filtered).toHaveLength(1); // downgraded docs appear in filtered
    expect(filtered[0]!.severity).toBe('WARNING');
  });

  it('downgrades WARNING to SUGGESTION', () => {
    const doc = makeDoc({ severity: 'WARNING', issueTitle: 'SQL Injection Risk' });
    const pattern = makePattern({ action: 'downgrade', dismissCount: 4 });
    const { downgraded } = applyLearnedPatterns([doc], [pattern]);
    expect(downgraded[0]!.severity).toBe('SUGGESTION');
  });

  it('keeps SUGGESTION at SUGGESTION (no further downgrade)', () => {
    const doc = makeDoc({ severity: 'SUGGESTION', issueTitle: 'SQL Injection Risk' });
    const pattern = makePattern({ action: 'downgrade', dismissCount: 3 });
    const { downgraded } = applyLearnedPatterns([doc], [pattern]);
    expect(downgraded[0]!.severity).toBe('SUGGESTION');
  });

  it('downgrades HARSHLY_CRITICAL to CRITICAL', () => {
    const doc = makeDoc({ severity: 'HARSHLY_CRITICAL', issueTitle: 'SQL Injection Risk' });
    const pattern = makePattern({ action: 'downgrade', dismissCount: 3 });
    const { downgraded } = applyLearnedPatterns([doc], [pattern]);
    expect(downgraded[0]!.severity).toBe('CRITICAL');
  });
});

// ============================================================================
// threshold boundary
// ============================================================================

describe('applyLearnedPatterns — threshold', () => {
  it('does not apply when dismissCount is exactly one below threshold', () => {
    const doc = makeDoc();
    const pattern = makePattern({ dismissCount: 2 });
    const { filtered, suppressed, downgraded } = applyLearnedPatterns([doc], [pattern], 3);
    expect(filtered).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
    expect(downgraded).toHaveLength(0);
  });

  it('applies when dismissCount equals threshold', () => {
    const doc = makeDoc();
    const pattern = makePattern({ dismissCount: 3, action: 'suppress' });
    const { suppressed } = applyLearnedPatterns([doc], [pattern], 3);
    expect(suppressed).toHaveLength(1);
  });

  it('applies when dismissCount exceeds threshold', () => {
    const doc = makeDoc();
    const pattern = makePattern({ dismissCount: 10, action: 'suppress' });
    const { suppressed } = applyLearnedPatterns([doc], [pattern], 3);
    expect(suppressed).toHaveLength(1);
  });

  it('uses custom threshold parameter', () => {
    const doc = makeDoc();
    const pattern = makePattern({ dismissCount: 5, action: 'suppress' });
    // threshold=6 → should NOT suppress
    const r1 = applyLearnedPatterns([doc], [pattern], 6);
    expect(r1.suppressed).toHaveLength(0);
    // threshold=5 → should suppress
    const r2 = applyLearnedPatterns([doc], [pattern], 5);
    expect(r2.suppressed).toHaveLength(1);
  });
});

// ============================================================================
// no matching pattern
// ============================================================================

describe('applyLearnedPatterns — no match', () => {
  it('passes through docs with no matching pattern', () => {
    const doc = makeDoc({ issueTitle: 'Unrelated Issue' });
    const pattern = makePattern({ pattern: 'sql injection' });
    const { filtered, suppressed, downgraded } = applyLearnedPatterns([doc], [pattern]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toBe(doc);
    expect(suppressed).toHaveLength(0);
    expect(downgraded).toHaveLength(0);
  });

  it('passes through all docs when patterns list is empty', () => {
    const docs = [makeDoc(), makeDoc({ issueTitle: 'Another Issue' })];
    const { filtered } = applyLearnedPatterns(docs, []);
    expect(filtered).toHaveLength(2);
  });

  it('passes through docs when pattern list has no qualifying entries (below threshold)', () => {
    const doc = makeDoc();
    const pattern = makePattern({ dismissCount: 1 });
    const { filtered } = applyLearnedPatterns([doc], [pattern], 3);
    expect(filtered).toHaveLength(1);
  });
});

// ============================================================================
// case-insensitive matching
// ============================================================================

describe('applyLearnedPatterns — case insensitivity', () => {
  it('matches pattern case-insensitively against issueTitle', () => {
    const doc = makeDoc({ issueTitle: 'SQL INJECTION RISK' });
    const pattern = makePattern({ pattern: 'sql injection', action: 'suppress', dismissCount: 3 });
    const { suppressed } = applyLearnedPatterns([doc], [pattern]);
    expect(suppressed).toHaveLength(1);
  });
});

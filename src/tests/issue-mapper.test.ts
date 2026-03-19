/**
 * Issue Mapper Tests
 */

import { describe, it, expect } from 'vitest';
import { mapIssuesToLines } from '@codeagora/shared/utils/issue-mapper.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'Something is wrong',
    evidence: ['line 1 evidence'],
    severity: 'WARNING',
    suggestion: 'Fix it',
    filePath: 'src/auth.ts',
    lineRange: [10, 10],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapIssuesToLines', () => {
  it('maps a single issue to the correct line', () => {
    const docs = [makeDoc({ lineRange: [5, 5] })];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(5);
    expect(result[0].title).toBe('Test Issue');
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].filePath).toBe('src/auth.ts');
  });

  it('maps multiple issues for the same file', () => {
    const docs = [
      makeDoc({ issueTitle: 'Issue A', lineRange: [3, 3] }),
      makeDoc({ issueTitle: 'Issue B', lineRange: [7, 7] }),
    ];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Issue A');
    expect(result[1].title).toBe('Issue B');
  });

  it('expands a line range to one entry per line', () => {
    const docs = [makeDoc({ lineRange: [10, 13] })];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.line)).toEqual([10, 11, 12, 13]);
  });

  it('produces multiple entries when two issues share a line', () => {
    const docs = [
      makeDoc({ issueTitle: 'First', lineRange: [5, 5] }),
      makeDoc({ issueTitle: 'Second', lineRange: [5, 5] }),
    ];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });

  it('returns empty array when filePath does not match', () => {
    const docs = [makeDoc({ filePath: 'src/other.ts' })];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty evidenceDocs', () => {
    const result = mapIssuesToLines([], 'src/auth.ts');
    expect(result).toHaveLength(0);
  });

  it('includes evidence and suggestion fields', () => {
    const docs = [makeDoc({ evidence: ['ctx line'], suggestion: 'Do better', lineRange: [1, 1] })];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result[0].evidence).toEqual(['ctx line']);
    expect(result[0].suggestion).toBe('Do better');
  });

  it('omits evidence field when array is empty', () => {
    const docs = [makeDoc({ evidence: [], lineRange: [1, 1] })];
    const result = mapIssuesToLines(docs, 'src/auth.ts');
    expect(result[0].evidence).toBeUndefined();
  });
});

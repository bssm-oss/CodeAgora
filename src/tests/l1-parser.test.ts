/**
 * L1 Evidence Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseEvidenceResponse } from '@codeagora/core/l1/parser.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a well-formed evidence block matching the EVIDENCE_BLOCK_REGEX pattern.
 * Each section header uses the Korean headings expected by the parser.
 */
function makeIssueBlock({
  title = 'Null Pointer Dereference',
  problem = 'In auth.ts:10-20, pointer is dereferenced without null check.',
  evidence = ['1. Pointer is returned from an unchecked call', '2. No guard clause before use'],
  severity = 'CRITICAL',
  suggestion = 'Add a null check before dereferencing the pointer.',
} = {}): string {
  return `## Issue: ${title}

### 문제
${problem}

### 근거
${evidence.join('\n')}

### 심각도
${severity}

### 제안
${suggestion}
`;
}

// ---------------------------------------------------------------------------

describe('parseEvidenceResponse()', () => {
  // -------------------------------------------------------------------------
  // "No issues" short-circuit
  // -------------------------------------------------------------------------

  describe('"no issues" responses return empty array', () => {
    it('returns empty array for "No issues found"', () => {
      expect(parseEvidenceResponse('No issues found')).toHaveLength(0);
    });

    it('returns empty array for "No problems found"', () => {
      expect(parseEvidenceResponse('No problems found in this diff.')).toHaveLength(0);
    });

    it('returns empty array for "looks good"', () => {
      expect(parseEvidenceResponse('The code looks good to me.')).toHaveLength(0);
    });

    it('is case-insensitive for no-issues phrases', () => {
      expect(parseEvidenceResponse('NO ISSUES FOUND')).toHaveLength(0);
      expect(parseEvidenceResponse('LOOKS GOOD')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Single well-formed issue
  // -------------------------------------------------------------------------

  describe('single well-formed issue block', () => {
    it('returns exactly one document', () => {
      const docs = parseEvidenceResponse(makeIssueBlock());
      expect(docs).toHaveLength(1);
    });

    it('parses issueTitle correctly', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ title: 'SQL Injection Vulnerability' }));
      expect(docs[0].issueTitle).toBe('SQL Injection Vulnerability');
    });

    it('parses problem text correctly', () => {
      const problem = 'In service.ts:55, user input is concatenated into a query.';
      const docs = parseEvidenceResponse(makeIssueBlock({ problem }));
      expect(docs[0].problem).toBe(problem);
    });

    it('parses numbered evidence items and strips leading numbers', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({
          evidence: [
            '1. Input is not sanitized',
            '2. Parameterized queries are not used',
            '3. Attack vector is publicly accessible',
          ],
        })
      );
      expect(docs[0].evidence).toHaveLength(3);
      expect(docs[0].evidence[0]).toBe('Input is not sanitized');
      expect(docs[0].evidence[1]).toBe('Parameterized queries are not used');
      expect(docs[0].evidence[2]).toBe('Attack vector is publicly accessible');
    });

    it('parses suggestion text correctly', () => {
      const suggestion = 'Use prepared statements with bound parameters.';
      const docs = parseEvidenceResponse(makeIssueBlock({ suggestion }));
      expect(docs[0].suggestion).toBe(suggestion);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple issues
  // -------------------------------------------------------------------------

  describe('multiple issue blocks', () => {
    it('returns one document per issue block', () => {
      const response = makeIssueBlock({ title: 'Issue Alpha' }) + makeIssueBlock({ title: 'Issue Beta' });
      const docs = parseEvidenceResponse(response);
      expect(docs).toHaveLength(2);
    });

    it('preserves issue order', () => {
      const response =
        makeIssueBlock({ title: 'First Issue' }) +
        makeIssueBlock({ title: 'Second Issue' }) +
        makeIssueBlock({ title: 'Third Issue' });
      const docs = parseEvidenceResponse(response);
      expect(docs[0].issueTitle).toBe('First Issue');
      expect(docs[1].issueTitle).toBe('Second Issue');
      expect(docs[2].issueTitle).toBe('Third Issue');
    });
  });

  // -------------------------------------------------------------------------
  // Severity parsing
  // -------------------------------------------------------------------------

  describe('severity parsing', () => {
    it('parses HARSHLY_CRITICAL correctly', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'HARSHLY_CRITICAL' }));
      expect(docs[0].severity).toBe('HARSHLY_CRITICAL');
    });

    it('parses "HARSHLY CRITICAL" (space variant) as HARSHLY_CRITICAL', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'HARSHLY CRITICAL' }));
      expect(docs[0].severity).toBe('HARSHLY_CRITICAL');
    });

    it('parses CRITICAL correctly', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'CRITICAL' }));
      expect(docs[0].severity).toBe('CRITICAL');
    });

    it('parses WARNING correctly', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'WARNING' }));
      expect(docs[0].severity).toBe('WARNING');
    });

    it('parses SUGGESTION correctly', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'SUGGESTION' }));
      expect(docs[0].severity).toBe('SUGGESTION');
    });

    it('defaults to SUGGESTION for an unrecognised severity string', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'MEDIUM' }));
      expect(docs[0].severity).toBe('SUGGESTION');
    });

    it('is case-insensitive for severity strings', () => {
      const docs = parseEvidenceResponse(makeIssueBlock({ severity: 'critical' }));
      expect(docs[0].severity).toBe('CRITICAL');
    });
  });

  // -------------------------------------------------------------------------
  // File path and line range extraction
  // -------------------------------------------------------------------------

  describe('file path and line range extraction', () => {
    it('extracts file path and line range from "In file.ts:10-20" format', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'In auth.ts:45-50, the check is missing.' })
      );
      expect(docs[0].filePath).toBe('auth.ts');
      expect(docs[0].lineRange).toEqual([45, 50]);
    });

    it('extracts file path and single line from "In file.ts:10" format', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'In utils.ts:30, the value is not validated.' })
      );
      expect(docs[0].filePath).toBe('utils.ts');
      expect(docs[0].lineRange).toEqual([30, 30]);
    });

    it('extracts file path from "file.ts:10-20" format without "In" prefix', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'service.ts:10-20 contains an unsafe assignment.' })
      );
      expect(docs[0].filePath).toBe('service.ts');
      expect(docs[0].lineRange).toEqual([10, 20]);
    });

    it('extracts file path from "In file.ts, line 10" format', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'In router.ts, line 100 the handler is missing.' })
      );
      expect(docs[0].filePath).toBe('router.ts');
      expect(docs[0].lineRange[0]).toBe(100);
    });

    it('extracts file path from "file.ts line 10" (space-separated) format', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'parser.ts line 77 has a type coercion issue.' })
      );
      expect(docs[0].filePath).toBe('parser.ts');
      expect(docs[0].lineRange[0]).toBe(77);
    });

    it('handles path with directory segments (src/auth/login.ts:5-15)', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'In src/auth/login.ts:5-15, tokens are not rotated.' })
      );
      expect(docs[0].filePath).toBe('src/auth/login.ts');
      expect(docs[0].lineRange).toEqual([5, 15]);
    });

    it('falls back to filePath="unknown" and lineRange=[0,0] when no file info is present', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'There is a logic error somewhere in the codebase.' })
      );
      expect(docs[0].filePath).toBe('unknown');
      expect(docs[0].lineRange).toEqual([0, 0]);
    });
  });

  // -------------------------------------------------------------------------
  // Fuzzy file path matching via diffFilePaths
  // -------------------------------------------------------------------------

  describe('fuzzy file path matching', () => {
    it('resolves a short filename to the full path from diffFilePaths', () => {
      const diffFilePaths = ['src/services/auth.ts', 'src/utils/helpers.ts'];
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'The auth.ts module does not validate the token on line 20.' }),
        diffFilePaths
      );
      expect(docs[0].filePath).toBe('src/services/auth.ts');
    });

    it('extracts line number via "line N" when fuzzy-matched path is used', () => {
      const diffFilePaths = ['src/controllers/user.ts'];
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'The user.ts module has a problem on line 42.' }),
        diffFilePaths
      );
      expect(docs[0].filePath).toBe('src/controllers/user.ts');
      expect(docs[0].lineRange[0]).toBe(42);
    });

    it('extracts line range via ":N-M" when fuzzy-matched path is used', () => {
      const diffFilePaths = ['src/models/session.ts'];
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'session.ts:10-25 has a potential memory leak.' }),
        diffFilePaths
      );
      // The primary pattern matches first (no fuzzy needed here), but if fuzzy is used,
      // the range should still be extracted correctly.
      expect(docs[0].lineRange).toEqual([10, 25]);
    });

    it('falls back to lineRange=[1,1] when fuzzy-matched but no line number is extractable', () => {
      const diffFilePaths = ['src/lib/crypto.ts'];
      // Problem text contains "crypto.ts" so fuzzy matching resolves the path,
      // but there is no line number hint in the text.
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'The crypto.ts module has a weak hashing algorithm with no line reference.' }),
        diffFilePaths
      );
      expect(docs[0].filePath).toBe('src/lib/crypto.ts');
      expect(docs[0].lineRange).toEqual([1, 1]);
    });

    it('still returns unknown when diffFilePaths is empty and no pattern matches', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({ problem: 'There is an issue somewhere.' }),
        []
      );
      expect(docs[0].filePath).toBe('unknown');
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / edge-case responses
  // -------------------------------------------------------------------------

  describe('malformed and edge-case responses', () => {
    it('returns empty array for a completely empty response', () => {
      expect(parseEvidenceResponse('')).toHaveLength(0);
    });

    it('returns empty array for a response with no issue blocks', () => {
      expect(parseEvidenceResponse('This is a plain text review with no structured data.')).toHaveLength(0);
    });

    it('skips incomplete blocks (missing required sections) without throwing', () => {
      const malformed = `## Issue: Incomplete Block

### 문제
Some problem text without the remaining sections.
`;
      expect(() => parseEvidenceResponse(malformed)).not.toThrow();
    });

    it('returns one document per complete block when two valid blocks are concatenated', () => {
      // Verifies the regex correctly terminates each block at the next "## Issue:" boundary.
      const first = makeIssueBlock({ title: 'Alpha Issue' });
      const second = makeIssueBlock({ title: 'Beta Issue' });
      const docs = parseEvidenceResponse(first + second);
      const titles = docs.map((d) => d.issueTitle);
      expect(titles).toContain('Alpha Issue');
      expect(titles).toContain('Beta Issue');
    });

    it('ignores non-numbered lines in the 근거 section', () => {
      const docs = parseEvidenceResponse(
        makeIssueBlock({
          evidence: [
            '1. First valid point',
            'This line has no number prefix',
            '2. Second valid point',
            'Another unnumbered line',
          ],
        })
      );
      expect(docs[0].evidence).toHaveLength(2);
      expect(docs[0].evidence[0]).toBe('First valid point');
      expect(docs[0].evidence[1]).toBe('Second valid point');
    });
  });
});

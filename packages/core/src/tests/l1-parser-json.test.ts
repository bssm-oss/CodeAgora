/**
 * L1 Parser — JSON output mode (#463)
 *
 * Covers parseJsonEvidenceResponse directly + parseEvidenceResponse
 * auto-detection / markdown-fallback behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  parseEvidenceResponse,
  parseJsonEvidenceResponse,
} from '../l1/parser.js';

const WELL_FORMED: string = JSON.stringify({
  findings: [
    {
      title: 'SQL Injection',
      filePath: 'src/auth.ts',
      lineRange: [10, 12],
      severity: 'CRITICAL',
      confidence: 85,
      problem: 'User input concatenated without sanitization.',
      evidence: ['Input not validated', 'No parameterized queries'],
      suggestion: 'Use prepared statements.',
    },
  ],
});

describe('parseJsonEvidenceResponse', () => {
  it('parses a well-formed envelope with findings array', () => {
    const docs = parseJsonEvidenceResponse(WELL_FORMED)!;
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('SQL Injection');
    expect(docs[0].severity).toBe('CRITICAL');
    expect(docs[0].confidence).toBe(85);
    expect(docs[0].confidenceTrace).toEqual({ raw: 85 });
    expect(docs[0].filePath).toBe('src/auth.ts');
    expect(docs[0].lineRange).toEqual([10, 12]);
    expect(docs[0].evidence).toHaveLength(2);
  });

  it('accepts a bare root array (no findings wrapper)', () => {
    const bare = JSON.stringify([
      {
        title: 'Null deref',
        filePath: 'src/a.ts',
        lineRange: [5, 5],
        severity: 'WARNING',
        confidence: 60,
        problem: 'Potential null dereference.',
        evidence: ['No null check'],
        suggestion: 'Add guard.',
      },
    ]);
    const docs = parseJsonEvidenceResponse(bare)!;
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('Null deref');
  });

  it('returns empty array for explicit "no findings" envelope', () => {
    const docs = parseJsonEvidenceResponse('{"findings": []}')!;
    expect(docs).toEqual([]);
  });

  it('unwraps ```json ... ``` code fence wrapping', () => {
    const fenced = '```json\n' + WELL_FORMED + '\n```';
    const docs = parseJsonEvidenceResponse(fenced)!;
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('SQL Injection');
  });

  it('unwraps plain ``` code fence (no language tag)', () => {
    const fenced = '```\n' + WELL_FORMED + '\n```';
    const docs = parseJsonEvidenceResponse(fenced)!;
    expect(docs).toHaveLength(1);
  });

  it('drops individual findings that fail Zod validation', () => {
    const mixed = JSON.stringify({
      findings: [
        {
          title: 'Valid one',
          filePath: 'src/a.ts',
          lineRange: [1, 1],
          severity: 'CRITICAL',
          problem: 'p',
          evidence: [],
          suggestion: 's',
        },
        {
          // Missing required fields → dropped
          title: 'Invalid',
          severity: 'NOT_A_SEVERITY',
        },
      ],
    });
    const docs = parseJsonEvidenceResponse(mixed)!;
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('Valid one');
  });

  it('returns null for malformed JSON', () => {
    expect(parseJsonEvidenceResponse('{"findings": [')).toBeNull();
    expect(parseJsonEvidenceResponse('not json at all')).toBeNull();
  });

  it('returns null for markdown responses (no JSON structure)', () => {
    expect(parseJsonEvidenceResponse('## Issue: Something\n\n### Problem\n...')).toBeNull();
    expect(parseJsonEvidenceResponse('No issues found.')).toBeNull();
  });

  it('warns to stderr when all findings fail validation (but still returns [])', () => {
    // #486 self-review: returning [] silently would mask a real reviewer
    // signal as "no issues". Expect stderr warning to aid debugging.
    const originalWrite = process.stderr.write;
    let captured = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr.write as any) = (s: string | Uint8Array): boolean => {
      captured += s.toString();
      return true;
    };
    try {
      const allInvalid = JSON.stringify({
        findings: [
          { title: 'bad', severity: 'NOT_REAL' },
          { wrong_shape: true },
        ],
      });
      const docs = parseJsonEvidenceResponse(allInvalid);
      expect(docs).toEqual([]);
      expect(captured).toMatch(/all failed schema validation/i);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it('returns null for JSON envelope with wrong top-level shape', () => {
    // Object but no `findings` key → union validation rejects
    expect(parseJsonEvidenceResponse('{"reviews": []}')).toBeNull();
    expect(parseJsonEvidenceResponse('42')).toBeNull();
    expect(parseJsonEvidenceResponse('"a string"')).toBeNull();
  });

  it('does not pick up embedded code fences in markdown responses', () => {
    // A markdown response that happens to quote a JSON snippet as evidence
    // should NOT be parsed as JSON output — we only accept whole-response
    // fences, not embedded ones.
    const markdown = `## Issue: Config bug

### Problem
In config.ts:5

The default is set incorrectly.

\`\`\`json
{"findings": [{"title": "should not be picked up"}]}
\`\`\`

### Severity
WARNING (50%)
`;
    expect(parseJsonEvidenceResponse(markdown)).toBeNull();
  });

  it('handles findings with optional fields missing (evidence/suggestion default)', () => {
    const minimal = JSON.stringify({
      findings: [{
        title: 'Terse',
        filePath: 'a.ts',
        lineRange: [1, 1],
        severity: 'SUGGESTION',
        confidence: 40,
        problem: 'Minor style issue',
        // evidence and suggestion omitted
      }],
    });
    const docs = parseJsonEvidenceResponse(minimal)!;
    expect(docs).toHaveLength(1);
    expect(docs[0].evidence).toEqual([]);
    expect(docs[0].suggestion).toBe('');
  });
});

describe('parseEvidenceResponse auto-detection', () => {
  it('uses JSON path when response is valid JSON', () => {
    const docs = parseEvidenceResponse(WELL_FORMED);
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('SQL Injection');
  });

  it('falls back to markdown when JSON parse fails', () => {
    const markdown = `## Issue: Null Pointer

### Problem
In src/foo.ts:10-12

Potential null dereference.

### Evidence
1. No null check
2. Callers can pass null

### Severity
WARNING (60%)

### Suggestion
Add a guard.
`;
    const docs = parseEvidenceResponse(markdown);
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('Null Pointer');
  });

  it('falls back to markdown when response starts with non-JSON text', () => {
    const mixed = 'Thinking...\n## Issue: foo\n### Problem\nIn a.ts:1\ntext\n### Evidence\n1. x\n### Severity\nWARNING (50%)\n### Suggestion\nfix';
    const docs = parseEvidenceResponse(mixed);
    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('foo');
  });

  it('returns [] for empty JSON envelope (no fallback needed)', () => {
    const docs = parseEvidenceResponse('{"findings": []}');
    expect(docs).toEqual([]);
  });
});

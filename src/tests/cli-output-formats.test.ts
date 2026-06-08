/**
 * HTML and JUnit Output Format Tests
 */

import { describe, it, expect } from 'vitest';
import { formatHtml, formatJunit, formatOutput } from '@codeagora/cli/formatters/review-output.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidenceDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL injection vulnerability',
    problem: 'Unparameterized query allows injection',
    evidence: ['User input concatenated directly into SQL string'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries',
    filePath: 'src/auth/login.ts',
    lineRange: [10, 12],
    ...overrides,
  };
}

function makeSuccessResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    sessionId: '001',
    date: '2025-01-15',
    status: 'success',
    summary: {
      decision: 'REJECT',
      reasoning: 'Critical security issues found',
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: {
        HARSHLY_CRITICAL: 0,
        CRITICAL: 1,
        WARNING: 1,
        SUGGESTION: 0,
      },
      topIssues: [
        { severity: 'CRITICAL', filePath: 'src/auth/login.ts', lineRange: [10, 12], title: 'SQL injection vulnerability' },
      ],
      totalDiscussions: 1,
      resolved: 1,
      escalated: 0,
    },
    evidenceDocs: [
      makeEvidenceDoc(),
      makeEvidenceDoc({
        issueTitle: 'Missing rate limiting',
        problem: 'No rate limit on login endpoint',
        severity: 'WARNING',
        suggestion: 'Add rate limiting middleware',
        filePath: 'src/auth/login.ts',
        lineRange: [25, 30],
      }),
    ],
    ...overrides,
  };
}

function makeErrorResult(): PipelineResult {
  return {
    sessionId: '002',
    date: '2025-01-15',
    status: 'error',
    error: 'Pipeline timeout exceeded',
  };
}

function makeEmptyResult(): PipelineResult {
  return {
    sessionId: '003',
    date: '2025-01-15',
    status: 'success',
    summary: {
      decision: 'ACCEPT',
      reasoning: 'No issues found',
      totalReviewers: 2,
      forfeitedReviewers: 0,
      severityCounts: {},
      topIssues: [],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    evidenceDocs: [],
  };
}

// ---------------------------------------------------------------------------
// HTML format tests
// ---------------------------------------------------------------------------

describe('formatHtml()', () => {
  it('produces valid HTML structure', () => {
    const html = formatHtml(makeSuccessResult());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('contains severity CSS classes', () => {
    const html = formatHtml(makeSuccessResult());
    expect(html).toContain('severity-HARSHLY_CRITICAL');
    expect(html).toContain('severity-CRITICAL');
    expect(html).toContain('severity-WARNING');
    expect(html).toContain('severity-SUGGESTION');
  });

  it('renders issues with problem and suggestion', () => {
    const html = formatHtml(makeSuccessResult());
    expect(html).toContain('SQL injection vulnerability');
    expect(html).toContain('Unparameterized query allows injection');
    expect(html).toContain('Use parameterized queries');
    expect(html).toContain('src/auth/login.ts');
  });

  it('renders decision badge', () => {
    const html = formatHtml(makeSuccessResult());
    expect(html).toContain('REJECT');
    expect(html).toContain('Critical security issues found');
  });

  it('handles error result gracefully', () => {
    const html = formatHtml(makeErrorResult());
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('Pipeline timeout exceeded');
    expect(html).toContain('error');
  });

  it('handles empty evidenceDocs without crash', () => {
    const html = formatHtml(makeEmptyResult());
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('ACCEPT');
    // No issues table when no evidence docs and no top issues
    expect(html).not.toContain('<tbody>');
  });

  it('handles result with no summary', () => {
    const result: PipelineResult = {
      sessionId: '004',
      date: '2025-01-15',
      status: 'success',
    };
    const html = formatHtml(result);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('Review completed successfully');
  });

  it('escapes HTML special characters in issue text', () => {
    const doc = makeEvidenceDoc({
      issueTitle: 'XSS via <script> tag',
      problem: 'Input contains <b>HTML</b> & "quotes"',
      suggestion: "Use escapeHtml() for <output> & 'safety'",
    });
    const result = makeSuccessResult({ evidenceDocs: [doc] });
    const html = formatHtml(result);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quotes&quot;');
    expect(html).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// Text format tests
// ---------------------------------------------------------------------------

describe('formatOutput(text)', () => {
  it('adds next-step guidance for completed reviews', () => {
    const text = formatOutput(makeSuccessResult(), 'text');
    expect(text).toContain('Session 2025-01-15/001');
    expect(text).toContain('Next:');
    expect(text).toContain('agora explain 2025-01-15/001');
  });

  it('adds next-step guidance for error reviews', () => {
    const text = formatOutput(makeErrorResult(), 'text');
    expect(text).toContain('Next: run `agora doctor`');
  });
});

// ---------------------------------------------------------------------------
// JUnit XML format tests
// ---------------------------------------------------------------------------

describe('formatJunit()', () => {
  it('produces valid XML structure', () => {
    const xml = formatJunit(makeSuccessResult());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<testsuites>');
    expect(xml).toContain('</testsuites>');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('</testsuite>');
  });

  it('issue count equals failure count', () => {
    const result = makeSuccessResult();
    const xml = formatJunit(result);
    const issueCount = result.evidenceDocs!.length;
    expect(xml).toContain(`tests="${issueCount}"`);
    expect(xml).toContain(`failures="${issueCount}"`);
  });

  it('renders testcase for each issue', () => {
    const xml = formatJunit(makeSuccessResult());
    expect(xml).toContain('name="SQL injection vulnerability"');
    expect(xml).toContain('classname="src/auth/login.ts"');
    expect(xml).toContain('type="CRITICAL"');
    expect(xml).toContain('name="Missing rate limiting"');
  });

  it('escapes XML special characters', () => {
    const doc = makeEvidenceDoc({
      issueTitle: 'XSS via <script> & "quotes"',
      problem: "Input has <b>HTML</b> & 'quotes'",
      suggestion: 'Escape <output> properly',
    });
    const result = makeSuccessResult({ evidenceDocs: [doc] });
    const xml = formatJunit(result);
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quotes&quot;');
    expect(xml).toContain('&apos;quotes&apos;');
    expect(xml).not.toContain('<script>');
    expect(xml).not.toContain('<b>');
  });

  it('handles empty result with 0 failures', () => {
    const xml = formatJunit(makeEmptyResult());
    expect(xml).toContain('tests="0"');
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('<testsuites>');
    expect(xml).toContain('</testsuites>');
  });

  it('handles error result', () => {
    const xml = formatJunit(makeErrorResult());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<testsuites>');
    expect(xml).toContain('</testsuites>');
    expect(xml).toContain('Pipeline timeout exceeded');
    expect(xml).toContain('failures="1"');
  });
});

// ---------------------------------------------------------------------------
// Dispatcher integration
// ---------------------------------------------------------------------------

describe('formatOutput() dispatcher', () => {
  it('dispatches html format', () => {
    const output = formatOutput(makeSuccessResult(), 'html');
    expect(output).toContain('<html');
    expect(output).toContain('</html>');
  });

  it('dispatches junit format', () => {
    const output = formatOutput(makeSuccessResult(), 'junit');
    expect(output).toContain('<?xml');
    expect(output).toContain('<testsuites>');
  });

  it('uses full evidenceDocs for SARIF instead of summary.topIssues', () => {
    const result = makeSuccessResult({
      summary: {
        ...makeSuccessResult().summary!,
        topIssues: [
          { severity: 'CRITICAL', filePath: 'src/auth/login.ts', lineRange: [10, 12], title: 'SQL injection vulnerability' },
        ],
      },
      evidenceDocs: [
        makeEvidenceDoc({ issueTitle: 'First issue', filePath: 'src/one.ts', lineRange: [1, 1] }),
        makeEvidenceDoc({ issueTitle: 'Second issue', filePath: 'src/two.ts', lineRange: [2, 2] }),
        makeEvidenceDoc({ issueTitle: 'Third issue', filePath: 'src/three.ts', lineRange: [3, 3] }),
      ],
    });

    const sarif = JSON.parse(formatOutput(result, 'sarif'));

    expect(sarif.runs[0].results).toHaveLength(3);
    expect(sarif.runs[0].results.map((r: { message: { text: string } }) => r.message.text)).toEqual([
      'First issue',
      'Second issue',
      'Third issue',
    ]);
  });

  it('uses full evidenceDocs for annotated output instead of summary.topIssues', () => {
    const diff = `diff --git a/src/one.ts b/src/one.ts
--- a/src/one.ts
+++ b/src/one.ts
@@ -1,1 +1,2 @@
 const one = 1;
+const two = 2;
diff --git a/src/two.ts b/src/two.ts
--- a/src/two.ts
+++ b/src/two.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const b = 2;
`;
    const result = makeSuccessResult({
      summary: {
        ...makeSuccessResult().summary!,
        topIssues: [
          { severity: 'CRITICAL', filePath: 'src/one.ts', lineRange: [2, 2], title: 'Top issue only' },
        ],
      },
      evidenceDocs: [
        makeEvidenceDoc({ issueTitle: 'Full first issue', filePath: 'src/one.ts', lineRange: [2, 2] }),
        makeEvidenceDoc({ issueTitle: 'Full second issue', filePath: 'src/two.ts', lineRange: [2, 2] }),
      ],
    });

    const annotated = formatOutput(result, 'annotated', { diffContent: diff });

    expect(annotated).toContain('Full first issue');
    expect(annotated).toContain('Full second issue');
    expect(annotated).not.toContain('Top issue only');
  });
});

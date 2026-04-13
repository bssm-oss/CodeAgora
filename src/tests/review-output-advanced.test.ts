/**
 * Review Output Advanced Tests
 * Tests edge cases in formatText, formatHtml, and formatJunit from formatters/review-output.ts:
 * - result.summary=undefined + status='success' → fallback output
 * - HTML/JUnit escaping of special characters in lineRange/paths/titles
 */

import { describe, it, expect } from 'vitest';
import {
  formatText,
  formatHtml,
  formatJunit,
  formatMarkdown,
  formatOutput,
} from '@codeagora/cli/formatters/review-output.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ============================================================================
// Helpers
// ============================================================================

function makeSummary() {
  return {
    decision: 'REJECT' as const,
    reasoning: 'Issues found.',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { WARNING: 1 } as Record<string, number>,
    topIssues: [] as Array<{ severity: string; filePath: string; lineRange: [number, number]; title: string }>,
    totalDiscussions: 0,
    resolved: 0,
    escalated: 0,
  };
}

function makeResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    status: 'success',
    sessionId: 'sess-001',
    date: '2026-03-21',
    summary: makeSummary(),
    evidenceDocs: [],
    ...overrides,
  } as unknown as PipelineResult;
}

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'Something is wrong.',
    evidence: ['Evidence line 1'],
    severity: 'WARNING',
    suggestion: 'Fix it.',
    filePath: 'src/foo.ts',
    lineRange: [10, 12] as [number, number],
    ...overrides,
  };
}

// ============================================================================
// formatText — undefined summary + status='success'
// ============================================================================

describe('formatText() with undefined summary', () => {
  it('does not throw when summary is undefined', () => {
    const result = makeResult({ summary: undefined });
    expect(() => formatText(result)).not.toThrow();
  });

  it('outputs the session reference when summary is undefined', () => {
    const result = makeResult({ summary: undefined, sessionId: 'abc-123', date: '2026-03-21' });
    const output = formatText(result);
    expect(output).toContain('abc-123');
    expect(output).toContain('2026-03-21');
  });

  it('outputs a fallback path reference when summary is undefined', () => {
    const result = makeResult({ summary: undefined });
    const output = formatText(result);
    expect(output).toContain('Session');
  });

  it('does not contain decision or severity when summary is undefined', () => {
    const result = makeResult({ summary: undefined });
    const output = formatText(result);
    // None of the decision labels should appear
    expect(output).not.toContain('ACCEPT');
    expect(output).not.toContain('REJECT');
    expect(output).not.toContain('NEEDS_HUMAN');
  });
});

// ============================================================================
// formatHtml — escaping of special characters
// ============================================================================

describe('formatHtml() HTML escaping', () => {
  it('escapes ampersand in issue title', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ issueTitle: 'A & B vulnerability' })],
    });
    const html = formatHtml(result);
    expect(html).toContain('&amp;');
    expect(html).not.toMatch(/[^&]&[^a-z#]/); // no raw & outside entity
  });

  it('escapes < and > in problem text', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ problem: 'Value <script>alert(1)</script>' })],
    });
    const html = formatHtml(result);
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes double quotes in filePath', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ filePath: 'src/"quoted"/foo.ts' })],
    });
    const html = formatHtml(result);
    expect(html).toContain('&quot;');
  });

  it('renders lineRange correctly in the issues table', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ lineRange: [42, 42] })],
    });
    const html = formatHtml(result);
    expect(html).toContain('42');
  });

  it('shows fallback "Review completed successfully." when summary is undefined', () => {
    const result = makeResult({ summary: undefined, evidenceDocs: [] });
    const html = formatHtml(result);
    expect(html).toContain('Review completed successfully.');
  });

  it('escapes special chars in error message', () => {
    const result = makeResult({ status: 'error', error: '<script>xss</script>' } as unknown as PipelineResult);
    const html = formatHtml(result);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('produces valid DOCTYPE structure', () => {
    const result = makeResult();
    const html = formatHtml(result);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
});

// ============================================================================
// formatJunit — XML escaping of special characters
// ============================================================================

describe('formatJunit() XML escaping', () => {
  it('escapes & in issue title in XML', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ issueTitle: 'Auth & Session vulnerability' })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('&amp;');
  });

  it('escapes < and > in problem text', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ problem: 'Buffer <overflow> detected' })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
  });

  it('escapes " in filePath (XML attribute)', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ filePath: 'src/has"quote/file.ts' })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('&quot;');
  });

  it("escapes ' in filePath (XML apos entity)", () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ filePath: "src/has'quote/file.ts" })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('&apos;');
  });

  it('wraps each issue as a failing testcase', () => {
    const result = makeResult({
      evidenceDocs: [
        makeDoc({ issueTitle: 'Issue A' }),
        makeDoc({ issueTitle: 'Issue B' }),
      ],
    });
    const xml = formatJunit(result);
    const testcaseCount = (xml.match(/<testcase /g) ?? []).length;
    expect(testcaseCount).toBe(2);
  });

  it('produces valid XML declaration', () => {
    const result = makeResult();
    const xml = formatJunit(result);
    expect(xml).toContain('<?xml version="1.0"');
  });

  it('outputs error testsuite for pipeline error status', () => {
    const result = makeResult({ status: 'error', error: 'Pipeline failed' } as unknown as PipelineResult);
    const xml = formatJunit(result);
    expect(xml).toContain('<failure');
    expect(xml).toContain('Pipeline failed');
  });

  it('includes suggestion text in the failure body', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ suggestion: 'Use parameterized queries.' })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('Use parameterized queries.');
  });

  it('includes evidence text in the failure body', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ evidence: ['Found on line 42', 'Repeated on line 55'] })],
    });
    const xml = formatJunit(result);
    expect(xml).toContain('Found on line 42');
    expect(xml).toContain('Repeated on line 55');
  });
});

// ============================================================================
// formatMarkdown — undefined summary fallback
// ============================================================================

describe('formatMarkdown() with undefined summary', () => {
  it('does not throw when summary is undefined', () => {
    const result = makeResult({ summary: undefined });
    expect(() => formatMarkdown(result)).not.toThrow();
  });

  it('outputs "Review completed successfully." when summary is undefined', () => {
    const result = makeResult({ summary: undefined });
    const md = formatMarkdown(result);
    expect(md).toContain('Review completed successfully.');
  });
});

// ============================================================================
// formatOutput dispatcher
// ============================================================================

describe('formatOutput() dispatcher', () => {
  it('dispatches to formatText for "text" format', () => {
    const result = makeResult();
    const output = formatOutput(result, 'text');
    // text format doesn't produce DOCTYPE
    expect(output).not.toContain('<!DOCTYPE');
  });

  it('dispatches to formatHtml for "html" format', () => {
    const result = makeResult();
    const output = formatOutput(result, 'html');
    expect(output).toContain('<!DOCTYPE html>');
  });

  it('dispatches to formatJunit for "junit" format', () => {
    const result = makeResult();
    const output = formatOutput(result, 'junit');
    expect(output).toContain('<?xml');
  });

  it('dispatches to JSON for "json" format', () => {
    const result = makeResult({ sessionId: 'json-sess' });
    const output = formatOutput(result, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.sessionId).toBe('json-sess');
  });
});

/**
 * GitHub Review Mapper Tests
 * Tests mapToInlineCommentBody(), buildSummaryBody(), buildReviewBadgeUrl()
 */

import { describe, it, expect } from 'vitest';
import {
  mapToInlineCommentBody,
  buildSummaryBody,
  buildReviewBadgeUrl,
  buildTriageDigest,
} from '../mapper.js';
import type { EvidenceDocument, DiscussionVerdict, ReviewerOpinion, DiscussionRound } from '@codeagora/core/types/core.js';
import type { PipelineSummary } from '@codeagora/core/pipeline/orchestrator.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Null pointer dereference',
    problem: 'Value may be null at this point.',
    evidence: ['Line 42 dereferences without null check'],
    severity: 'CRITICAL',
    suggestion: 'Add a null check before use.',
    filePath: 'src/foo.ts',
    lineRange: [42, 45],
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict {
  return {
    discussionId: 'd001',
    filePath: 'src/foo.ts',
    lineRange: [42, 45],
    finalSeverity: 'CRITICAL',
    reasoning: 'All reviewers agreed this is critical.',
    consensusReached: true,
    rounds: 1,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    decision: 'REJECT',
    reasoning: 'Critical issues found.',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 1 },
    topIssues: [],
    totalDiscussions: 1,
    resolved: 1,
    escalated: 0,
    ...overrides,
  };
}

// ============================================================================
// mapToInlineCommentBody
// ============================================================================

describe('mapToInlineCommentBody', () => {
  it('includes the issue title and severity badge', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('CRITICAL');
    expect(body).toContain('Null pointer dereference');
  });

  it('includes the problem text', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('Value may be null at this point.');
  });

  it('includes evidence items as a numbered list', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('1. Line 42 dereferences without null check');
  });

  it('includes suggestion text when no code block is present', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('Add a null check before use.');
  });

  it('wraps a code-block suggestion in ```suggestion fence', () => {
    const doc = makeDoc({
      suggestion: '```typescript\nif (x !== null) { use(x); }\n```',
    });
    const body = mapToInlineCommentBody(doc);
    expect(body).toContain('```suggestion');
    expect(body).toContain('if (x !== null) { use(x); }');
  });

  it('omits suggestion when postSuggestions is false', () => {
    const body = mapToInlineCommentBody(makeDoc(), undefined, undefined, {
      postSuggestions: false,
    });
    expect(body).not.toContain('Add a null check before use.');
  });

  it('includes reviewer ids when provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), undefined, ['reviewer-a', 'reviewer-b']);
    expect(body).toContain('reviewer-a');
    expect(body).toContain('reviewer-b');
  });

  it('omits reviewer section when no reviewerIds provided', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).not.toContain('Flagged by:');
  });

  it('includes collapsed discussion block when verdict is provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeVerdict());
    expect(body).toContain('<details>');
    expect(body).toContain('d001');
    expect(body).toContain('All reviewers agreed this is critical.');
  });

  it('labels speculative critical inline discussions without presenting them as blocking criticals', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeVerdict({ consensusReached: false, avgConfidence: 4 }),
    );

    expect(body).toContain('forced decision');
    expect(body).toContain('**Verdict:** speculative CRITICAL (4%)');
    expect(body).not.toContain('**Verdict:** CRITICAL —');
  });

  it('labels high-risk speculative critical inline discussions as high-risk', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeVerdict({
        consensusReached: false,
        avgConfidence: 4,
        reasoning: 'Possible authorization bypass across a permission boundary, but evidence is weak.',
      }),
    );

    expect(body).toContain('**Verdict:** high-risk speculative CRITICAL (4%)');
  });

  it('renders discussion inline when collapseDiscussions is false', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeVerdict(), undefined, {
      collapseDiscussions: false,
    });
    expect(body).not.toContain('<details>');
    expect(body).toContain('All reviewers agreed this is critical.');
  });

  it('shows consensus icon when consensus was reached', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeVerdict({ consensusReached: true }));
    // consensus = ✅
    expect(body).toContain('\u2705');
  });

  it('shows warning icon when consensus was NOT reached', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeVerdict({ consensusReached: false }));
    // no consensus = ⚠️
    expect(body).toContain('\u26A0');
  });

  it('uses grey circle for unknown severity', () => {
    const doc = makeDoc({ severity: 'WARNING' });
    // Override to an unknown value via cast
    (doc as unknown as Record<string, string>).severity = 'UNKNOWN_SEV';
    const body = mapToInlineCommentBody(doc as EvidenceDocument);
    expect(body).toContain('UNKNOWN_SEV');
  });

  it('omits evidence section when evidence array is empty', () => {
    const doc = makeDoc({ evidence: [] });
    const body = mapToInlineCommentBody(doc);
    expect(body).not.toContain('**Evidence:**');
  });

  it('includes confidence badge when confidence is set', () => {
    const doc = makeDoc({ confidence: 95 });
    const body = mapToInlineCommentBody(doc);
    // getConfidenceBadge returns non-empty string for high confidence
    expect(body).toContain('Confidence');
  });

  // === Reviewer Opinions (L1 individual findings) ===

  it('renders collapsed reviewer opinions section when multiple opinions provided', () => {
    const opinions: ReviewerOpinion[] = [
      {
        reviewerId: 'gpt-4o',
        model: 'gpt-4o',
        severity: 'CRITICAL',
        problem: 'Null pointer crash on empty input',
        evidence: ['Line 42 has no guard'],
        suggestion: 'Add null check',
      },
      {
        reviewerId: 'mimo',
        model: 'xiaomi/mimo-v2.5',
        severity: 'WARNING',
        problem: 'Possible null issue, low risk',
        evidence: ['Line 42 might be null'],
        suggestion: 'Consider adding guard clause',
      },
    ];
    const body = mapToInlineCommentBody(makeDoc(), undefined, undefined, undefined, undefined, opinions);
    expect(body).toContain('Individual Reviews (2 reviewers)');
    expect(body).toContain('gpt-4o');
    expect(body).toContain('mimo');
    expect(body).toContain('Null pointer crash on empty input');
    expect(body).toContain('Possible null issue, low risk');
    expect(body).toContain('<details>');
  });

  it('omits reviewer opinions section when only one opinion', () => {
    const opinions: ReviewerOpinion[] = [
      {
        reviewerId: 'gpt-4o',
        model: 'gpt-4o',
        severity: 'CRITICAL',
        problem: 'Null pointer crash',
        evidence: [],
        suggestion: '',
      },
    ];
    const body = mapToInlineCommentBody(makeDoc(), undefined, undefined, undefined, undefined, opinions);
    expect(body).not.toContain('Individual Reviews');
  });

  it('includes evidence and suggestion in each opinion', () => {
    const opinions: ReviewerOpinion[] = [
      {
        reviewerId: 'reviewer-a',
        model: 'model-a',
        severity: 'CRITICAL',
        problem: 'Problem A',
        evidence: ['Evidence line 1', 'Evidence line 2'],
        suggestion: 'Fix it this way',
      },
      {
        reviewerId: 'reviewer-b',
        model: 'model-b',
        severity: 'WARNING',
        problem: 'Problem B',
        evidence: ['Evidence B'],
        suggestion: 'Alternative fix',
      },
    ];
    const body = mapToInlineCommentBody(makeDoc(), undefined, undefined, undefined, undefined, opinions);
    expect(body).toContain('Evidence line 1');
    expect(body).toContain('Evidence line 2');
    expect(body).toContain('Fix it this way');
    expect(body).toContain('Alternative fix');
  });

  it('shows model name and DA icon in discussion round table', () => {
    const discussion = makeVerdict();
    const rounds: DiscussionRound[] = [{
      round: 1,
      moderatorPrompt: 'Discuss this issue.',
      supporterResponses: [
        { supporterId: 'supporter-1', response: 'Looks correct, agree.', stance: 'agree' },
        { supporterId: 'devil-adv', response: 'False positive, disagree.', stance: 'disagree' },
      ],
    }];
    const supporterModelMap = new Map([
      ['supporter-1', 'gpt-4o'],
      ['devil-adv', 'x-ai/grok-4.3'],
    ]);
    const body = mapToInlineCommentBody(
      makeDoc(), discussion, undefined, undefined, rounds, undefined, 'devil-adv', supporterModelMap,
    );
    // DA gets 😈 icon
    expect(body).toContain('\u{1F608} x-ai/grok-4.3');
    // Regular supporter shows model name without icon
    expect(body).toContain('gpt-4o');
    expect(body).not.toContain('supporter-1');
    expect(body).not.toContain('devil-adv');
  });

  it('falls back to supporterId when no model map provided', () => {
    const discussion = makeVerdict();
    const rounds: DiscussionRound[] = [{
      round: 1,
      moderatorPrompt: 'Discuss.',
      supporterResponses: [
        { supporterId: 'supporter-1', response: 'Agree.', stance: 'agree' },
      ],
    }];
    const body = mapToInlineCommentBody(makeDoc(), discussion, undefined, undefined, rounds);
    expect(body).toContain('supporter-1');
  });

  it('shows severity badge per reviewer opinion', () => {
    const opinions: ReviewerOpinion[] = [
      {
        reviewerId: 'r1',
        model: 'm1',
        severity: 'CRITICAL',
        problem: 'P1',
        evidence: [],
        suggestion: '',
      },
      {
        reviewerId: 'r2',
        model: 'm2',
        severity: 'WARNING',
        problem: 'P2',
        evidence: [],
        suggestion: '',
      },
    ];
    const body = mapToInlineCommentBody(makeDoc(), undefined, undefined, undefined, undefined, opinions);
    // CRITICAL badge (🔴) and WARNING badge (🟡)
    expect(body).toContain('\u{1F534}');
    expect(body).toContain('\u{1F7E1}');
  });
});

// ============================================================================
// buildSummaryBody
// ============================================================================

describe('buildSummaryBody', () => {
  it('contains the codeagora-v3 HTML marker', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('<!-- codeagora-v3 -->');
  });

  it('includes the verdict decision and badge', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('ACCEPT');
  });

  it('includes the summary reasoning text', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ reasoning: 'No issues found at all.' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('No issues found at all.');
  });

  it('includes the session id in the footer', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'abc-xyz',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('abc-xyz');
  });

  it('renders Must Fix section for high-confidence CRITICAL docs', () => {
    const doc = makeDoc({ severity: 'CRITICAL', confidence: 90 });
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [doc],
      discussions: [],
    });
    expect(body).toContain('### Must Fix');
    expect(body).toContain('Null pointer dereference');
  });

  it('renders Must Fix section for HARSHLY_CRITICAL docs', () => {
    const doc = makeDoc({ severity: 'HARSHLY_CRITICAL', confidence: 90 });
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [doc],
      discussions: [],
    });
    expect(body).toContain('Must Fix');
  });

  it('renders collapsible warnings section', () => {
    const doc = makeDoc({ severity: 'WARNING', issueTitle: 'Missing guard clause' });
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [doc],
      discussions: [],
    });
    expect(body).toContain('suggestion(s)');
    expect(body).toContain('Missing guard clause');
  });

  it('renders collapsible suggestions section', () => {
    const doc = makeDoc({ severity: 'SUGGESTION', issueTitle: 'Consider extracting method' });
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [doc],
      discussions: [],
    });
    expect(body).toContain('suggestion(s)');
    expect(body).toContain('Consider extracting method');
  });

  it('renders open questions section for NEEDS_HUMAN verdict', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
      questionsForHuman: ['Is this change intentional?', 'Review auth logic.'],
    });
    expect(body).toContain('### Open Questions');
    expect(body).toContain('Is this change intentional?');
    expect(body).toContain('Review auth logic.');
  });

  it('renders agent consensus log section when discussions are present', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [makeVerdict()],
    });
    expect(body).toContain('Agent consensus log');
    expect(body).toContain('d001');
  });

  it('labels speculative critical discussions in the consensus log', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only speculative hypotheses remain.' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [makeVerdict({ consensusReached: false, avgConfidence: 4 })],
    });

    expect(body).toContain('forced → speculative CRITICAL (4%)');
    expect(body).toContain('**Verdict:** speculative CRITICAL (4%)');
    expect(body).not.toContain('forced → CRITICAL');
  });

  it('keeps high-risk speculative critical docs in needs-repro instead of hiding them', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: 'A weak security claim needs reproduction.' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [makeDoc({
        confidence: 4,
        issueTitle: 'Possible SQL injection',
        problem: 'Possible SQL injection if the query builder does not escape this branch.',
      })],
      discussions: [makeVerdict({
        consensusReached: false,
        avgConfidence: 4,
        reasoning: 'Possible SQL injection, but the current trace is weak.',
      })],
    });

    expect(body).toContain('1 needs-repro');
    expect(body).toContain('### Needs Repro');
    expect(body).toContain('forced → high-risk speculative CRITICAL (4%)');
    expect(body).not.toContain('1 speculative hypothesis(es) hidden');
  });

  it('renders suppressed issues section when suppressedIssues is provided', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
      suppressedIssues: [
        { filePath: 'src/foo.ts', lineRange: [1, 5], issueTitle: 'Old warning', dismissCount: 3 },
      ],
    });
    expect(body).toContain('suppressed by learned patterns');
    expect(body).toContain('Old warning');
    expect(body).toContain('dismissed 3 times previously');
  });

  it('renders issue distribution heatmap when evidenceDocs present', () => {
    const docs = [
      makeDoc({ filePath: 'src/a.ts' }),
      makeDoc({ filePath: 'src/a.ts' }),
      makeDoc({ filePath: 'src/b.ts' }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    expect(body).toContain('Issue distribution');
    expect(body).toContain('src/a.ts');
  });
});

// ============================================================================
// buildReviewBadgeUrl
// ============================================================================

describe('buildReviewBadgeUrl', () => {
  it('returns a shields.io URL', () => {
    const url = buildReviewBadgeUrl('ACCEPT', {});
    expect(url).toContain('img.shields.io/badge/CodeAgora');
  });

  it('uses brightgreen color for ACCEPT', () => {
    const url = buildReviewBadgeUrl('ACCEPT', {});
    expect(url).toContain('brightgreen');
  });

  it('uses red color for REJECT', () => {
    const url = buildReviewBadgeUrl('REJECT', {});
    expect(url).toContain('red');
  });

  it('uses yellow color for NEEDS_HUMAN', () => {
    const url = buildReviewBadgeUrl('NEEDS_HUMAN', {});
    expect(url).toContain('yellow');
  });

  it('uses lightgrey for unknown decisions', () => {
    const url = buildReviewBadgeUrl('UNKNOWN', {});
    expect(url).toContain('lightgrey');
  });

  it('appends critical count to label when critical issues exist', () => {
    const url = buildReviewBadgeUrl('REJECT', { CRITICAL: 2, HARSHLY_CRITICAL: 1 });
    expect(url).toContain('3%20critical');
  });

  it('does not append critical count when counts are zero', () => {
    const url = buildReviewBadgeUrl('REJECT', { CRITICAL: 0, WARNING: 2 });
    expect(url).not.toContain('critical');
  });
});

// ============================================================================
// buildTriageDigest
// ============================================================================

describe('buildTriageDigest', () => {
  it('returns null for empty docs', () => {
    expect(buildTriageDigest([])).toBeNull();
  });

  it('classifies CRITICAL with high confidence as must-fix', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 90 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 must-fix');
    expect(result).not.toContain('verify');
    expect(result).not.toContain('ignore');
  });

  it('classifies borderline CRITICAL confidence below 60 as needs-human', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 51 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 needs-human');
    expect(result).not.toContain('must-fix');
  });

  it('classifies HARSHLY_CRITICAL with high confidence as must-fix', () => {
    const docs = [makeDoc({ severity: 'HARSHLY_CRITICAL', confidence: 80 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 must-fix');
  });

  it('classifies CRITICAL with low confidence as needs-human', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 45 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 needs-human');
    expect(result).not.toContain('must-fix');
  });

  it('classifies very low-confidence CRITICAL as needs-repro', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 30 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 needs-repro');
    expect(result).not.toContain('needs-human');
    expect(result).not.toContain('must-fix');
  });

  it('counts extremely low-confidence CRITICAL as hidden speculative in public triage', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 0 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 speculative hidden');
  });

  it('routes FP-heavy provider-contract CRITICAL findings to hidden speculative', () => {
    const docs = [makeDoc({
      severity: 'CRITICAL',
      confidence: 27,
      confidenceTrace: {
        final: 27,
        classPrior: 'provider-contract-flexibility',
      },
    })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 speculative hidden');
    expect(result).not.toContain('needs-repro');
  });

  it('classifies WARNING with high confidence as verify', () => {
    const docs = [makeDoc({ severity: 'WARNING', confidence: 80 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 verify');
  });

  it('classifies SUGGESTION as ignore', () => {
    const docs = [makeDoc({ severity: 'SUGGESTION', confidence: 90 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 ignore');
  });

  it('classifies WARNING with low confidence as ignore', () => {
    const docs = [makeDoc({ severity: 'WARNING', confidence: 10 })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 ignore');
  });

  it('defaults confidence to 50 when not set', () => {
    // CRITICAL with default 50 → conf ≤ 50 → needs-human
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: undefined })];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 needs-human');
  });

  it('classifies a mix of docs correctly', () => {
    const docs = [
      makeDoc({ severity: 'CRITICAL', confidence: 90 }),     // must-fix
      makeDoc({ severity: 'CRITICAL', confidence: 45 }),     // needs-human
      makeDoc({ severity: 'CRITICAL', confidence: 30 }),     // needs-repro
      makeDoc({ severity: 'CRITICAL', confidence: 0 }),      // speculative hidden
      makeDoc({ severity: 'CRITICAL', confidenceTrace: { final: 27, classPrior: 'provider-contract-flexibility' } }),
      makeDoc({ severity: 'WARNING', confidence: 80 }),      // verify
      makeDoc({ severity: 'SUGGESTION', confidence: 50 }),   // ignore
      makeDoc({ severity: 'SUGGESTION', confidence: 90 }),   // ignore
    ];
    const result = buildTriageDigest(docs);
    expect(result).toContain('1 must-fix');
    expect(result).toContain('1 needs-human');
    expect(result).toContain('1 needs-repro');
    expect(result).toContain('2 speculative hidden');
    expect(result).toContain('1 verify');
    expect(result).toContain('2 ignore');
  });

  it('omits zero-count categories', () => {
    const docs = [makeDoc({ severity: 'SUGGESTION', confidence: 50 })];
    const result = buildTriageDigest(docs);
    expect(result).not.toContain('must-fix');
    expect(result).not.toContain('verify');
    expect(result).toContain('1 ignore');
  });

  it('uses middle dot separator between categories', () => {
    const docs = [
      makeDoc({ severity: 'CRITICAL', confidence: 90 }),
      makeDoc({ severity: 'SUGGESTION', confidence: 50 }),
    ];
    const result = buildTriageDigest(docs);
    expect(result).toContain('\u00B7');
  });
});

// ============================================================================
// buildSummaryBody — triage digest integration
// ============================================================================

describe('buildSummaryBody triage digest', () => {
  it('includes triage digest line when evidenceDocs present', () => {
    const docs = [
      makeDoc({ severity: 'CRITICAL', confidence: 90 }),
      makeDoc({ severity: 'WARNING', confidence: 80 }),
      makeDoc({ severity: 'SUGGESTION', confidence: 50 }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    expect(body).toContain('must-fix');
    expect(body).toContain('1 must-fix');
    expect(body).toContain('1 verify');
    expect(body).toContain('1 ignore');
  });

  it('renders low-confidence CRITICAL docs as Needs Human instead of Verify', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [makeDoc({ severity: 'CRITICAL', confidence: 45 })],
      discussions: [],
    });
    expect(body).toContain('1 needs-human');
    expect(body).toContain('### Needs Human');
    expect(body).not.toContain('### Verify');
  });

  it('renders very low-confidence CRITICAL docs as Needs Repro', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [makeDoc({
        severity: 'CRITICAL',
        confidence: 30,
        confidenceTrace: {
          raw: 80,
          filtered: 40,
          corroborated: 30,
          final: 30,
          evidence: 0.6,
          classPrior: 'generic-potential',
        },
      })],
      discussions: [],
    });
    expect(body).toContain('1 needs-repro');
    expect(body).toContain('### Needs Repro');
    expect(body).toContain('Confirm with a concrete reproduction');
    expect(body).toContain('Repro card');
    expect(body).toContain('Expected if valid: Value may be null at this point.');
    expect(body).toContain('Actual to check: Line 42 dereferences without null check');
    expect(body).toContain('Confidence basis: raw 80% -> filtered 40% -> corroborated 30% -> final 30% -> evidence 60% -> class prior generic-potential');
    expect(body).not.toContain('### Needs Human');
  });

  it('collapses extremely low-confidence CRITICAL docs as hidden hypotheses', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN' }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [makeDoc({ severity: 'CRITICAL', confidence: 0 })],
      discussions: [],
    });
    expect(body).toContain('1 speculative hypothesis(es) hidden');
    expect(body).toContain('These are not merge blockers');
    expect(body).not.toContain('### Speculative');
    expect(body).not.toContain('### Needs Human');
  });

  it('renders action details for public findings', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [makeDoc({ severity: 'CRITICAL', confidence: 90 })],
      discussions: [],
    });
    expect(body).toContain('Must-fix action details');
    expect(body).toContain('Why this matters: Value may be null at this point.');
    expect(body).toContain('How to verify: Line 42 dereferences without null check');
    expect(body).toContain('Suggested fix: Add a null check before use.');
    expect(body).toContain('Confidence basis: final 90%; no stage trace was recorded');
  });

  it('places triage digest between heading and verdict', () => {
    const docs = [makeDoc({ severity: 'CRITICAL', confidence: 90 })];
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    // New format: heading includes verdict, triage is on next line
    const headingIdx = body.indexOf('## ');
    const triageIdx = body.indexOf('must-fix');
    expect(headingIdx).toBeLessThan(triageIdx);
  });

  it('omits triage digest when no evidenceDocs', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).not.toContain('must-fix');
  });
});

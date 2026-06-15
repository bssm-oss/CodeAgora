import { describe, it, expect } from 'vitest';
import {
  mapToInlineCommentBody,
  buildReviewComments,
  buildSummaryBody,
  mapToGitHubReview,
} from '@codeagora/github/mapper.js';
import type { EvidenceDocument, DiscussionVerdict } from '@codeagora/core/types/core.js';
import type { DiffPositionIndex } from '@codeagora/github/types.js';
import type { PipelineSummary, ReviewRunSummary } from '@codeagora/core/pipeline/orchestrator.js';

const makeDoc = (overrides?: Partial<EvidenceDocument>): EvidenceDocument => ({
  issueTitle: 'SQL injection vulnerability',
  problem: 'User input concatenated into SQL query',
  evidence: ['query = "SELECT * FROM users WHERE id = " + userId'],
  severity: 'CRITICAL',
  suggestion: 'Use parameterized queries',
  filePath: 'src/db/queries.ts',
  lineRange: [42, 45] as [number, number],
  confidence: 90,
  ...overrides,
});

const makeDiscussion = (overrides?: Partial<DiscussionVerdict>): DiscussionVerdict => ({
  discussionId: 'd001',
  filePath: 'src/db/queries.ts',
  lineRange: [42, 45] as [number, number],
  finalSeverity: 'CRITICAL',
  reasoning: 'Confirmed exploitable',
  consensusReached: true,
  rounds: 1,
  ...overrides,
});

const makeSummary = (overrides?: Partial<PipelineSummary>): PipelineSummary => ({
  decision: 'REJECT',
  reasoning: 'Blocking issues found',
  totalReviewers: 3,
  forfeitedReviewers: 0,
  severityCounts: { CRITICAL: 1 },
  topIssues: [],
  totalDiscussions: 1,
  resolved: 1,
  escalated: 0,
  ...overrides,
});

const makeReviewRun = (overrides?: Partial<ReviewRunSummary>): ReviewRunSummary => ({
  l1: {
    configured: 5,
    completed: 5,
    forfeited: 0,
    errored: 0,
    reviewers: [],
    models: [
      'xiaomi/mimo-v2.5',
      'qwen/qwen3-coder-30b-a3b-instruct',
      'tencent/hy3-preview',
      'deepseek/deepseek-v4-flash',
      'meta-llama/llama-4-scout',
    ],
    providers: ['openrouter'],
  },
  l2: {
    supporters: 2,
    supporterModels: ['z-ai/glm-5.1', 'minimax/minimax-m3'],
    devilsAdvocate: { id: 'da', model: 'x-ai/grok-4.3', backend: 'api', provider: 'openrouter' },
    moderator: { id: 'moderator', model: 'openai/gpt-5.3-codex', backend: 'api', provider: 'openrouter' },
    discussions: 0,
    skipped: false,
  },
  l3: {
    head: { id: 'head', model: 'qwen/qwen3.7-max', backend: 'api', provider: 'openrouter' },
    skipped: false,
  },
  queues: {
    activeFindings: 0,
    suggestions: 0,
    unconfirmed: 0,
    suppressed: 0,
    hallucinationRemoved: 0,
    hallucinationUncertain: 0,
  },
  degraded: false,
  degradedReasons: [],
  ...overrides,
});

describe('mapToInlineCommentBody', () => {
  it('includes severity badge, problem, evidence, and suggestion', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('**CRITICAL**');
    expect(body).toContain('SQL injection vulnerability');
    expect(body).toContain('**Problem:**');
    expect(body).toContain('**Evidence:**');
    expect(body).toContain('**Suggestion:**');
  });

  it('includes discussion summary when provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeDiscussion());
    expect(body).toContain('<details>');
    expect(body).toContain('d001');
    expect(body).toContain('consensus');
  });

  it('shows forced decision for non-consensus', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeDiscussion({ consensusReached: false }),
    );
    expect(body).toContain('forced decision');
  });

  it('labels speculative critical inline discussions without presenting them as blocking criticals', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeDiscussion({ consensusReached: false, avgConfidence: 4 }),
    );

    expect(body).toContain('forced decision');
    expect(body).toContain('**Disposition:** speculative hypothesis (4%)');
    expect(body).toContain('retained for auditability');
    expect(body).not.toContain('**Verdict:** CRITICAL —');
  });

  it('labels high-risk speculative critical inline discussions as high-risk', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeDiscussion({
        consensusReached: false,
        avgConfidence: 4,
        reasoning: 'Possible authorization bypass across a permission boundary, but evidence is weak.',
      }),
    );

    expect(body).toContain('**Verdict:** high-risk hypothesis (4%)');
  });

  it('includes reviewer IDs when provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), undefined, ['r1-kimi', 'r2-codex']);
    expect(body).toContain('r1-kimi');
    expect(body).toContain('r2-codex');
    expect(body).toContain('CodeAgora');
  });

  it('handles empty evidence array', () => {
    const body = mapToInlineCommentBody(makeDoc({ evidence: [] }));
    expect(body).not.toContain('**Evidence:**');
  });

  it('renders all severity levels correctly', () => {
    for (const severity of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
      const body = mapToInlineCommentBody(makeDoc({ severity }));
      expect(body).toContain(`**${severity === 'HARSHLY_CRITICAL' ? 'HARSHLY CRITICAL' : severity}**`);
    }
  });
});

describe('buildReviewComments', () => {
  it('creates inline comment with position when line is in diff', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const comments = buildReviewComments([makeDoc()], [], index);
    expect(comments).toHaveLength(1);
    expect(comments[0].path).toBe('src/db/queries.ts');
    expect(comments[0].position).toBe(14);
    expect(comments[0].side).toBe('RIGHT');
  });

  it('creates file-level comment when line is not in diff', () => {
    const index: DiffPositionIndex = {}; // empty — line not found
    const comments = buildReviewComments([makeDoc()], [], index);
    expect(comments).toHaveLength(1);
    expect(comments[0].position).toBeUndefined();
    expect(comments[0].body).toContain('src/db/queries.ts:42-45');
  });

  it('skips dismissed issues', () => {
    const discussion = makeDiscussion({ finalSeverity: 'DISMISSED' });
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const comments = buildReviewComments([makeDoc()], [discussion], index);
    expect(comments).toHaveLength(0);
  });

  it('skips dismissed issues matched within L2 line tolerance', () => {
    const discussion = makeDiscussion({
      finalSeverity: 'DISMISSED',
      lineRange: [51, 51],
    });
    const index: DiffPositionIndex = { 'src/db/queries.ts:56': 14 };
    const comments = buildReviewComments(
      [makeDoc({ lineRange: [56, 56] })],
      [discussion],
      index,
    );
    expect(comments).toHaveLength(0);
  });

  it('handles multiple documents', () => {
    const docs = [
      makeDoc(),
      makeDoc({ filePath: 'src/auth.ts', lineRange: [10, 12] }),
    ];
    const index: DiffPositionIndex = {
      'src/db/queries.ts:42': 14,
      'src/auth.ts:10': 5,
    };
    const comments = buildReviewComments(docs, [], index);
    expect(comments).toHaveLength(2);
  });
});

describe('buildSummaryBody', () => {
  it('includes verdict and marker', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc()],
      discussions: [makeDiscussion()],
    });
    expect(body).toContain('<!-- codeagora-v3 -->');
    expect(body).toContain('REJECT');
    expect(body).toContain('CodeAgora');
    expect(body).toContain('### Final Decision Table');
    expect(body).toContain('### Decision Snapshot');
    expect(body).toContain('| Decision gate | Follow-up later | Ignored speculative |');
    expect(body).not.toContain('Raw head rationale');
  });

  it('renders blocking issues table for critical docs', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc()],
      discussions: [],
    });
    expect(body).toContain('Must Fix');
    expect(body).toContain('src/db/queries.ts');
  });

  it('collapses warnings and suggestions', () => {
    const docs = [
      makeDoc({ severity: 'WARNING', issueTitle: 'A warning' }),
      makeDoc({ severity: 'SUGGESTION', issueTitle: 'A suggestion' }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary({ severityCounts: { WARNING: 1, SUGGESTION: 1 } }),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: docs,
      discussions: [],
    });
    expect(body).toContain('Verify');
    expect(body).toContain('suggestion(s)');
    expect(body).toContain('<details>');
  });

  it('includes session reference in footer', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT' }),
      sessionId: '003',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('2026-03-16/003');
  });

  it('renders role-aware ACCEPT coverage instead of a misleading reviewer total', () => {
    const body = buildSummaryBody({
      summary: makeSummary({
        decision: 'ACCEPT',
        reasoning: 'No blocking findings remained.',
        totalReviewers: 18,
        totalDiscussions: 0,
      }),
      sessionId: '004',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun(),
    });

    expect(body).toContain('L1 5/5');
    expect(body).toContain('L2 2+DA');
    expect(body).toContain('head');
    expect(body).toContain('Review Coverage');
    expect(body).toContain('No blocking findings remained after reviewer corroboration');
    expect(body).not.toContain('18 reviewers');
  });

  it('renders non-blocking queue digest with retained examples', () => {
    const suggestion = makeDoc({
      severity: 'SUGGESTION',
      issueTitle: 'Simplify branch',
      filePath: 'src/foo.ts',
      lineRange: [12, 12],
    });
    const unconfirmed = makeDoc({
      severity: 'WARNING',
      issueTitle: 'Check nullable path',
      filePath: 'src/bar.ts',
      lineRange: [20, 22],
    });
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only non-blocking queues remain.' }),
      sessionId: '005',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        queues: {
          activeFindings: 0,
          suggestions: 1,
          unconfirmed: 1,
          suppressed: 0,
          hallucinationRemoved: 0,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [suggestion],
        unconfirmed: [unconfirmed],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [],
      },
    });

    expect(body).toContain('Non-blocking review queues (2)');
    expect(body).toContain('These queues did not meet the public blocking threshold');
    expect(body).toContain('Simplify branch');
    expect(body).toContain('Check nullable path');
    expect(body).not.toContain('<summary>2 suggestion(s)</summary>');
  });

  it('marks non-blocking queues as diagnostic context during degraded runs', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: 'Provider runtime degraded.' }),
      sessionId: '005-degraded',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        degraded: true,
        degradedReasons: ['provider-runtime-failed'],
        queues: {
          activeFindings: 0,
          suggestions: 0,
          unconfirmed: 1,
          suppressed: 0,
          hallucinationRemoved: 0,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [],
        unconfirmed: [makeDoc({ severity: 'WARNING', issueTitle: 'Check nullable path' })],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [],
      },
    });

    expect(body).toContain('This run was degraded');
    expect(body).toContain('diagnostic context');
    expect(body).not.toContain('use them as follow-up context, not as merge blockers');
  });

  it('labels speculative critical discussions in the consensus log', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only speculative hypotheses remain.' }),
      sessionId: '005-speculative',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [makeDiscussion({ consensusReached: false, avgConfidence: 4 })],
    });

    expect(body).toContain('forced → speculative hypothesis (4%)');
    expect(body).toContain('**Disposition:** speculative hypothesis (4%)');
    expect(body).toContain('**Trace:**');
    expect(body).not.toContain('forced → CRITICAL');
  });

  it('treats tie-broken speculative discussions as forced even when consensusReached is true', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only speculative hypotheses remain.' }),
      sessionId: '005-speculative-forced-trace',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [makeDiscussion({
        consensusReached: true,
        avgConfidence: 4,
        reasoning: 'Tie broken by forced decision on last round (1 agree, 1 disagree)',
      })],
    });

    expect(body).toContain('forced → speculative hypothesis (4%)');
    expect(body).toContain('**Disposition:** speculative hypothesis (4%)');
    expect(body).toContain('**Trace:** Tie broken by forced decision');
    expect(body).not.toContain('consensus → speculative hypothesis');
    expect(body).not.toContain('**Verdict:** speculative hypothesis');
  });

  it('counts needs-human discussion verdicts in the summary snapshot', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: 'A low-confidence critical discussion needs human judgment.' }),
      sessionId: '005-needs-human-discussion',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [makeDiscussion({
        consensusReached: true,
        avgConfidence: 26,
        reasoning: 'All supporters agreed on the issue',
      })],
    });

    expect(body).toContain('1 needs-human discussion');
    expect(body).toContain('| d001 — discussion verdict | 26% | human-gated critical-risk hypothesis (26%) | human gate |');
    expect(body).toContain('### Human Gate Evidence Cards');
    expect(body).toContain('Policy basis: 20-59% critical-risk discussions require human review');
    expect(body).toContain('### Maintainer Action Top-3');
    expect(body).toContain('Run: `Inspect src/db/queries.ts:42 and run the nearest focused test.`');
    expect(body).toContain('| human review required | 1 | 0 |');
    expect(body).not.toContain('| 0 | 0 |');
  });

  it('uses focused desktop bridge command in maintainer actions', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: 'Desktop bridge contract needs review.' }),
      sessionId: '005-desktop-action',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc({
        filePath: 'packages/desktop/src/api/desktop-bridge.ts',
        lineRange: [217, 217],
        confidence: 42,
        issueTitle: 'Desktop bridge mutation behavior changed',
      })],
      discussions: [],
    });

    expect(body).toContain('Run: `pnpm vitest run src/tests/desktop-bridge.test.ts`');
  });

  it('keeps high-risk speculative critical docs in needs-repro instead of hiding them', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: 'A weak security claim needs reproduction.' }),
      sessionId: '005-high-risk',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc({
        confidence: 4,
        issueTitle: 'Possible SQL injection',
        problem: 'Possible SQL injection if the query builder does not escape this branch.',
      })],
      discussions: [makeDiscussion({
        consensusReached: false,
        avgConfidence: 4,
        reasoning: 'Possible SQL injection, but the current trace is weak.',
      })],
    });

    expect(body).toContain('1 needs-repro');
    expect(body).toContain('### Needs Repro');
    expect(body).toContain('forced → high-risk hypothesis (4%)');
    expect(body).not.toContain('1 speculative hypothesis(es) hidden');
  });

  it('keeps validation-bypass speculative docs visible for reproduction', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'NEEDS_HUMAN', reasoning: '검증 우회 가능성은 재현 확인이 필요합니다.' }),
      sessionId: '005-validation-bypass',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc({
        confidence: 6,
        issueTitle: 'Data Integrity: Invalid JSON artifacts bypass release gate validation',
        problem: 'Invalid JSON artifacts may bypass release gate validation.',
        filePath: 'scripts/evidence-manifest.mjs',
        lineRange: [165, 165],
      })],
      discussions: [makeDiscussion({
        consensusReached: true,
        avgConfidence: 6,
        reasoning: '검증 우회 가능성이 있지만 현재 근거는 약합니다.',
      })],
    });

    expect(body).toContain('1 needs-repro');
    expect(body).toContain('Data Integrity: Invalid JSON artifacts bypass release gate validation');
    expect(body).toContain('consensus → high-risk hypothesis (6%)');
    expect(body).not.toContain('1 speculative hypothesis(es) hidden');
  });

  it('redacts reviewRun and reviewQueues before rendering public summary', () => {
    const rawSecret = 'sk-testreviewsecret123456';
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only non-blocking queues remain.' }),
      sessionId: '005-redaction',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        l1: {
          ...makeReviewRun().l1,
          models: [`openrouter/${rawSecret}`],
        },
        queues: {
          activeFindings: 0,
          suggestions: 1,
          unconfirmed: 0,
          suppressed: 0,
          hallucinationRemoved: 0,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [makeDoc({ issueTitle: `Leaked ${rawSecret}` })],
        unconfirmed: [],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [],
      },
    });

    expect(body).not.toContain(rawSecret);
    expect(body).toContain('[REDACTED]');
  });

  it('renders one-line reasons for hallucination-filtered queue items', () => {
    const removed = makeDoc({
      issueTitle: 'Imaginary SQL injection',
      filePath: 'src/auth.ts',
      lineRange: [42, 42],
      confidenceTrace: { raw: 80, filtered: 20, final: 20, evidence: 0.2 },
    });
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only filtered findings remain.' }),
      sessionId: '006',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        queues: {
          activeFindings: 0,
          suggestions: 0,
          unconfirmed: 0,
          suppressed: 0,
          hallucinationRemoved: 1,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [],
        unconfirmed: [],
        suppressed: [],
        hallucinationRemoved: [removed],
        hallucinationUncertain: [],
      },
    });

    expect(body).toContain('Removed by hallucination filter');
    expect(body).toContain('1 rejected item(s) hidden from the public summary.');
    expect(body).toContain('src/auth.ts:42');
    expect(body).toContain('Imaginary SQL injection');
    expect(body).toContain('rejected by hallucination checks');
    expect(body).toContain('raw 80% -> filtered 20%');
  });

  it('renders one-line reasons for hidden low-confidence queue items', () => {
    const unconfirmed = makeDoc({
      severity: 'WARNING',
      issueTitle: 'Removal of Groq Provider Support in GitHub Actions Workflows',
      filePath: '.github/workflows/review.yml',
      lineRange: [32, 38],
      confidenceTrace: { final: 40, classPrior: 'provider-contract-flexibility' },
    });
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only low-confidence findings remain.' }),
      sessionId: '007',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        queues: {
          activeFindings: 0,
          suggestions: 0,
          unconfirmed: 1,
          suppressed: 0,
          hallucinationRemoved: 0,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [],
        unconfirmed: [unconfirmed],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [],
      },
    });

    expect(body).toContain('Unconfirmed');
    expect(body).toContain('1 low-confidence item(s) hidden from the public summary.');
    expect(body).toContain('Removal of Groq Provider Support');
    expect(body).toContain('.github/workflows/review.yml:32');
    expect(body).toContain('low-confidence class prior: provider-contract-flexibility');
  });
});

describe('mapToGitHubReview', () => {
  it('sets REQUEST_CHANGES when critical issues exist', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary(),
      evidenceDocs: [makeDoc()],
      discussions: [],
      positionIndex: index,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-03-16',
    });
    expect(review.event).toBe('REQUEST_CHANGES');
    expect(review.commit_id).toBe('abc123');
    expect(review.comments.length).toBeGreaterThan(0);
  });

  it('sets COMMENT when no critical issues', () => {
    const index: DiffPositionIndex = { 'src/foo.ts:10': 5 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'ACCEPT' }),
      evidenceDocs: [makeDoc({ severity: 'SUGGESTION', filePath: 'src/foo.ts', lineRange: [10, 12] })],
      discussions: [],
      positionIndex: index,
      headSha: 'def456',
      sessionId: '002',
      sessionDate: '2026-03-16',
    });
    expect(review.event).toBe('APPROVE');
  });

  it('filters out dismissed documents', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary(),
      evidenceDocs: [makeDoc()],
      discussions: [makeDiscussion({ finalSeverity: 'DISMISSED' })],
      positionIndex: index,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-03-16',
    });
    expect(review.comments).toHaveLength(0);
  });

  it('filters dismissed documents from the summary within L2 line tolerance', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:56': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'ACCEPT', totalDiscussions: 1 }),
      evidenceDocs: [makeDoc({ lineRange: [56, 56], confidence: 17 })],
      discussions: [makeDiscussion({ finalSeverity: 'DISMISSED', lineRange: [51, 51] })],
      positionIndex: index,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-03-16',
      reviewRun: makeReviewRun(),
    });

    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain('**no issues**');
    expect(review.body).not.toContain('Verify');
    expect(review.body).not.toContain('SQL injection vulnerability');
  });
});

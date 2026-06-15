import { describe, it, expect } from 'vitest';
import {
  mapToInlineCommentBody,
  buildReviewComments,
  buildSummaryBody,
  mapToGitHubReview,
} from '@codeagora/github/mapper.js';
import type { EvidenceDocument, DiscussionVerdict, ReviewDecisionBrief } from '@codeagora/core/types/core.js';
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

const makeDecisionBrief = (overrides?: Partial<ReviewDecisionBrief>): ReviewDecisionBrief => ({
  decision: 'ACCEPT',
  reviewedScope: {
    files: ['packages/github/src/formatter.ts'],
    areas: ['logic changes'],
    contracts: ['GitHub review body contract'],
    checks: ['file classification', 'impact analysis', 'TypeScript diagnostics sweep'],
    uncertainty: 'Non-promoted findings remain follow-up/audit only unless reproduced with complete evidence.',
  },
  completedChecks: [
    'L1 reviewers completed 5/5',
    'L2 discussions completed (0)',
    'L3 head verdict completed',
    'hallucination filter applied',
    'confidence and triage thresholds applied',
  ],
  evidenceCards: [],
  requiredActions: [],
  followUpCount: 0,
  auditCount: 0,
  demotedCount: 0,
  ...overrides,
});

function publicBodyBeforeAppendix(body: string): string {
  return body.split('<details>')[0] ?? body;
}

function nonEmptyLineCount(text: string): number {
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

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
  it('renders the first screen in Decision -> Why -> Action order within the line budget', () => {
    const body = buildSummaryBody({
      summary: makeSummary({
        decision: 'ACCEPT',
        reasoning: 'No promoted blockers remained.',
        severityCounts: {},
        totalDiscussions: 0,
      }),
      sessionId: '000-quality-accept',
      sessionDate: '2026-06-15',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun(),
      decisionBrief: makeDecisionBrief({
        followUpCount: 2,
        auditCount: 2,
      }),
    });

    const publicBody = publicBodyBeforeAppendix(body);
    expect(publicBody.indexOf('**Decision:** ACCEPT')).toBeLessThan(publicBody.indexOf('### Why This Verdict'));
    expect(publicBody.indexOf('### Why This Verdict')).toBeLessThan(publicBody.indexOf('### Required Action'));
    expect(nonEmptyLineCount(publicBody)).toBeLessThanOrEqual(25);
    expect(nonEmptyLineCount(body.split('<summary>Review audit appendix')[0] ?? body)).toBeLessThanOrEqual(80);
    expect(publicBody).toContain('0 promoted blockers, 0 promoted human gates');
    expect(publicBody).not.toContain('no issues');
  });

  it('renders only complete decision-critical evidence cards in the public body', () => {
    const card = {
      kind: 'must-fix' as const,
      source: 'evidence' as const,
      title: 'GitHub review event requests changes without complete proof',
      severity: 'CRITICAL' as const,
      filePath: 'packages/github/src/mapper.ts',
      lineRange: [151, 151] as [number, number],
      confidence: 92,
      diffFact: 'The review event is derived from the raw head verdict.',
      affectedContract: 'GitHub Action must only request changes for promoted blockers.',
      check: 'pnpm vitest run packages/github/src/tests/mapper.test.ts src/tests/github-mapper.test.ts',
      expectedActual: 'Expected public decision controls event; actual raw verdict still controls event.',
      decisionRule: 'Failing check keeps REJECT; passing check removes the blocker.',
      complete: true,
      missing: [],
    };
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'A promoted blocker remains.' }),
      sessionId: '000-quality-reject',
      sessionDate: '2026-06-15',
      evidenceDocs: [makeDoc({ filePath: card.filePath, lineRange: card.lineRange, confidence: 92 })],
      discussions: [],
      decisionBrief: makeDecisionBrief({
        decision: 'REJECT',
        evidenceCards: [card],
        requiredActions: ['Fix packages/github/src/mapper.ts:151 GitHub review event requests changes without complete proof'],
        followUpCount: 0,
        auditCount: 0,
      }),
    });

    const publicBody = publicBodyBeforeAppendix(body);
    expect(publicBody).toContain('Must-fix: `packages/github/src/mapper.ts:151` GitHub review event requests changes without complete proof');
    expect(publicBody).toContain('Diff: The review event is derived from the raw head verdict.');
    expect(publicBody).toContain('Contract: GitHub Action must only request changes for promoted blockers.');
    expect(publicBody).toContain('Check: `pnpm vitest run packages/github/src/tests/mapper.test.ts src/tests/github-mapper.test.ts`');
    expect(publicBody).toContain('Rule: Failing check keeps REJECT; passing check removes the blocker.');
    expect(nonEmptyLineCount(publicBody)).toBeLessThanOrEqual(25);
  });

  it('demotes evidence below the promotion standard out of the first-screen blocker decision', () => {
    const weakDoc = makeDoc({
      evidence: [],
      confidence: 95,
      issueTitle: 'Unbacked critical claim',
    });
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'Head rejected, but evidence is incomplete.' }),
      sessionId: '000-quality-demote',
      sessionDate: '2026-06-15',
      evidenceDocs: [weakDoc],
      discussions: [],
      reviewRun: makeReviewRun(),
    });
    const publicBody = publicBodyBeforeAppendix(body);

    expect(publicBody).toContain('**Decision:** ACCEPT');
    expect(publicBody).toContain('REJECT -> ACCEPT');
    expect(publicBody).toContain('No pre-merge action required');
    expect(publicBody).not.toContain('Must-fix:');
    expect(body).toContain('### Must Fix');
  });

  it('keeps non-blocking queues and hallucination/audit detail out of the public decision area', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only diagnostics remain.' }),
      sessionId: '000-quality-audit',
      sessionDate: '2026-06-15',
      evidenceDocs: [],
      discussions: [],
      reviewRun: makeReviewRun({
        queues: {
          activeFindings: 0,
          suggestions: 1,
          unconfirmed: 0,
          suppressed: 0,
          hallucinationRemoved: 1,
          hallucinationUncertain: 0,
        },
      }),
      reviewQueues: {
        suggestions: [makeDoc({ severity: 'SUGGESTION', issueTitle: 'Optional rename' })],
        unconfirmed: [],
        suppressed: [],
        hallucinationRemoved: [makeDoc({ issueTitle: 'Imaginary SQL injection' })],
        hallucinationUncertain: [],
      },
      decisionBrief: makeDecisionBrief({ followUpCount: 2, auditCount: 2 }),
    });
    const publicBody = publicBodyBeforeAppendix(body);

    expect(publicBody).not.toContain('Optional rename');
    expect(publicBody).not.toContain('Imaginary SQL injection');
    expect(publicBody).not.toContain('Non-blocking review queues');
    expect(body).toContain('Non-blocking review queues (2)');
    expect(body).toContain('Imaginary SQL injection');
  });

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
    expect(body).toContain('### Maintainer Decision Box');
    expect(body).toContain('| Merge now? | no |');
    expect(body).toContain('| Pre-merge required | `src/db/queries.ts:42` SQL injection vulnerability |');
    expect(body).toContain('### Maintainer Action List');
    expect(body).toContain('| `src/db/queries.ts:42` SQL injection vulnerability | User input concatenated into SQL query | 90% | Fix before merge. |');
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

    expect(body).not.toContain('1 needs-human discussion');
    expect(body).toContain('### Maintainer Decision Box');
    expect(body).toContain('| Merge now? | yes |');
    expect(body).toContain('| Pre-merge required | none |');
    expect(body).toContain('### Maintainer Action List');
    expect(body).toContain('No pre-merge maintainer action required. 1 non-blocking follow-up item(s)');
    expect(body).toContain('consensus → needs-repro critical hypothesis (26%)');
    expect(body).toContain('**Disposition:** needs-repro critical hypothesis (26%) — non-blocking unless reproduced by the listed focused check.');
    expect(body).not.toContain('### Human Gate Evidence Cards');
    expect(body).not.toContain('consensus → CRITICAL');
    expect(body).not.toContain('**Verdict:** CRITICAL — All supporters agreed');
    expect(body).toContain('| 0 | 1 | 0 |');
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

    expect(body).toContain('Confirm contract with `pnpm vitest run src/tests/desktop-bridge.test.ts`.');
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
    expect(body).toContain('Needs reproduction appendix (1)');
    expect(body).toContain('These low-confidence items are not pre-merge gates.');
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
    expect(body).toContain('confidence omitted because the claim lacked diff support');
    expect(body).not.toContain('final confidence 20%');
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

  it('renders deduped non-blocking queue triage cards with promotion criteria', () => {
    const duplicate = makeDoc({
      severity: 'WARNING',
      issueTitle: 'Broken regex prevents code-block detection',
      problem: 'The formatter may fail to detect fenced code blocks in suggestions.',
      evidence: ['The regex no longer matches multiline fenced suggestions.'],
      filePath: 'packages/github/src/formatter.ts',
      lineRange: [464, 470],
      confidenceTrace: { raw: 72, filtered: 44, final: 44, evidence: 0.5 },
    });
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT', reasoning: 'Only diagnostic queue items remain.' }),
      sessionId: '008',
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
          hallucinationUncertain: 1,
        },
      }),
      reviewQueues: {
        suggestions: [],
        unconfirmed: [duplicate],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [duplicate],
      },
    });

    expect(body).toContain('Queue counts are internal diagnostics. Item cards below are deduped by location/title');
    expect(body).toContain('- Claim: `packages/github/src/formatter.ts:464-470` — Broken regex prevents code-block detection');
    expect(body).toContain('- Evidence snippet: The regex no longer matches multiline fenced suggestions.');
    expect(body).toContain('- User impact if true: Potential follow-up only: The formatter may fail to detect fenced code blocks in suggestions.');
    expect(body).toContain('- Why non-blocking now: final confidence 44%; stage trace hidden from summary');
    expect(body).toContain('- Repro/test to promote: `pnpm vitest run packages/github/src/tests/mapper.test.ts src/tests/github-mapper.test.ts`');
    expect(body).toContain('- All visible item(s) duplicate earlier queue cards.');
    expect(body).toContain('1 duplicate queue item(s) omitted from the item cards');
    expect(body.split('Broken regex prevents code-block detection')).toHaveLength(2);
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

  it('uses the promoted decision brief for the GitHub review event', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'Raw head verdict rejected.' }),
      evidenceDocs: [makeDoc({ evidence: [] })],
      discussions: [],
      positionIndex: index,
      headSha: 'event-contract',
      sessionId: '002-event',
      sessionDate: '2026-06-15',
      decisionBrief: makeDecisionBrief({
        decision: 'ACCEPT',
        demotedCount: 1,
        followUpCount: 1,
        auditCount: 1,
      }),
    });

    expect(review.event).toBe('APPROVE');
    expect(review.verdict).toBe('ACCEPT');
    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain('REJECT -> ACCEPT');
  });

  it('uses fallback public decision brief for the event when no decision brief is provided', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'Raw head verdict rejected.' }),
      evidenceDocs: [makeDoc({ evidence: [] })],
      discussions: [],
      positionIndex: index,
      headSha: 'fallback-event-contract',
      sessionId: '002-fallback-event',
      sessionDate: '2026-06-15',
      reviewRun: makeReviewRun(),
    });

    expect(review.event).toBe('APPROVE');
    expect(review.verdict).toBe('ACCEPT');
    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain('REJECT -> ACCEPT');
  });

  it('keeps inline comments aligned to promoted decision-critical cards only', () => {
    const critical = makeDoc();
    const warning = makeDoc({
      severity: 'WARNING',
      issueTitle: 'Non-blocking logging cleanup',
      problem: 'Logging could be clearer.',
      evidence: ['console.log("debug") remains in the diff'],
      suggestion: 'Consider structured logging later.',
      filePath: 'src/db/queries.ts',
      lineRange: [50, 50],
      confidence: 72,
    });
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'Raw head verdict rejected.' }),
      evidenceDocs: [critical, warning],
      discussions: [],
      positionIndex: {
        'src/db/queries.ts:42': 14,
        'src/db/queries.ts:50': 20,
      },
      headSha: 'decision-critical-comments',
      sessionId: '002-comments',
      sessionDate: '2026-06-15',
      decisionBrief: makeDecisionBrief({
        decision: 'REJECT',
        evidenceCards: [{
          kind: 'must-fix',
          source: 'evidence',
          title: critical.issueTitle,
          severity: critical.severity,
          filePath: critical.filePath,
          lineRange: critical.lineRange,
          confidence: critical.confidence,
          diffFact: critical.evidence[0]!,
          affectedContract: critical.problem,
          check: 'pnpm typecheck',
          decisionRule: 'Blocks only while this active finding remains promoted.',
          complete: true,
          missing: [],
        }],
        requiredActions: ['Fix before merge: src/db/queries.ts:42 SQL injection vulnerability'],
      }),
    });

    expect(review.event).toBe('REQUEST_CHANGES');
    expect(review.verdict).toBe('REJECT');
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]!.body).toContain('SQL injection vulnerability');
    expect(review.comments[0]!.body).not.toContain('Non-blocking logging cleanup');
  });

  it('does not let provided decision brief re-promote dismissed findings', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'REJECT', reasoning: 'Raw head verdict rejected.' }),
      evidenceDocs: [makeDoc()],
      discussions: [makeDiscussion({ finalSeverity: 'DISMISSED' })],
      positionIndex: index,
      headSha: 'dismissed-brief-event',
      sessionId: '002-dismissed-brief',
      sessionDate: '2026-06-15',
      reviewRun: makeReviewRun(),
      decisionBrief: makeDecisionBrief({
        decision: 'REJECT',
        evidenceCards: [{
          kind: 'must-fix',
          source: 'evidence',
          title: 'SQL injection vulnerability',
          severity: 'CRITICAL',
          filePath: 'src/db/queries.ts',
          lineRange: [42, 45],
          confidence: 90,
          diffFact: 'query = "SELECT * FROM users WHERE id = " + userId',
          affectedContract: 'Database queries must not concatenate user input.',
          check: 'pnpm test',
          decisionRule: 'Blocks only while this active finding remains promoted.',
          complete: true,
          missing: [],
        }],
        requiredActions: ['Fix src/db/queries.ts:42 SQL injection vulnerability'],
      }),
    });

    expect(review.event).toBe('APPROVE');
    expect(review.comments).toHaveLength(0);
    expect(review.body).toContain('REJECT -> ACCEPT');
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

/**
 * L3 Head Verdict Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyHeadVerdictSafety, makeHeadVerdict, scanUnconfirmedQueue } from '@codeagora/core/l3/verdict.js';
import { executeBackend } from '@codeagora/core/l1/backend.js';
import type { ModeratorReport, DiscussionVerdict, EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Helpers
vi.mock('@codeagora/core/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

const mockExecuteBackend = vi.mocked(executeBackend);

// ---------------------------------------------------------------------------

function makeVerdict(overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict {
  return {
    discussionId: 'd001',
    filePath: 'src/test.ts',
    lineRange: [1, 5] as [number, number],
    finalSeverity: 'WARNING',
    reasoning: 'Some reasoning',
    consensusReached: true,
    rounds: 1,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ModeratorReport> = {}): ModeratorReport {
  return {
    discussions: [],
    roundsPerDiscussion: {},
    unconfirmedIssues: [],
    suggestions: [],
    summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
    ...overrides,
  };
}

function makeEvidenceDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Some Issue',
    problem: 'In file.ts:10',
    evidence: ['Evidence item 1'],
    severity: 'WARNING',
    suggestion: 'Fix it',
    filePath: 'file.ts',
    lineRange: [10, 15],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

afterEach(() => {
  mockExecuteBackend.mockReset();
});

describe('makeHeadVerdict()', () => {
  describe('ACCEPT decision', () => {
    it('returns ACCEPT when there are no discussions at all', async () => {
      const report = makeReport();
      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
    });

    it('does not call LLM head for a clean report with no actionable findings', async () => {
      mockExecuteBackend.mockResolvedValue(
        'DECISION: NEEDS_HUMAN\nREASONING: No issues were provided.\nQUESTIONS: inspect manually',
      );
      const report = makeReport();

      const verdict = await makeHeadVerdict(report, {
        backend: 'api',
        model: 'head-model',
        provider: 'test-provider',
        enabled: true,
      });

      expect(verdict.decision).toBe('ACCEPT');
      expect(mockExecuteBackend).not.toHaveBeenCalled();
    });

    it('returns ACCEPT when all discussions are consensus and none are critical', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'WARNING', consensusReached: true }),
          makeVerdict({ discussionId: 'd002', finalSeverity: 'SUGGESTION', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
    });

    it('ACCEPT reasoning mentions code is ready to merge', async () => {
      const report = makeReport();
      const verdict = await makeHeadVerdict(report);

      expect(verdict.reasoning.toLowerCase()).toContain('merge');
    });

    it('ACCEPT verdict has no questionsForHuman', async () => {
      const report = makeReport();
      const verdict = await makeHeadVerdict(report);

      expect(verdict.questionsForHuman).toBeUndefined();
    });
  });

  describe('REJECT due to CRITICAL issues', () => {
    it('returns REJECT when a CRITICAL discussion exists', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('REJECT');
    });

    it('returns REJECT when a HARSHLY_CRITICAL discussion exists', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'HARSHLY_CRITICAL', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('REJECT');
    });

    it('REJECT reasoning mentions the number of critical issues', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true }),
          makeVerdict({ discussionId: 'd002', finalSeverity: 'CRITICAL', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.reasoning).toContain('2');
    });

    it('REJECT with only critical issues and no escalations has no questionsForHuman', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.questionsForHuman).toBeUndefined();
    });

    it('rejects high-confidence critical issues before strict-mode warning routing', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd-critical', finalSeverity: 'CRITICAL', consensusReached: true, avgConfidence: 60 }),
          makeVerdict({ discussionId: 'd-warning-1', finalSeverity: 'WARNING', consensusReached: true }),
          makeVerdict({ discussionId: 'd-warning-2', finalSeverity: 'WARNING', consensusReached: true }),
          makeVerdict({ discussionId: 'd-warning-3', finalSeverity: 'WARNING', consensusReached: true }),
        ],
      });

      const verdict = await makeHeadVerdict(report, undefined, 'strict');

      expect(verdict.decision).toBe('REJECT');
    });
  });

  describe('REJECT with mixed critical + escalated issues', () => {
    it('returns REJECT when both critical and escalated issues exist', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true }),
          makeVerdict({ discussionId: 'd002', finalSeverity: 'WARNING', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('REJECT');
    });

    it('includes questionsForHuman when critical + escalated both present', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true }),
          makeVerdict({ discussionId: 'd002', finalSeverity: 'WARNING', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.questionsForHuman).toBeDefined();
      expect(verdict.questionsForHuman!.length).toBeGreaterThan(0);
    });
  });

  describe('NEEDS_HUMAN decision', () => {
    it('returns NEEDS_HUMAN when there are escalated issues but no critical ones', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'WARNING', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
    });

    it('NEEDS_HUMAN includes questionsForHuman listing each escalated issue', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'WARNING', consensusReached: false }),
          makeVerdict({ discussionId: 'd002', finalSeverity: 'SUGGESTION', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.questionsForHuman).toHaveLength(2);
    });

    it('NEEDS_HUMAN questionsForHuman entries reference the discussion IDs', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd042', finalSeverity: 'WARNING', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.questionsForHuman![0]).toContain('d042');
    });

    it('NEEDS_HUMAN reasoning mentions consensus was not reached', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd001', finalSeverity: 'WARNING', consensusReached: false }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.reasoning.toLowerCase()).toContain('consensus');
    });

    it('routes low-confidence critical discussions to human review instead of reject', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-low-confidence',
            finalSeverity: 'CRITICAL',
            consensusReached: false,
            avgConfidence: 30,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-low-confidence');
    });

    it('routes critical confidence below 60 to human review at the blocking boundary', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-boundary-critical',
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 51,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-boundary-critical');
    });

    it('routes harshly critical confidence below 60 to human review at the blocking boundary', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-boundary-harshly-critical',
            finalSeverity: 'HARSHLY_CRITICAL',
            consensusReached: true,
            avgConfidence: 59,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-boundary-harshly-critical');
    });

    it('accepts when only speculative critical discussions remain below 20 confidence', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-speculative-critical',
            finalSeverity: 'CRITICAL',
            consensusReached: false,
            avgConfidence: 19,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
      expect(verdict.questionsForHuman).toBeUndefined();
    });

    it('keeps high-risk speculative critical discussions on the human review path', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-high-risk-speculative',
            finalSeverity: 'CRITICAL',
            consensusReached: false,
            avgConfidence: 4,
            reasoning: 'Potential authorization bypass across a permission boundary, but evidence is weak.',
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.join('\n')).toContain('d-high-risk-speculative');
    });

    it('routes critical confidence 20 to human review at the speculative boundary', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-speculative-boundary',
            finalSeverity: 'CRITICAL',
            consensusReached: false,
            avgConfidence: 20,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-speculative-boundary');
    });

    it('rejects critical confidence 60 as blocking', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-blocking-critical',
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 60,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('REJECT');
    });

    it('routes forced tie-break critical discussions to human review even above the confidence boundary', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-forced-tie',
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 59,
            resolutionSource: 'forced-tie-break',
            reasoning: 'Tie broken by forced decision on last round (1 agree, 1 disagree)',
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-forced-tie');
    });

    it('uses resolutionSource instead of parsing reasoning for forced tie-break criticals', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-forced-source',
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 59,
            resolutionSource: 'forced-tie-break',
            reasoning: 'Moderator summarized a split vote.',
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('NEEDS_HUMAN');
      expect(verdict.questionsForHuman?.[0]).toContain('d-forced-source');
    });

    it('does not block on critical discussions with unknown:0 locations', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-unknown-critical',
            filePath: 'unknown',
            lineRange: [0, 0],
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 99,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
      expect(verdict.questionsForHuman).toBeUndefined();
    });

    it('does not escalate unresolved discussions with invalid line ranges', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-invalid-range',
            lineRange: [12, 3],
            finalSeverity: 'WARNING',
            consensusReached: false,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
      expect(verdict.questionsForHuman).toBeUndefined();
    });

    it('does not count invalid warning locations toward strict-mode escalation', async () => {
      const report = makeReport({
        discussions: [
          makeVerdict({ discussionId: 'd-warning-1', finalSeverity: 'WARNING', consensusReached: true }),
          makeVerdict({ discussionId: 'd-warning-2', finalSeverity: 'WARNING', consensusReached: true }),
          makeVerdict({
            discussionId: 'd-invalid-warning',
            filePath: 'unknown',
            lineRange: [0, 0],
            finalSeverity: 'WARNING',
            consensusReached: true,
          }),
        ],
      });

      const verdict = await makeHeadVerdict(report, undefined, 'strict');

      expect(verdict.decision).toBe('ACCEPT');
      expect(verdict.questionsForHuman).toBeUndefined();
    });

    it('omits invalid-location discussions from the LLM head prompt', async () => {
      mockExecuteBackend.mockResolvedValue('DECISION: ACCEPT\nREASONING: Only actionable discussions remain.\nQUESTIONS: none');
      const report = makeReport({
        discussions: [
          makeVerdict({
            discussionId: 'd-actionable-warning',
            finalSeverity: 'WARNING',
            consensusReached: true,
            resolutionSource: 'supporter-consensus',
          }),
          makeVerdict({
            discussionId: 'd-invalid-critical',
            filePath: 'unknown',
            lineRange: [0, 0],
            finalSeverity: 'CRITICAL',
            consensusReached: true,
            avgConfidence: 99,
          }),
        ],
        roundsPerDiscussion: {
          'd-invalid-critical': [{
            round: 1,
            moderatorPrompt: 'Discuss invalid critical.',
            supporterResponses: [{
              supporterId: 's1',
              stance: 'agree',
              response: 'This invalid critical should not be shown to the head model.',
            }],
          }],
        },
        summary: { totalDiscussions: 2, resolved: 2, escalated: 0 },
      });

      const verdict = await makeHeadVerdict(report, {
        backend: 'api',
        model: 'head-model',
        provider: 'test-provider',
        enabled: true,
      });

      expect(verdict.decision).toBe('ACCEPT');
      expect(mockExecuteBackend).toHaveBeenCalledTimes(1);
      const backendInput = mockExecuteBackend.mock.calls[0]?.[0];
      expect(backendInput).toBeDefined();
      expect(backendInput?.prompt).toContain('d-actionable-warning');
      expect(backendInput?.prompt).not.toContain('d-invalid-critical');
      expect(backendInput?.prompt).not.toContain('unknown:0');
      expect(backendInput?.prompt).toContain('CRITICAL: 0 issues');
      expect(backendInput?.prompt).toContain('Total discussions: 1');
      expect(backendInput?.prompt).toContain('resolution source: supporter-consensus');
    });
  });
});

describe('applyHeadVerdictSafety()', () => {
  it('overrides ACCEPT to REJECT when actionable critical discussions remain', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-critical',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 60,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'ACCEPT',
      reasoning: 'LLM says safe.',
    }, report);

    expect(verdict.decision).toBe('REJECT');
    expect(verdict.reasoning).toContain('Head safety guard');
  });

  it('overrides REJECT to NEEDS_HUMAN for borderline critical confidence below 60', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-borderline-critical',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 51,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'LLM rejected a borderline critical finding.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.questionsForHuman?.[0]).toContain('d-borderline-critical');
  });

  it('overrides ACCEPT to NEEDS_HUMAN when discussions are unresolved', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-escalated',
          finalSeverity: 'DISMISSED',
          consensusReached: false,
          avgConfidence: 55,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'ACCEPT',
      reasoning: 'LLM says dismissed.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.questionsForHuman?.[0]).toContain('d-escalated');
  });

  it('leaves REJECT unchanged when actionable critical discussions remain', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({ discussionId: 'd001', finalSeverity: 'CRITICAL', consensusReached: true, avgConfidence: 60 }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'Already blocking.',
    }, report);

    expect(verdict).toEqual({ decision: 'REJECT', reasoning: 'Already blocking.' });
  });

  it('overrides REJECT to NEEDS_HUMAN when only low-confidence critical discussions remain', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-low-confidence',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 50,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'LLM rejected unverified critical.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.questionsForHuman?.[0]).toContain('d-low-confidence');
  });

  it('overrides REJECT to ACCEPT when only speculative critical discussions remain', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-speculative-critical',
          finalSeverity: 'CRITICAL',
          consensusReached: false,
          avgConfidence: 4,
        }),
        makeVerdict({
          discussionId: 'd-dismissed',
          finalSeverity: 'DISMISSED',
          consensusReached: true,
          avgConfidence: 0,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'LLM treated speculative findings as blocking.',
      questionsForHuman: ['Should a human inspect d-speculative-critical?'],
    }, report);

    expect(verdict.decision).toBe('ACCEPT');
    expect(verdict.reasoning).toContain('speculative critical');
    expect(verdict.questionsForHuman).toBeUndefined();
  });

  it('does not override high-risk speculative critical discussions to ACCEPT', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-high-risk-speculative',
          finalSeverity: 'CRITICAL',
          consensusReached: false,
          avgConfidence: 4,
          reasoning: 'Possible SQL injection, but the current trace is weak.',
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'ACCEPT',
      reasoning: 'LLM accepted a weak security finding.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.questionsForHuman?.join('\n')).toContain('d-high-risk-speculative');
  });

  it('preserves head NEEDS_HUMAN when Korean reasoning flags validation bypass risk', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-validation-bypass',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 6,
          reasoning: 'Tie broken by forced decision on last round (1 agree, 1 disagree)',
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'NEEDS_HUMAN',
      reasoning: 'JSON 파싱 실패 시 검증 우회 가능성이 있어 재현 확인 대상으로 남겨야 합니다.',
      questionsForHuman: ['d-validation-bypass 재현 여부 확인'],
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.reasoning).toContain('검증 우회');
    expect(verdict.questionsForHuman?.[0]).toContain('d-validation-bypass');
  });

  it('lowers head REJECT to NEEDS_HUMAN for speculative validation-bypass claims', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-validation-bypass',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 6,
          reasoning: 'Tie broken by forced decision on last round (1 agree, 1 disagree)',
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'Potential validation bypass in release gate evidence parsing.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.reasoning).toContain('high-risk verification path');
  });

  it('does not override LLM verdicts for an empty moderator report', () => {
    const verdict = applyHeadVerdictSafety({
      decision: 'NEEDS_HUMAN',
      reasoning: 'LLM asked for manual inspection.',
    }, makeReport());

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.reasoning).toBe('LLM asked for manual inspection.');
  });

  it('overrides REJECT to NEEDS_HUMAN for forced tie-break critical discussions', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-forced-tie',
          finalSeverity: 'CRITICAL',
          consensusReached: true,
          avgConfidence: 59,
          resolutionSource: 'forced-tie-break',
          reasoning: 'Tie broken by forced decision on last round (1 agree, 1 disagree)',
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'REJECT',
      reasoning: 'LLM rejected a forced tie-break critical.',
    }, report);

    expect(verdict.decision).toBe('NEEDS_HUMAN');
    expect(verdict.questionsForHuman?.[0]).toContain('d-forced-tie');
  });

  it('does not let invalid critical locations override an LLM accept verdict', () => {
    const report = makeReport({
      discussions: [
        makeVerdict({
          discussionId: 'd-unknown-critical',
          filePath: 'unknown',
          lineRange: [0, 0],
          finalSeverity: 'HARSHLY_CRITICAL',
          consensusReached: true,
          avgConfidence: 99,
        }),
      ],
    });

    const verdict = applyHeadVerdictSafety({
      decision: 'ACCEPT',
      reasoning: 'LLM says safe.',
    }, report);

    expect(verdict.decision).toBe('ACCEPT');
    expect(verdict.reasoning).toBe('LLM says safe.');
  });
});

// ---------------------------------------------------------------------------

describe('scanUnconfirmedQueue()', () => {
  describe('empty queue', () => {
    it('returns empty promoted and dismissed arrays for empty input', () => {
      const result = scanUnconfirmedQueue([]);

      expect(result.promoted).toEqual([]);
      expect(result.dismissed).toEqual([]);
    });
  });

  describe('CRITICAL items', () => {
    it('promotes a single CRITICAL item', () => {
      const docs = [makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Null deref' })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(1);
      expect(result.dismissed).toHaveLength(0);
    });

    it('promotes all CRITICAL items when multiple exist', () => {
      const docs = [
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Bug A' }),
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Bug B' }),
      ];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(2);
    });
  });

  describe('WARNING items', () => {
    it('dismisses a single WARNING item', () => {
      const docs = [makeEvidenceDoc({ severity: 'WARNING', issueTitle: 'Style issue' })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.dismissed).toHaveLength(1);
      expect(result.promoted).toHaveLength(0);
    });
  });

  describe('SUGGESTION items', () => {
    it('dismisses a single SUGGESTION item', () => {
      const docs = [makeEvidenceDoc({ severity: 'SUGGESTION', issueTitle: 'Consider refactor' })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.dismissed).toHaveLength(1);
      expect(result.promoted).toHaveLength(0);
    });
  });

  describe('HARSHLY_CRITICAL items', () => {
    it('promotes HARSHLY_CRITICAL alongside CRITICAL', () => {
      const docs = [makeEvidenceDoc({ severity: 'HARSHLY_CRITICAL', issueTitle: 'XSS Injection' })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(1);
      expect(result.dismissed).toHaveLength(0);
    });

    it('dismisses CRITICAL items with unknown:0 locations instead of promoting them', () => {
      const docs = [makeEvidenceDoc({
        severity: 'CRITICAL',
        issueTitle: 'Ungrounded critical',
        filePath: 'unknown',
        lineRange: [0, 0],
      })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(0);
      expect(result.dismissed).toHaveLength(1);
      expect(result.dismissed[0].issueTitle).toBe('Ungrounded critical');
    });

    it('dismisses critical items with inverted line ranges instead of promoting them', () => {
      const docs = [makeEvidenceDoc({
        severity: 'CRITICAL',
        issueTitle: 'Invalid range critical',
        lineRange: [15, 4],
      })];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(0);
      expect(result.dismissed).toHaveLength(1);
      expect(result.dismissed[0].issueTitle).toBe('Invalid range critical');
    });
  });

  describe('mixed severities', () => {
    it('correctly splits a mixed list into promoted and dismissed', () => {
      const docs = [
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Critical Bug' }),
        makeEvidenceDoc({ severity: 'WARNING', issueTitle: 'Warning Issue' }),
        makeEvidenceDoc({ severity: 'SUGGESTION', issueTitle: 'Minor Suggestion' }),
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Another Critical' }),
      ];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted).toHaveLength(2);
      expect(result.dismissed).toHaveLength(2);
    });

    it('promoted items are all CRITICAL', () => {
      const docs = [
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Critical Bug' }),
        makeEvidenceDoc({ severity: 'WARNING', issueTitle: 'Warning Issue' }),
      ];

      const result = scanUnconfirmedQueue(docs);

      for (const doc of result.promoted) {
        expect(doc.severity).toBe('CRITICAL');
      }
    });

    it('dismissed items contain no CRITICAL severity', () => {
      const docs = [
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Critical Bug' }),
        makeEvidenceDoc({ severity: 'WARNING', issueTitle: 'Warning Issue' }),
        makeEvidenceDoc({ severity: 'SUGGESTION', issueTitle: 'Suggestion' }),
      ];

      const result = scanUnconfirmedQueue(docs);

      for (const doc of result.dismissed) {
        expect(doc.severity).not.toBe('CRITICAL');
      }
    });

    it('promoted + dismissed covers all input items', () => {
      const docs = [
        makeEvidenceDoc({ severity: 'CRITICAL', issueTitle: 'Bug' }),
        makeEvidenceDoc({ severity: 'WARNING', issueTitle: 'Warning' }),
        makeEvidenceDoc({ severity: 'SUGGESTION', issueTitle: 'Suggestion' }),
      ];

      const result = scanUnconfirmedQueue(docs);

      expect(result.promoted.length + result.dismissed.length).toBe(docs.length);
    });
  });
});

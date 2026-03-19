/**
 * L3 Head Verdict Tests
 */

import { describe, it, expect } from 'vitest';
import { makeHeadVerdict, scanUnconfirmedQueue } from '@codeagora/core/l3/verdict.js';
import type { ModeratorReport, DiscussionVerdict, EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Helpers
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

describe('makeHeadVerdict()', () => {
  describe('ACCEPT decision', () => {
    it('returns ACCEPT when there are no discussions at all', async () => {
      const report = makeReport();
      const verdict = await makeHeadVerdict(report);

      expect(verdict.decision).toBe('ACCEPT');
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

import { describe, it, expect } from 'vitest';
import { QualityTracker } from '@codeagora/core/l0/quality-tracker.js';
import type { ReviewOutput, Discussion, DiscussionVerdict, EvidenceDocument } from '@codeagora/core/types/core.js';

function makeEvidenceDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'A substantial problem description with enough detail for analysis.',
    evidence: ['Evidence point 1', 'Evidence point 2'],
    severity: 'WARNING',
    suggestion: 'Replace the broken code with correct implementation.',
    filePath: 'src/auth.ts',
    lineRange: [10, 15] as [number, number],
    ...overrides,
  };
}

function makeReviewOutput(
  reviewerId: string,
  docs: EvidenceDocument[],
  model = 'llama-3.3-70b'
): ReviewOutput {
  return {
    reviewerId,
    model,
    group: 'group-1',
    evidenceDocs: docs,
    rawResponse: 'raw',
    status: 'success',
  };
}

function makeDiscussion(id: string, filePath: string, lineRange: [number, number]): Discussion {
  return {
    id,
    severity: 'WARNING',
    issueTitle: 'Test',
    filePath,
    lineRange,
    codeSnippet: '',
    evidenceDocs: [],
    status: 'resolved',
  };
}

function makeVerdict(
  discussionId: string,
  finalSeverity: string,
  consensusReached = true
): DiscussionVerdict {
  return {
    discussionId,
    filePath: 'src/test.ts',
    lineRange: [1, 5] as [number, number],
    finalSeverity: finalSeverity as DiscussionVerdict['finalSeverity'],
    reasoning: 'Test reasoning',
    consensusReached,
    rounds: 1,
  };
}

describe('QualityTracker', () => {
  it('should record specificity score after L1', () => {
    const tracker = new QualityTracker();
    const doc = makeEvidenceDoc();
    const output = makeReviewOutput('r1', [doc]);

    tracker.recordReviewerOutput(output, 'groq', 'session-1');

    const data = tracker.getReviewerData('r1');
    expect(data).toBeDefined();
    expect(data!.specificityScore).toBeGreaterThan(0);
    expect(data!.issuesRaised).toBe(1);
    expect(data!.peerValidationRate).toBeNull();
    expect(data!.headAcceptanceRate).toBeNull();
  });

  it('should skip forfeit reviewers', () => {
    const tracker = new QualityTracker();
    const output: ReviewOutput = {
      reviewerId: 'r1',
      model: 'test',
      group: 'g1',
      evidenceDocs: [],
      rawResponse: '',
      status: 'forfeit',
      error: 'timeout',
    };

    tracker.recordReviewerOutput(output, 'groq', 'session-1');
    expect(tracker.getReviewerData('r1')).toBeUndefined();
  });

  it('should record peer validation from discussion verdicts', () => {
    const tracker = new QualityTracker();

    // Reviewer raises 2 issues
    const doc1 = makeEvidenceDoc({ filePath: 'a.ts', lineRange: [1, 5] });
    const doc2 = makeEvidenceDoc({ filePath: 'b.ts', lineRange: [10, 20] });
    tracker.recordReviewerOutput(
      makeReviewOutput('r1', [doc1, doc2]),
      'groq',
      's1'
    );

    // Both issues became discussions
    const discussions = [
      makeDiscussion('d001', 'a.ts', [1, 5]),
      makeDiscussion('d002', 'b.ts', [10, 20]),
    ];

    // One validated, one dismissed
    const verdicts = [
      makeVerdict('d001', 'WARNING'),
      makeVerdict('d002', 'DISMISSED'),
    ];

    tracker.recordDiscussionResults(discussions, verdicts);

    const data = tracker.getReviewerData('r1');
    expect(data!.peerValidationRate).toBe(0.5); // 1/2 not dismissed
    expect(data!.headAcceptanceRate).toBe(0.5); // 1/2 accepted as WARNING
  });

  it('should give 1.0 peer validation when no issues go to discussion', () => {
    const tracker = new QualityTracker();

    // Reviewer raises issue but it doesn't become a discussion
    const doc = makeEvidenceDoc({ filePath: 'x.ts', lineRange: [1, 1] });
    tracker.recordReviewerOutput(makeReviewOutput('r1', [doc]), 'groq', 's1');

    // No discussions matching this reviewer's issues
    tracker.recordDiscussionResults([], []);

    const data = tracker.getReviewerData('r1');
    expect(data!.peerValidationRate).toBe(1.0); // no negative signal
  });

  it('should compute composite Q correctly', () => {
    const tracker = new QualityTracker();

    const doc = makeEvidenceDoc({ filePath: 'a.ts', lineRange: [1, 5] });
    tracker.recordReviewerOutput(
      makeReviewOutput('r1', [doc]),
      'groq',
      's1'
    );

    const discussions = [makeDiscussion('d001', 'a.ts', [1, 5])];
    const verdicts = [makeVerdict('d001', 'CRITICAL')];

    tracker.recordDiscussionResults(discussions, verdicts);

    const rewards = tracker.finalizeRewards();
    expect(rewards.has('r1')).toBe(true);

    const result = rewards.get('r1')!;
    // Q = 0.45 * headAcceptance + 0.35 * peerValidation + 0.20 * specificity
    // headAcceptance = 1.0 (1/1 accepted)
    // peerValidation = 1.0 (1/1 not dismissed)
    // specificity > 0
    expect(result.compositeQ).toBeGreaterThan(0.5);
    expect(result.reward).toBe(1);
  });

  it('should return reward=0 when Q < 0.5', () => {
    const tracker = new QualityTracker();

    // Reviewer raises 3 issues, all dismissed
    const docs = [
      makeEvidenceDoc({ filePath: 'a.ts', lineRange: [1, 1] }),
      makeEvidenceDoc({ filePath: 'b.ts', lineRange: [2, 2] }),
      makeEvidenceDoc({ filePath: 'c.ts', lineRange: [3, 3] }),
    ];
    tracker.recordReviewerOutput(
      makeReviewOutput('r1', docs),
      'groq',
      's1'
    );

    const discussions = [
      makeDiscussion('d001', 'a.ts', [1, 1]),
      makeDiscussion('d002', 'b.ts', [2, 2]),
      makeDiscussion('d003', 'c.ts', [3, 3]),
    ];
    const verdicts = [
      makeVerdict('d001', 'DISMISSED'),
      makeVerdict('d002', 'DISMISSED'),
      makeVerdict('d003', 'DISMISSED'),
    ];

    tracker.recordDiscussionResults(discussions, verdicts);

    const rewards = tracker.finalizeRewards();
    const result = rewards.get('r1')!;
    // headAcceptance = 0, peerValidation = 0, specificity > 0 but small weight
    expect(result.compositeQ).toBeLessThan(0.5);
    expect(result.reward).toBe(0);
  });

  it('should not finalize if signals are incomplete', () => {
    const tracker = new QualityTracker();

    const doc = makeEvidenceDoc();
    tracker.recordReviewerOutput(
      makeReviewOutput('r1', [doc]),
      'groq',
      's1'
    );

    // No discussion results recorded
    const rewards = tracker.finalizeRewards();
    expect(rewards.size).toBe(0);
  });

  it('should generate ReviewRecords for persistence', () => {
    const tracker = new QualityTracker();

    const doc = makeEvidenceDoc({ filePath: 'a.ts', lineRange: [1, 5] });
    tracker.recordReviewerOutput(
      makeReviewOutput('r1', [doc], 'deepseek-r1'),
      'nim',
      's1'
    );

    const discussions = [makeDiscussion('d001', 'a.ts', [1, 5])];
    const verdicts = [makeVerdict('d001', 'WARNING')];
    tracker.recordDiscussionResults(discussions, verdicts);

    const records = tracker.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].reviewId).toBe('r1');
    expect(records[0].modelId).toBe('deepseek-r1');
    expect(records[0].provider).toBe('nim');
    expect(records[0].compositeQ).toBeGreaterThan(0);
    expect(records[0].rewardSignal).toBe(1);
  });
});

/**
 * QualityTracker — zero-issue reviewer bandit reward fix (#242)
 */

import { describe, it, expect } from 'vitest';
import { QualityTracker } from '../l0/quality-tracker.js';
import type { ReviewOutput, Discussion, DiscussionVerdict, EvidenceDocument } from '../types/core.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDoc(filePath: string, line: number): EvidenceDocument {
  return {
    issueTitle: 'Test issue',
    problem: 'A problem exists here',
    evidence: ['line ref L1', 'second evidence point with `codeToken` usage'],
    severity: 'WARNING',
    suggestion: 'Fix the issue by replacing the call',
    filePath,
    lineRange: [line, line + 2],
  };
}

function makeReviewOutput(
  reviewerId: string,
  model: string,
  docs: EvidenceDocument[]
): ReviewOutput {
  return {
    reviewerId,
    model,
    group: 'g1',
    evidenceDocs: docs,
    rawResponse: '## Issue: ...',
    status: 'success',
  };
}

function makeDiscussion(id: string, filePath: string, line: number): Discussion {
  return {
    id,
    severity: 'WARNING',
    issueTitle: 'Test issue',
    filePath,
    lineRange: [line, line + 2],
    codeSnippet: '',
    evidenceDocs: [],
    status: 'resolved',
  };
}

function makeVerdict(
  discussionId: string,
  filePath: string,
  line: number,
  finalSeverity: DiscussionVerdict['finalSeverity']
): DiscussionVerdict {
  return {
    discussionId,
    filePath,
    lineRange: [line, line + 2],
    finalSeverity,
    reasoning: 'test',
    consensusReached: true,
    rounds: 1,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QualityTracker — zero-issue reviewer (#242)', () => {
  it('zero-issue reviewer gets peerValidationRate = 0.5', () => {
    const tracker = new QualityTracker();
    tracker.recordReviewerOutput(makeReviewOutput('r1', 'model-a', []), 'openrouter', 'diff-1');
    tracker.recordDiscussionResults([], []);

    const data = tracker.getReviewerData('r1');
    expect(data).toBeDefined();
    expect(data!.peerValidationRate).toBe(0.5);
  });

  it('zero-issue reviewer gets headAcceptanceRate = 0.5', () => {
    const tracker = new QualityTracker();
    tracker.recordReviewerOutput(makeReviewOutput('r1', 'model-a', []), 'openrouter', 'diff-1');
    tracker.recordDiscussionResults([], []);

    const data = tracker.getReviewerData('r1');
    expect(data!.headAcceptanceRate).toBe(0.5);
  });

  it('zero-issue reviewer gets noIssuesRaised = true', () => {
    const tracker = new QualityTracker();
    tracker.recordReviewerOutput(makeReviewOutput('r1', 'model-a', []), 'openrouter', 'diff-1');
    tracker.recordDiscussionResults([], []);

    const data = tracker.getReviewerData('r1');
    expect(data!.noIssuesRaised).toBe(true);
  });

  it('zero-issue reviewer is NOT included in finalizeRewards() results', () => {
    const tracker = new QualityTracker();
    tracker.recordReviewerOutput(makeReviewOutput('r1', 'model-a', []), 'openrouter', 'diff-1');
    tracker.recordDiscussionResults([], []);

    const rewards = tracker.finalizeRewards();
    expect(rewards.has('r1')).toBe(false);
  });

  it('normal reviewer (raised issues, some accepted) IS included in finalizeRewards()', () => {
    const tracker = new QualityTracker();
    const doc = makeDoc('src/foo.ts', 10);
    tracker.recordReviewerOutput(makeReviewOutput('r2', 'model-b', [doc]), 'openrouter', 'diff-1');

    const discussion = makeDiscussion('d1', 'src/foo.ts', 10);
    const verdict = makeVerdict('d1', 'src/foo.ts', 10, 'WARNING');
    tracker.recordDiscussionResults([discussion], [verdict]);

    const rewards = tracker.finalizeRewards();
    expect(rewards.has('r2')).toBe(true);
  });

  it('normal reviewer reward is calculated from compositeQ', () => {
    const tracker = new QualityTracker();
    const doc = makeDoc('src/bar.ts', 20);
    tracker.recordReviewerOutput(makeReviewOutput('r3', 'model-c', [doc]), 'openrouter', 'diff-1');

    const discussion = makeDiscussion('d2', 'src/bar.ts', 20);
    const verdict = makeVerdict('d2', 'src/bar.ts', 20, 'CRITICAL');
    tracker.recordDiscussionResults([discussion], [verdict]);

    const rewards = tracker.finalizeRewards();
    const result = rewards.get('r3');
    expect(result).toBeDefined();
    expect(result!.reward).toBeTypeOf('number');
    expect([0, 1]).toContain(result!.reward);
    expect(result!.compositeQ).toBeGreaterThan(0);
  });

  it('normal reviewer peerValidationRate and headAcceptanceRate are calculated from verdicts', () => {
    const tracker = new QualityTracker();
    const doc1 = makeDoc('src/a.ts', 1);
    const doc2 = makeDoc('src/a.ts', 10);
    tracker.recordReviewerOutput(
      makeReviewOutput('r4', 'model-d', [doc1, doc2]),
      'openrouter',
      'diff-1'
    );

    const d1 = makeDiscussion('d3', 'src/a.ts', 1);
    const d2 = makeDiscussion('d4', 'src/a.ts', 10);
    // d3: accepted, d4: dismissed
    const v1 = makeVerdict('d3', 'src/a.ts', 1, 'WARNING');
    const v2 = makeVerdict('d4', 'src/a.ts', 10, 'DISMISSED');
    tracker.recordDiscussionResults([d1, d2], [v1, v2]);

    const data = tracker.getReviewerData('r4');
    expect(data!.noIssuesRaised).toBeUndefined();
    // peerValidationRate: 1 not-dismissed out of 2 = 0.5
    expect(data!.peerValidationRate).toBe(0.5);
    // headAcceptanceRate: 1 accepted (WARNING) out of 2 = 0.5
    expect(data!.headAcceptanceRate).toBe(0.5);
  });

  it('all-zero-issue session: finalizeRewards returns empty map (no bandit updates)', () => {
    const tracker = new QualityTracker();
    tracker.recordReviewerOutput(makeReviewOutput('r5', 'model-e', []), 'openrouter', 'diff-1');
    tracker.recordReviewerOutput(makeReviewOutput('r6', 'model-f', []), 'anthropic', 'diff-1');
    tracker.recordDiscussionResults([], []);

    const rewards = tracker.finalizeRewards();
    expect(rewards.size).toBe(0);
  });
});

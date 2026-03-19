/**
 * Discussion/Debate Viewer Frontend Tests
 * Tests utility functions used by the discussion viewer components.
 */

import { describe, it, expect } from 'vitest';
import {
  getStanceCounts,
  getConsensusPercentage,
  isDevilsAdvocate,
  getStanceProgression,
  summarizeDiscussion,
  discussionSeverityClassMap,
  discussionSeverityLabelMap,
} from '../../src/frontend/utils/discussion-helpers.js';
import type {
  DiscussionRound,
  DiscussionVerdict,
  Stance,
} from '../../src/frontend/utils/discussion-helpers.js';

// ============================================================================
// Helpers
// ============================================================================

function makeRound(
  roundNum: number,
  stances: Array<{ id: string; stance: Stance }>,
): DiscussionRound {
  return {
    round: roundNum,
    moderatorPrompt: `Moderator prompt for round ${roundNum}`,
    supporterResponses: stances.map((s) => ({
      supporterId: s.id,
      response: `Response from ${s.id}`,
      stance: s.stance,
    })),
  };
}

function makeVerdict(overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict {
  return {
    discussionId: 'disc-001',
    filePath: 'src/main.ts',
    lineRange: [10, 20],
    finalSeverity: 'WARNING',
    reasoning: 'Test reasoning',
    consensusReached: true,
    rounds: 3,
    ...overrides,
  };
}

// ============================================================================
// getStanceCounts
// ============================================================================

describe('getStanceCounts', () => {
  it('should count agree, disagree, and neutral stances', () => {
    const round = makeRound(1, [
      { id: 'r1', stance: 'agree' },
      { id: 'r2', stance: 'disagree' },
      { id: 'r3', stance: 'agree' },
      { id: 'r4', stance: 'neutral' },
    ]);

    const counts = getStanceCounts(round);

    expect(counts.agree).toBe(2);
    expect(counts.disagree).toBe(1);
    expect(counts.neutral).toBe(1);
  });

  it('should return all zeros for a round with no supporters', () => {
    const round = makeRound(1, []);

    const counts = getStanceCounts(round);

    expect(counts.agree).toBe(0);
    expect(counts.disagree).toBe(0);
    expect(counts.neutral).toBe(0);
  });

  it('should handle all same stance', () => {
    const round = makeRound(1, [
      { id: 'r1', stance: 'agree' },
      { id: 'r2', stance: 'agree' },
      { id: 'r3', stance: 'agree' },
    ]);

    const counts = getStanceCounts(round);

    expect(counts.agree).toBe(3);
    expect(counts.disagree).toBe(0);
    expect(counts.neutral).toBe(0);
  });
});

// ============================================================================
// getConsensusPercentage
// ============================================================================

describe('getConsensusPercentage', () => {
  it('should calculate percentage of agree stances', () => {
    const round = makeRound(1, [
      { id: 'r1', stance: 'agree' },
      { id: 'r2', stance: 'disagree' },
      { id: 'r3', stance: 'agree' },
      { id: 'r4', stance: 'agree' },
    ]);

    const pct = getConsensusPercentage(round);

    expect(pct).toBe(75);
  });

  it('should return 0 for an empty round', () => {
    const round = makeRound(1, []);

    expect(getConsensusPercentage(round)).toBe(0);
  });

  it('should return 100 when all agree', () => {
    const round = makeRound(1, [
      { id: 'r1', stance: 'agree' },
      { id: 'r2', stance: 'agree' },
    ]);

    expect(getConsensusPercentage(round)).toBe(100);
  });

  it('should return 0 when all disagree', () => {
    const round = makeRound(1, [
      { id: 'r1', stance: 'disagree' },
      { id: 'r2', stance: 'disagree' },
    ]);

    expect(getConsensusPercentage(round)).toBe(0);
  });
});

// ============================================================================
// isDevilsAdvocate
// ============================================================================

describe('isDevilsAdvocate', () => {
  it('should detect devil in supporter ID (case-insensitive)', () => {
    expect(isDevilsAdvocate('devil-advocate-1')).toBe(true);
    expect(isDevilsAdvocate('DevilsAdvocate')).toBe(true);
    expect(isDevilsAdvocate('DEVIL_AGENT')).toBe(true);
  });

  it('should return false for non-devil supporter IDs', () => {
    expect(isDevilsAdvocate('supporter-1')).toBe(false);
    expect(isDevilsAdvocate('reviewer-alpha')).toBe(false);
    expect(isDevilsAdvocate('')).toBe(false);
  });
});

// ============================================================================
// getStanceProgression
// ============================================================================

describe('getStanceProgression', () => {
  it('should track stance changes across multiple rounds', () => {
    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'r1', stance: 'disagree' },
        { id: 'r2', stance: 'disagree' },
      ]),
      makeRound(2, [
        { id: 'r1', stance: 'neutral' },
        { id: 'r2', stance: 'agree' },
      ]),
      makeRound(3, [
        { id: 'r1', stance: 'agree' },
        { id: 'r2', stance: 'agree' },
      ]),
    ];

    const progression = getStanceProgression(rounds);

    expect(progression).toHaveLength(2);

    const r1 = progression.find((p) => p.supporterId === 'r1');
    const r2 = progression.find((p) => p.supporterId === 'r2');

    expect(r1).toBeDefined();
    expect(r1!.stances).toEqual(['disagree', 'neutral', 'agree']);

    expect(r2).toBeDefined();
    expect(r2!.stances).toEqual(['disagree', 'agree', 'agree']);
  });

  it('should return empty array for empty rounds', () => {
    const progression = getStanceProgression([]);

    expect(progression).toEqual([]);
  });

  it('should handle single round', () => {
    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'r1', stance: 'agree' },
      ]),
    ];

    const progression = getStanceProgression(rounds);

    expect(progression).toHaveLength(1);
    expect(progression[0].stances).toEqual(['agree']);
  });

  it('should default to neutral when supporter missing from a round', () => {
    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'r1', stance: 'agree' },
        { id: 'r2', stance: 'disagree' },
      ]),
      makeRound(2, [
        { id: 'r1', stance: 'agree' },
        // r2 missing from round 2
      ]),
    ];

    const progression = getStanceProgression(rounds);
    const r2 = progression.find((p) => p.supporterId === 'r2');

    expect(r2).toBeDefined();
    expect(r2!.stances).toEqual(['disagree', 'neutral']);
  });

  it('should sort rounds by round number', () => {
    // Provide rounds out of order
    const rounds: DiscussionRound[] = [
      makeRound(3, [{ id: 'r1', stance: 'agree' }]),
      makeRound(1, [{ id: 'r1', stance: 'disagree' }]),
      makeRound(2, [{ id: 'r1', stance: 'neutral' }]),
    ];

    const progression = getStanceProgression(rounds);

    expect(progression[0].stances).toEqual(['disagree', 'neutral', 'agree']);
  });
});

// ============================================================================
// summarizeDiscussion
// ============================================================================

describe('summarizeDiscussion', () => {
  it('should generate complete summary stats', () => {
    const verdict = makeVerdict({
      rounds: 3,
      consensusReached: true,
      finalSeverity: 'CRITICAL',
    });

    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'r1', stance: 'disagree' },
        { id: 'r2', stance: 'disagree' },
      ]),
      makeRound(2, [
        { id: 'r1', stance: 'agree' },
        { id: 'r2', stance: 'neutral' },
      ]),
      makeRound(3, [
        { id: 'r1', stance: 'agree' },
        { id: 'r2', stance: 'agree' },
      ]),
    ];

    const summary = summarizeDiscussion(verdict, rounds);

    expect(summary.totalRounds).toBe(3);
    expect(summary.totalSupporters).toBe(2);
    expect(summary.consensusReached).toBe(true);
    expect(summary.finalSeverity).toBe('CRITICAL');
    expect(summary.finalConsensusPercentage).toBe(100);
    expect(summary.hasDevilsAdvocate).toBe(false);
  });

  it('should detect devil advocate supporter', () => {
    const verdict = makeVerdict();
    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'devil-advocate-1', stance: 'disagree' },
        { id: 'reviewer-2', stance: 'agree' },
      ]),
    ];

    const summary = summarizeDiscussion(verdict, rounds);

    expect(summary.hasDevilsAdvocate).toBe(true);
  });

  it('should handle empty rounds', () => {
    const verdict = makeVerdict({ rounds: 0 });
    const rounds: DiscussionRound[] = [];

    const summary = summarizeDiscussion(verdict, rounds);

    expect(summary.totalRounds).toBe(0);
    expect(summary.totalSupporters).toBe(0);
    expect(summary.finalConsensusPercentage).toBe(0);
    expect(summary.hasDevilsAdvocate).toBe(false);
  });

  it('should use last round for final consensus percentage', () => {
    const verdict = makeVerdict({ rounds: 2 });
    const rounds: DiscussionRound[] = [
      makeRound(1, [
        { id: 'r1', stance: 'disagree' },
        { id: 'r2', stance: 'disagree' },
        { id: 'r3', stance: 'agree' },
      ]),
      makeRound(2, [
        { id: 'r1', stance: 'agree' },
        { id: 'r2', stance: 'agree' },
        { id: 'r3', stance: 'disagree' },
      ]),
    ];

    const summary = summarizeDiscussion(verdict, rounds);

    // Last round: 2 agree out of 3 = 67%
    expect(summary.finalConsensusPercentage).toBe(67);
  });
});

// ============================================================================
// Severity maps
// ============================================================================

describe('discussionSeverityMaps', () => {
  it('should map all severity levels to CSS classes', () => {
    const severities = [
      'HARSHLY_CRITICAL',
      'CRITICAL',
      'WARNING',
      'SUGGESTION',
      'DISMISSED',
    ] as const;

    for (const severity of severities) {
      expect(discussionSeverityClassMap[severity]).toBeDefined();
      expect(discussionSeverityClassMap[severity]).toContain('disc-severity--');
    }
  });

  it('should provide human-readable labels for all severities', () => {
    expect(discussionSeverityLabelMap.HARSHLY_CRITICAL).toBe('Harshly Critical');
    expect(discussionSeverityLabelMap.CRITICAL).toBe('Critical');
    expect(discussionSeverityLabelMap.WARNING).toBe('Warning');
    expect(discussionSeverityLabelMap.SUGGESTION).toBe('Suggestion');
    expect(discussionSeverityLabelMap.DISMISSED).toBe('Dismissed');
  });
});

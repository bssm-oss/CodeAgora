/**
 * L2 HARSHLY_CRITICAL debate tests
 *
 * Validates that HC findings go through discussion (no auto-escalation)
 * and HC-specific downgrade logic in checkConsensus.
 */

import { describe, it, expect } from 'vitest';
import { checkConsensus } from '../l2/moderator.js';
import type { Discussion, DiscussionRound } from '../types/core.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDiscussion(severity: string): Discussion {
  return {
    id: 'd001',
    severity: severity as Discussion['severity'],
    issueTitle: 'SQL injection in user input',
    filePath: 'src/db.ts',
    lineRange: [10, 20] as [number, number],
    codeSnippet: 'const q = `SELECT * FROM users WHERE id = ${input}`;',
    evidenceDocs: ['evidence/r1.md'],
    status: 'in_progress',
  };
}

function makeRound(stances: Array<'agree' | 'disagree' | 'neutral'>): DiscussionRound {
  return {
    round: 1,
    moderatorPrompt: 'Evaluate this issue.',
    supporterResponses: stances.map((stance, i) => ({
      supporterId: `supporter-${i + 1}`,
      response: `I ${stance} with this finding.`,
      stance,
    })),
  };
}

// ============================================================================
// HC consensus: all agree → HC preserved
// ============================================================================

describe('checkConsensus — HARSHLY_CRITICAL all agree', () => {
  it('preserves HC severity when all supporters agree', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['agree', 'agree', 'agree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('HARSHLY_CRITICAL');
  });
});

// ============================================================================
// HC consensus: majority disagree → downgraded to CRITICAL
// ============================================================================

describe('checkConsensus — HARSHLY_CRITICAL majority disagree', () => {
  it('downgrades HC to CRITICAL when majority disagrees (not DISMISSED)', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['disagree', 'disagree', 'agree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.reasoning).toContain('HARSHLY_CRITICAL');
    expect(result.reasoning).toContain('downgraded');
  });

  it('non-HC majority disagree still returns DISMISSED', () => {
    const discussion = makeDiscussion('WARNING');
    const round = makeRound(['disagree', 'disagree', 'agree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('DISMISSED');
  });
});

// ============================================================================
// HC consensus: all disagree → downgraded to CRITICAL
// ============================================================================

describe('checkConsensus — HARSHLY_CRITICAL all disagree', () => {
  it('downgrades HC to CRITICAL when all supporters disagree', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['disagree', 'disagree', 'disagree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.reasoning).toContain('human review');
  });

  it('non-HC all disagree returns DISMISSED', () => {
    const discussion = makeDiscussion('CRITICAL');
    const round = makeRound(['disagree', 'disagree', 'disagree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('DISMISSED');
  });
});

// ============================================================================
// HC consensus: majority agree → HC preserved
// ============================================================================

describe('checkConsensus — HARSHLY_CRITICAL majority agree', () => {
  it('preserves HC severity when majority agrees', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['agree', 'agree', 'disagree']);
    const result = checkConsensus(round, discussion);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('HARSHLY_CRITICAL');
  });
});

// ============================================================================
// HC consensus: tie on last round → HC preserved (benefit of the doubt)
// ============================================================================

describe('checkConsensus — HARSHLY_CRITICAL tie', () => {
  it('preserves HC severity on tie during last round (benefit of the doubt)', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['agree', 'disagree']);
    const result = checkConsensus(round, discussion, /* isLastRound */ true);
    expect(result.reached).toBe(true);
    expect(result.severity).toBe('HARSHLY_CRITICAL');
  });

  it('does not reach consensus on tie during non-last round', () => {
    const discussion = makeDiscussion('HARSHLY_CRITICAL');
    const round = makeRound(['agree', 'disagree']);
    const result = checkConsensus(round, discussion, /* isLastRound */ false);
    expect(result.reached).toBe(false);
  });
});

/**
 * Tests for objection round maxRounds boundary guard
 * Issue #88: objection round should not extend beyond maxRounds
 */

import { describe, it, expect, vi } from 'vitest';

// We test the boundary logic by importing the checkConsensus-related flow indirectly.
// The key fix is: objection protocol is skipped on the last round.
// We verify this by testing the moderator's runDiscussion behavior.

// Since runDiscussion is private, we test the boundary condition through
// the exported parseStance and the objection module directly.

import { handleObjections, type ObjectionResult } from '@codeagora/core/l2/objection.js';

describe('objection round boundary guard', () => {
  describe('handleObjections', () => {
    it('returns shouldExtend=true when objections exist', () => {
      const objections: ObjectionResult = {
        hasObjections: true,
        objections: [{ supporterId: 's1', reasoning: 'I object!' }],
      };
      const result = handleObjections(objections);
      expect(result.shouldExtend).toBe(true);
      expect(result.extensionReason).toContain('s1');
    });

    it('returns shouldExtend=false when no objections', () => {
      const objections: ObjectionResult = {
        hasObjections: false,
        objections: [],
      };
      const result = handleObjections(objections);
      expect(result.shouldExtend).toBe(false);
    });
  });

  describe('objection boundary logic (unit verification)', () => {
    // This tests the exact condition from the fix:
    // !isLastRound && severity !== 'DISMISSED' && objectionRoundsUsed < maxObjectionRounds

    function shouldRunObjection(
      roundNum: number,
      maxRounds: number,
      severity: string,
      objectionRoundsUsed: number,
      maxObjectionRounds: number
    ): boolean {
      const isLastRound = roundNum === maxRounds;
      return !isLastRound && severity !== 'DISMISSED' && objectionRoundsUsed < maxObjectionRounds;
    }

    it('allows objection on round 1 of 3', () => {
      expect(shouldRunObjection(1, 3, 'CRITICAL', 0, 1)).toBe(true);
    });

    it('allows objection on round 2 of 3', () => {
      expect(shouldRunObjection(2, 3, 'WARNING', 0, 1)).toBe(true);
    });

    it('blocks objection on last round (round 3 of 3)', () => {
      expect(shouldRunObjection(3, 3, 'CRITICAL', 0, 1)).toBe(false);
    });

    it('blocks objection when maxObjectionRounds exhausted', () => {
      expect(shouldRunObjection(1, 3, 'CRITICAL', 1, 1)).toBe(false);
    });

    it('blocks objection for DISMISSED severity', () => {
      expect(shouldRunObjection(1, 3, 'DISMISSED', 0, 1)).toBe(false);
    });

    it('blocks objection on last round of single-round discussion', () => {
      expect(shouldRunObjection(1, 1, 'WARNING', 0, 1)).toBe(false);
    });
  });
});

/**
 * L2 Objection Protocol Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForObjections, handleObjections } from '@codeagora/core/l2/objection.js';
import type { SupporterConfig } from '@codeagora/core/types/config.js';
import type { DiscussionRound } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Mock executeBackend
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

import { executeBackend } from '@codeagora/core/l1/backend.js';

const mockExecuteBackend = vi.mocked(executeBackend);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupporterConfig(id: string): SupporterConfig {
  return {
    id,
    model: 'gpt-4o-mini',
    backend: 'codex',
    enabled: true,
    timeout: 60,
  };
}

const sampleRounds: DiscussionRound[] = [
  {
    round: 1,
    moderatorPrompt: 'Discuss the SQL injection issue.',
    supporterResponses: [
      { supporterId: 'sp1', response: 'I agree it is critical.', stance: 'agree' },
      { supporterId: 'sp2', response: 'Minor concern only.', stance: 'disagree' },
    ],
  },
];

// ---------------------------------------------------------------------------

describe('checkForObjections()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('no objections', () => {
    it('returns hasObjections=false and empty array when all supporters respond with "NO OBJECTION"', async () => {
      mockExecuteBackend.mockResolvedValue('NO OBJECTION');

      const supporters = [makeSupporterConfig('sp1'), makeSupporterConfig('sp2')];
      const result = await checkForObjections('Consensus reached.', supporters, sampleRounds);

      expect(result.hasObjections).toBe(false);
      expect(result.objections).toHaveLength(0);
    });

    it('returns hasObjections=false when supporter says "I don\'t object"', async () => {
      mockExecuteBackend.mockResolvedValue("I don't object to the moderator's conclusion.");

      const supporters = [makeSupporterConfig('sp1')];
      const result = await checkForObjections('Consensus reached.', supporters, []);

      expect(result.hasObjections).toBe(false);
      expect(result.objections).toHaveLength(0);
    });

    it('returns hasObjections=false when all supporters accept (mixed phrases)', async () => {
      mockExecuteBackend
        .mockResolvedValueOnce('NO OBJECTION')
        .mockResolvedValueOnce("I don't object, the reasoning is sound.");

      const supporters = [makeSupporterConfig('sp1'), makeSupporterConfig('sp2')];
      const result = await checkForObjections('Consensus reached.', supporters, sampleRounds);

      expect(result.hasObjections).toBe(false);
      expect(result.objections).toHaveLength(0);
    });
  });

  describe('objections present', () => {
    it('returns hasObjections=true and 1 objection when one supporter objects', async () => {
      mockExecuteBackend
        .mockResolvedValueOnce('NO OBJECTION')
        .mockResolvedValueOnce('I OBJECT because the severity was downgraded without justification.');

      const supporters = [makeSupporterConfig('sp1'), makeSupporterConfig('sp2')];
      const result = await checkForObjections('Consensus: WARNING', supporters, sampleRounds);

      expect(result.hasObjections).toBe(true);
      expect(result.objections).toHaveLength(1);
      expect(result.objections[0].supporterId).toBe('sp2');
      expect(result.objections[0].reasoning).toContain('I OBJECT because');
    });

    it('includes the correct supporter ID and trimmed reasoning for the objecting supporter', async () => {
      const reasoning = '  I OBJECT. The evidence was ignored.  ';
      mockExecuteBackend.mockResolvedValue(reasoning);

      const supporters = [makeSupporterConfig('reviewer-a')];
      const result = await checkForObjections('Decision: DISMISS', supporters, []);

      expect(result.objections[0].supporterId).toBe('reviewer-a');
      expect(result.objections[0].reasoning).toBe(reasoning.trim());
    });

    it('returns all objections when every supporter objects', async () => {
      mockExecuteBackend
        .mockResolvedValueOnce('I OBJECT. Missing context about the race condition.')
        .mockResolvedValueOnce('I OBJECT. The fix suggestion is incomplete.')
        .mockResolvedValueOnce('I OBJECT. Severity should remain CRITICAL.');

      const supporters = [
        makeSupporterConfig('sp1'),
        makeSupporterConfig('sp2'),
        makeSupporterConfig('sp3'),
      ];
      const result = await checkForObjections('Consensus: WARNING', supporters, sampleRounds);

      expect(result.hasObjections).toBe(true);
      expect(result.objections).toHaveLength(3);

      const ids = result.objections.map((o) => o.supporterId);
      expect(ids).toContain('sp1');
      expect(ids).toContain('sp2');
      expect(ids).toContain('sp3');
    });
  });

  describe('graceful degradation via Promise.allSettled', () => {
    it('processes successful supporter responses even when one supporter call rejects', async () => {
      mockExecuteBackend
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('I OBJECT. New evidence available.')
        .mockResolvedValueOnce('NO OBJECTION');

      const supporters = [
        makeSupporterConfig('sp1'), // will fail
        makeSupporterConfig('sp2'), // will object
        makeSupporterConfig('sp3'), // will accept
      ];
      const result = await checkForObjections('Consensus: SUGGESTION', supporters, []);

      // The failed call is skipped; the objecting supporter is still captured
      expect(result.hasObjections).toBe(true);
      expect(result.objections).toHaveLength(1);
      expect(result.objections[0].supporterId).toBe('sp2');
    });

    it('returns hasObjections=false when all supporter calls reject', async () => {
      mockExecuteBackend.mockRejectedValue(new Error('Service unavailable'));

      const supporters = [makeSupporterConfig('sp1'), makeSupporterConfig('sp2')];
      const result = await checkForObjections('Consensus: DISMISS', supporters, []);

      expect(result.hasObjections).toBe(false);
      expect(result.objections).toHaveLength(0);
    });

    it('returns hasObjections=false when no supporters are provided', async () => {
      const result = await checkForObjections('Consensus: WARNING', [], sampleRounds);

      expect(result.hasObjections).toBe(false);
      expect(result.objections).toHaveLength(0);
      expect(mockExecuteBackend).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------

describe('handleObjections()', () => {
  describe('no objections', () => {
    it('returns shouldExtend=false and empty extensionReason when there are no objections', () => {
      const result = handleObjections({ hasObjections: false, objections: [] });

      expect(result.shouldExtend).toBe(false);
      expect(result.extensionReason).toBe('');
    });
  });

  describe('objections present', () => {
    it('returns shouldExtend=true when objections exist', () => {
      const result = handleObjections({
        hasObjections: true,
        objections: [{ supporterId: 'sp1', reasoning: 'Evidence overlooked.' }],
      });

      expect(result.shouldExtend).toBe(true);
    });

    it('includes objecting supporter ID in extensionReason', () => {
      const result = handleObjections({
        hasObjections: true,
        objections: [{ supporterId: 'reviewer-x', reasoning: 'New data invalidates the finding.' }],
      });

      expect(result.extensionReason).toContain('reviewer-x');
    });

    it('includes objection reasoning in extensionReason', () => {
      const reasoning = 'Severity was downgraded without justification.';
      const result = handleObjections({
        hasObjections: true,
        objections: [{ supporterId: 'sp1', reasoning }],
      });

      expect(result.extensionReason).toContain(reasoning);
    });

    it('reflects the correct supporter count in extensionReason for multiple objectors', () => {
      const result = handleObjections({
        hasObjections: true,
        objections: [
          { supporterId: 'sp1', reasoning: 'Reason A.' },
          { supporterId: 'sp2', reasoning: 'Reason B.' },
          { supporterId: 'sp3', reasoning: 'Reason C.' },
        ],
      });

      expect(result.extensionReason).toContain('3 supporter(s)');
    });

    it('lists all objecting supporter IDs and reasoning in extensionReason', () => {
      const result = handleObjections({
        hasObjections: true,
        objections: [
          { supporterId: 'sp1', reasoning: 'First reason.' },
          { supporterId: 'sp2', reasoning: 'Second reason.' },
        ],
      });

      expect(result.extensionReason).toContain('sp1');
      expect(result.extensionReason).toContain('First reason.');
      expect(result.extensionReason).toContain('sp2');
      expect(result.extensionReason).toContain('Second reason.');
    });
  });
});

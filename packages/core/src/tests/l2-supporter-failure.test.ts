import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Discussion, DiscussionRound } from '../types/core.js';

const mocks = vi.hoisted(() => ({
  executeBackend: vi.fn(),
  writeDiscussionRound: vi.fn(),
  writeDiscussionVerdict: vi.fn(),
  writeSupportersLog: vi.fn(),
}));

vi.mock('../l1/backend.js', () => ({
  executeBackend: mocks.executeBackend,
}));

vi.mock('../l2/writer.js', () => ({
  writeDiscussionRound: mocks.writeDiscussionRound,
  writeDiscussionVerdict: mocks.writeDiscussionVerdict,
  writeSupportersLog: mocks.writeSupportersLog,
}));

vi.mock('../l2/objection.js', () => ({
  checkForObjections: vi.fn().mockResolvedValue({ objections: [] }),
  handleObjections: vi.fn().mockReturnValue({ shouldExtend: false }),
}));

import { runModerator } from '../l2/moderator.js';

function makeDiscussion(): Discussion {
  return {
    id: 'd001',
    severity: 'CRITICAL',
    issueTitle: 'Missing authorization check',
    filePath: 'src/api.ts',
    lineRange: [10, 20],
    codeSnippet: 'await deleteAccount(actor.id);',
    evidenceDocs: ['reviews/r1.md'],
    status: 'pending',
  };
}

describe('runModerator — supporter backend failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeDiscussionRound.mockResolvedValue(undefined);
    mocks.writeDiscussionVerdict.mockResolvedValue(undefined);
    mocks.writeSupportersLog.mockResolvedValue(undefined);
    mocks.executeBackend.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'bad-supporter') {
        throw new Error('Backend timed out after 120s');
      }
      if (model === 'moderator') {
        return 'Severity: WARNING\nOne supporter failed, so this needs moderator judgment.';
      }
      return 'Stance: AGREE\nThe claim is supported by the shown code.';
    });
  });

  it('keeps failed supporters as neutral responses instead of silently dropping them', async () => {
    const report = await runModerator({
      config: {
        backend: 'api',
        model: 'moderator',
        provider: 'openrouter',
        timeout: 30,
        enabled: true,
      },
      supporterPoolConfig: {
        pool: [
          { id: 'good', backend: 'api', model: 'good-supporter', provider: 'openrouter', enabled: true, timeout: 30 },
          { id: 'bad', backend: 'api', model: 'bad-supporter', provider: 'openrouter', enabled: true, timeout: 30 },
        ],
        pickCount: 2,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', backend: 'api', model: 'da', provider: 'openrouter', enabled: false, timeout: 30 },
        personaPool: [],
        personaAssignment: 'random',
      },
      discussions: [makeDiscussion()],
      settings: {
        enabled: true,
        maxRounds: 1,
        registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
        codeSnippetRange: 10,
        objectionTimeout: 60,
        maxObjectionRounds: 1,
      },
      date: '2026-04-28',
      sessionId: '001',
    });

    const round = mocks.writeDiscussionRound.mock.calls[0][3] as DiscussionRound;
    expect(round.supporterResponses).toHaveLength(2);
    expect(round.supporterResponses.find((r) => r.supporterId === 'good')?.stance).toBe('agree');
    expect(round.supporterResponses.find((r) => r.supporterId === 'bad')).toMatchObject({
      stance: 'neutral',
      response: expect.stringContaining('Supporter failed before producing a usable response.'),
    });
    expect(report.discussions[0].consensusReached).toBe(false);
  });
});

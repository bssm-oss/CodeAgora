/**
 * L2 Moderator Parallel Execution Tests
 * Verifies runModerator() uses Promise.allSettled for parallel discussion processing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModeratorInput } from '@codeagora/core/l2/moderator.js';
import type { Discussion } from '@codeagora/core/types/core.js';
import type { ModeratorConfig, SupporterPoolConfig, DiscussionSettings } from '@codeagora/core/types/config.js';

// Mock dependencies
vi.mock('../../packages/core/src/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

vi.mock('../../packages/core/src/l2/writer.js', () => ({
  writeDiscussionRound: vi.fn().mockResolvedValue(undefined),
  writeDiscussionVerdict: vi.fn().mockResolvedValue(undefined),
  writeSupportersLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../packages/core/src/l2/objection.js', () => ({
  checkForObjections: vi.fn().mockResolvedValue({ objections: [] }),
  handleObjections: vi.fn().mockReturnValue({ shouldExtend: false }),
}));

import { runModerator } from '@codeagora/core/l2/moderator.js';
import { executeBackend } from '@codeagora/core/l1/backend.js';
import { writeSupportersLog, writeDiscussionRound, writeDiscussionVerdict } from '@codeagora/core/l2/writer.js';

// ============================================================================
// Shared fixtures
// ============================================================================

const moderatorConfig: ModeratorConfig = {
  backend: 'codex',
  model: 'gpt-4o-mini',
};

const supporterPoolConfig: SupporterPoolConfig = {
  pool: [
    { id: 'sp1', backend: 'codex', model: 'gpt-4o-mini', enabled: true, timeout: 120 },
    { id: 'sp2', backend: 'codex', model: 'gpt-4o-mini', enabled: true, timeout: 120 },
  ],
  pickCount: 2,
  pickStrategy: 'random',
  devilsAdvocate: {
    id: 's-devil',
    backend: 'codex',
    model: 'gpt-4o-mini',
    enabled: false,
    timeout: 120,
  },
  personaPool: [],
  personaAssignment: 'random',
};

const settings: DiscussionSettings = {
  maxRounds: 1,
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 2,
    SUGGESTION: null,
  },
  codeSnippetRange: 10,
};

function makeDiscussion(id: string, severity: Discussion['severity'] = 'WARNING'): Discussion {
  return {
    id,
    severity,
    issueTitle: `Issue ${id}`,
    filePath: 'src/foo.ts',
    lineRange: [1, 10],
    codeSnippet: 'const x = 1;',
    evidenceDocs: [],
    status: 'pending',
  };
}

function makeInput(discussions: Discussion[]): ModeratorInput {
  return {
    config: moderatorConfig,
    supporterPoolConfig,
    discussions,
    settings,
    date: '2026-03-13',
    sessionId: '001',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('runModerator() parallel execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default writer no-ops after clearAllMocks wipes them
    vi.mocked(writeDiscussionRound).mockResolvedValue(undefined);
    vi.mocked(writeDiscussionVerdict).mockResolvedValue(undefined);
    vi.mocked(writeSupportersLog).mockResolvedValue(undefined);
  });

  it('runs 3 discussions in parallel via Promise.allSettled — all succeed', async () => {
    // All supporters agree → consensus on first round
    vi.mocked(executeBackend).mockResolvedValue('AGREE: evidence is valid');

    const discussions = [
      makeDiscussion('d001'),
      makeDiscussion('d002'),
      makeDiscussion('d003'),
    ];

    const report = await runModerator(makeInput(discussions));

    expect(report.discussions).toHaveLength(3);
    expect(report.discussions.map((v) => v.discussionId).sort()).toEqual(['d001', 'd002', 'd003']);
    expect(report.discussions.every((v) => v.consensusReached)).toBe(true);
  });

  it('handles 1 rejected discussion — produces error verdict, remaining 2 succeed', async () => {
    vi.mocked(executeBackend).mockResolvedValue('AGREE: evidence is valid');

    // Make writeSupportersLog throw for d002 to force runDiscussion to reject
    vi.mocked(writeSupportersLog).mockImplementation(async (_date, _sessionId, discussionId) => {
      if (discussionId === 'd002') {
        throw new Error('Forced failure for d002');
      }
    });

    const discussions = [
      makeDiscussion('d001'),
      makeDiscussion('d002'),
      makeDiscussion('d003'),
    ];

    const report = await runModerator(makeInput(discussions));

    expect(report.discussions).toHaveLength(3);

    const d002Verdict = report.discussions.find((v) => v.discussionId === 'd002');
    expect(d002Verdict).toBeDefined();
    expect(d002Verdict!.consensusReached).toBe(false);
    expect(d002Verdict!.finalSeverity).toBe('DISMISSED');
    expect(d002Verdict!.reasoning).toMatch(/Discussion failed:/);
    expect(d002Verdict!.rounds).toBe(0);

    const successVerdicts = report.discussions.filter((v) => v.discussionId !== 'd002');
    expect(successVerdicts).toHaveLength(2);
    expect(successVerdicts.every((v) => v.consensusReached)).toBe(true);
  });

  it('returns empty verdicts array for empty discussions input', async () => {
    const report = await runModerator(makeInput([]));

    expect(report.discussions).toHaveLength(0);
    expect(report.summary.totalDiscussions).toBe(0);
    expect(report.summary.resolved).toBe(0);
    expect(report.summary.escalated).toBe(0);
  });

  it('HARSHLY_CRITICAL discussion is skipped and gets immediate verdict (consensusReached: false)', async () => {
    vi.mocked(executeBackend).mockResolvedValue('AGREE: evidence is valid');

    const discussions = [
      makeDiscussion('d001', 'HARSHLY_CRITICAL'),
      makeDiscussion('d002', 'WARNING'),
    ];

    const report = await runModerator(makeInput(discussions));

    expect(report.discussions).toHaveLength(2);

    const hcVerdict = report.discussions.find((v) => v.discussionId === 'd001');
    expect(hcVerdict).toBeDefined();
    expect(hcVerdict!.finalSeverity).toBe('HARSHLY_CRITICAL');
    expect(hcVerdict!.consensusReached).toBe(false);
    expect(hcVerdict!.rounds).toBe(0);

    // d002 proceeds normally
    const d002Verdict = report.discussions.find((v) => v.discussionId === 'd002');
    expect(d002Verdict).toBeDefined();
    expect(d002Verdict!.consensusReached).toBe(true);
  });

  it('summary values are correct (totalDiscussions, resolved, escalated)', async () => {
    vi.mocked(executeBackend).mockResolvedValue('AGREE: evidence is valid');

    const discussions = [
      makeDiscussion('d001', 'HARSHLY_CRITICAL'), // escalated (consensusReached: false)
      makeDiscussion('d002', 'WARNING'),           // resolved (consensusReached: true)
      makeDiscussion('d003', 'CRITICAL'),          // resolved (consensusReached: true)
    ];

    const report = await runModerator(makeInput(discussions));

    expect(report.summary.totalDiscussions).toBe(3);
    expect(report.summary.resolved).toBe(2);
    expect(report.summary.escalated).toBe(1);
  });

  it('parallel execution runs discussions concurrently', async () => {
    const callTimestamps: number[] = [];
    vi.mocked(executeBackend).mockImplementation(async () => {
      callTimestamps.push(Date.now());
      await new Promise(r => setTimeout(r, 50));
      return 'AGREE: all good';
    });

    await runModerator(makeInput([
      makeDiscussion('d001'),
      makeDiscussion('d002'),
      makeDiscussion('d003'),
    ]));

    // If parallel: multiple calls start within a tight window
    // Sequential: calls would be spaced 50ms+ apart
    callTimestamps.sort((a, b) => a - b);
    // At least 2 calls should start within 30ms of each other (parallel indicator)
    const hasOverlap = callTimestamps.some((t, i) =>
      i > 0 && (t - callTimestamps[i - 1]) < 30
    );
    expect(hasOverlap).toBe(true);
  });
});

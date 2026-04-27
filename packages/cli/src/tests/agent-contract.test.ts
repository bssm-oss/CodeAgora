import { describe, expect, it } from 'vitest';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import {
  AGENT_CONTRACT_VERSION,
  formatAgentJson,
  formatProgressNdjsonEvent,
  formatResultNdjsonEvent,
  getAgentReviewExitCode,
  shouldFailOnSeverity,
  withAgentContract,
} from '../utils/agent-contract.js';
import { classifyCliErrorExitCode } from '../utils/errors.js';

function makeResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    sessionId: '001',
    date: '2026-04-27',
    status: 'success',
    summary: {
      decision: 'ACCEPT',
      reasoning: 'No blocking issues.',
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: {},
      topIssues: [],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    evidenceDocs: [],
    discussions: [],
    ...overrides,
  };
}

describe('agent contract helpers', () => {
  it('adds schemaVersion without moving PipelineResult fields', () => {
    const contracted = withAgentContract(makeResult());
    expect(contracted.schemaVersion).toBe(AGENT_CONTRACT_VERSION);
    expect(contracted.sessionId).toBe('001');
    expect(contracted.status).toBe('success');
  });

  it('formats JSON output with the stable schema marker', () => {
    const parsed = JSON.parse(formatAgentJson(makeResult())) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['sessionId']).toBe('001');
    expect(parsed['type']).toBeUndefined();
  });

  it('keeps the required JSON result fields at the top level', () => {
    const parsed = JSON.parse(formatAgentJson(makeResult())) as Record<string, unknown>;
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: 'codeagora.review.v1',
      status: 'success',
      date: '2026-04-27',
      sessionId: '001',
      summary: expect.objectContaining({
        decision: 'ACCEPT',
        reasoning: 'No blocking issues.',
      }),
      evidenceDocs: [],
      discussions: [],
    }));
  });

  it('formats progress NDJSON events with type=progress', () => {
    const event: ProgressEvent = {
      stage: 'review',
      event: 'stage-update',
      progress: 40,
      message: '2/5 reviewers complete',
      timestamp: 1777248000000,
    };

    const parsed = JSON.parse(formatProgressNdjsonEvent(event)) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['type']).toBe('progress');
    expect(parsed['stage']).toBe('review');
    expect(parsed['event']).toBe('stage-update');
    expect(parsed['timestamp']).toBe(1777248000000);
    expect(formatProgressNdjsonEvent(event)).not.toContain('\n');
  });

  it('formats result NDJSON events with type=result', () => {
    const parsed = JSON.parse(formatResultNdjsonEvent(makeResult())) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['type']).toBe('result');
    expect(parsed['sessionId']).toBe('001');
    expect(formatResultNdjsonEvent(makeResult())).not.toContain('\n');
  });
});

describe('CLI exit code classification', () => {
  it('classifies setup and input errors as exit code 2', () => {
    expect(classifyCliErrorExitCode(new Error('Config file not found'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('Diff file not found'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('Invalid output format'))).toBe(2);
  });

  it('classifies runtime errors as exit code 3', () => {
    expect(classifyCliErrorExitCode(new Error('Groq rate limit exceeded'))).toBe(3);
    expect(classifyCliErrorExitCode(new Error('Reviewer timed out'))).toBe(3);
  });

  it('keeps successful reviews at exit code 0 without failure gates', () => {
    expect(getAgentReviewExitCode(makeResult({
      summary: {
        ...makeResult().summary!,
        decision: 'REJECT',
      },
    }))).toBe(0);
  });

  it('returns exit code 1 when fail-on-reject trips', () => {
    expect(getAgentReviewExitCode(makeResult({
      summary: {
        ...makeResult().summary!,
        decision: 'REJECT',
      },
    }), { failOnReject: true })).toBe(1);
  });

  it('returns exit code 1 when fail-on-severity trips', () => {
    expect(shouldFailOnSeverity({
      SUGGESTION: 2,
      WARNING: 0,
      CRITICAL: 1,
      HARSHLY_CRITICAL: 0,
    }, 'CRITICAL')).toBe(true);

    expect(getAgentReviewExitCode(makeResult({
      summary: {
        ...makeResult().summary!,
        severityCounts: {
          SUGGESTION: 2,
          WARNING: 0,
          CRITICAL: 1,
          HARSHLY_CRITICAL: 0,
        },
      },
    }), { failOnSeverity: 'CRITICAL' })).toBe(1);
  });

  it('returns exit code 3 for pipeline error results', () => {
    expect(getAgentReviewExitCode(makeResult({
      status: 'error',
      error: 'Pipeline failed',
      summary: undefined,
    }))).toBe(3);
  });
});

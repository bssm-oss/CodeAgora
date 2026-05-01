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
import { redactDeep, redactSecrets } from '@codeagora/shared/utils/redaction.js';
import { classifyCliErrorExitCode, formatError } from '../utils/errors.js';

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
    const output = formatAgentJson(makeResult());
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['sessionId']).toBe('001');
    expect(parsed['type']).toBeUndefined();
    expect(output.trim().startsWith('{')).toBe(true);
    expect(output.trim().endsWith('}')).toBe(true);
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

    const line = formatProgressNdjsonEvent(event);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['type']).toBe('progress');
    expect(parsed['stage']).toBe('review');
    expect(parsed['event']).toBe('stage-update');
    expect(parsed['timestamp']).toBe(1777248000000);
    expect(line).not.toContain('\n');
  });

  it('formats result NDJSON events with type=result', () => {
    const line = formatResultNdjsonEvent(makeResult());
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe('codeagora.review.v1');
    expect(parsed['type']).toBe('result');
    expect(parsed['sessionId']).toBe('001');
    expect(line).not.toContain('\n');
  });

  it('keeps canonical contract fields from being overridden by payload fields', () => {
    const resultWithCollision = {
      ...makeResult(),
      schemaVersion: 'wrong.version',
      type: 'progress',
    } as PipelineResult & { schemaVersion: string; type: string };
    const progressWithCollision = {
      stage: 'review',
      event: 'stage-update',
      progress: 40,
      message: 'working',
      timestamp: 1777248000000,
      schemaVersion: 'wrong.version',
      type: 'result',
    } as ProgressEvent & { schemaVersion: string; type: string };

    const json = JSON.parse(formatAgentJson(resultWithCollision)) as Record<string, unknown>;
    const resultLine = JSON.parse(formatResultNdjsonEvent(resultWithCollision)) as Record<string, unknown>;
    const progressLine = JSON.parse(formatProgressNdjsonEvent(progressWithCollision)) as Record<string, unknown>;

    expect(json['schemaVersion']).toBe('codeagora.review.v1');
    expect(resultLine['schemaVersion']).toBe('codeagora.review.v1');
    expect(resultLine['type']).toBe('result');
    expect(progressLine['schemaVersion']).toBe('codeagora.review.v1');
    expect(progressLine['type']).toBe('progress');
  });

  it('redacts secrets from JSON and NDJSON contract output without breaking parsing', () => {
    const result = makeResult({
      error: 'OPENAI_API_KEY=sk-secret123456789 failed',
      summary: {
        ...makeResult().summary!,
        reasoning: 'token: ghp_secret123456789 should not be logged',
      },
      evidenceDocs: [{
        issueTitle: 'Leaked token',
        problem: 'password=hunter2 appears in output',
        evidence: ['Authorization token ghp_secret123456789'],
        severity: 'CRITICAL',
        suggestion: 'Rotate SECRET=abc123 immediately',
        filePath: 'src/config.ts',
        lineRange: [1, 1],
      }],
    });

    const jsonOutput = formatAgentJson(result);
    const resultLine = formatResultNdjsonEvent(result);
    const progressLine = formatProgressNdjsonEvent({
      stage: 'review',
      event: 'stage-error',
      progress: 10,
      message: 'ANTHROPIC_API_KEY=sk-secret123456789 failed',
      timestamp: 1777248000000,
      details: { error: 'password=hunter2' },
    });

    expect(() => JSON.parse(jsonOutput)).not.toThrow();
    expect(() => JSON.parse(resultLine)).not.toThrow();
    expect(() => JSON.parse(progressLine)).not.toThrow();
    for (const output of [jsonOutput, resultLine, progressLine]) {
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('sk-secret123456789');
      expect(output).not.toContain('ghp_secret123456789');
      expect(output).not.toContain('hunter2');
    }
  });

  it('redacts quoted and encoded secret values', () => {
    const base64Secret = Buffer.from('sk-secret123456789').toString('base64');
    const urlSecret = 'ghp%5Fsecret123456789';
    const output = redactSecrets([
      'API_KEY="sk-secret123456789"',
      base64Secret,
      urlSecret,
    ].join(' '));

    expect(output).toContain('API_KEY=[REDACTED]');
    expect(output).not.toContain('sk-secret123456789');
    expect(output).not.toContain(base64Secret);
    expect(output).not.toContain(urlSecret);
  });

  it('keeps circular redaction input serializable', () => {
    interface CircularRecord {
      secret: string;
      self?: CircularRecord;
    }
    const value: CircularRecord = { secret: 'OPENAI_API_KEY=sk-secret123456789' };
    value.self = value;

    const redacted = redactDeep(value);
    const output = JSON.stringify(redacted);

    expect(output).toContain('[Circular]');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('sk-secret123456789');
  });
});

describe('CLI exit code classification', () => {
  it('classifies setup and input errors as exit code 2', () => {
    expect(classifyCliErrorExitCode(new Error('Config file not found'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('Diff file not found'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('Invalid output format'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('OPENAI_API_KEY not set'))).toBe(2);
    expect(classifyCliErrorExitCode(new Error('Missing key for provider credential'))).toBe(2);
  });

  it('classifies runtime errors as exit code 3', () => {
    expect(classifyCliErrorExitCode(new Error('Groq rate limit exceeded'))).toBe(3);
    expect(classifyCliErrorExitCode(new Error('Reviewer timed out'))).toBe(3);
    expect(classifyCliErrorExitCode(new Error('Pipeline failed after retries'))).toBe(3);
  });

  it('redacts secrets from formatted error messages and verbose stacks', () => {
    const error = new Error('Failed with OPENAI_API_KEY=sk-secret123456789');
    error.stack = 'Error: Failed with OPENAI_API_KEY=sk-secret123456789\n    at token: ghp_secret123456789';

    const output = formatError(error, true);

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('sk-secret123456789');
    expect(output).not.toContain('ghp_secret123456789');
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

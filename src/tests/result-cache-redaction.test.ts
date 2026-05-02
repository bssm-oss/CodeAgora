import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { persistResultCache } from '@codeagora/core/pipeline/cache-manager.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

const date = '2026-05-02';
const sessionId = 'cache-redaction';
const rawSecret = 'OPENAI_API_KEY=sk-test-secret';
const rawBearer = 'Authorization: Bearer test-secret';
const rawBareBearer = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';

function expectNoRawSecrets(output: string): void {
  expect(output).not.toContain('sk-test-secret');
  expect(output).not.toContain('Bearer test-secret');
  expect(output).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.signature');
}

describe('result cache redaction', () => {
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-result-cache-'));
    process.chdir(tmpRoot);
    await fs.mkdir(path.join('.ca', 'sessions', date, sessionId), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('redacts secrets before persisting result.json', async () => {
    const result: PipelineResult = {
      sessionId,
      date,
      status: 'success',
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: `${rawSecret}\n${rawBearer}\n${rawBareBearer}`,
        totalReviewers: 1,
        forfeitedReviewers: 0,
        severityCounts: { CRITICAL: 1 },
        topIssues: [{ severity: 'CRITICAL', filePath: 'src/auth.ts', lineRange: [1, 1], title: 'Secret leak' }],
        totalDiscussions: 1,
        resolved: 1,
        escalated: 0,
      },
      evidenceDocs: [{
        issueTitle: 'Secret leak',
        problem: rawSecret,
        evidence: [rawBearer, rawBareBearer],
        severity: 'CRITICAL',
        suggestion: rawSecret,
        filePath: 'src/auth.ts',
        lineRange: [1, 1],
      }],
      discussions: [{
        discussionId: 'd001',
        filePath: 'src/auth.ts',
        lineRange: [1, 1],
        finalSeverity: 'CRITICAL',
        reasoning: rawBearer,
        consensusReached: true,
        rounds: 1,
      }],
      roundsPerDiscussion: {
        d001: [{
          round: 1,
          moderatorPrompt: rawSecret,
          supporterResponses: [{ supporterId: 's1', response: rawBareBearer, stance: 'agree' }],
        }],
      },
    };

    await persistResultCache(date, sessionId, 'cache-key', result, true);

    const persisted = await fs.readFile(path.join('.ca', 'sessions', date, sessionId, 'result.json'), 'utf-8');
    expectNoRawSecrets(persisted);
    expect(persisted).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(persisted).toContain('Authorization: Bearer [REDACTED]');
    expect(persisted).toContain('Bearer [REDACTED]');
  });
});

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeReviewOutput } from '@codeagora/core/l1/writer.js';
import { writeDiscussionRound, writeDiscussionVerdict, writeModeratorReport, writeSuggestions } from '@codeagora/core/l2/writer.js';
import { writeHeadVerdict } from '@codeagora/core/l3/writer.js';
import { mcpErrorResponse } from '@codeagora/mcp/tools/shared-response.js';
import { postReview } from '@codeagora/github/poster.js';
import type { Octokit } from '@octokit/rest';
import { redactDeep, redactSecrets } from '@codeagora/shared/utils/redaction.js';
import type { DiscussionRound, DiscussionVerdict, EvidenceDocument, HeadVerdict, ModeratorReport, ReviewOutput } from '@codeagora/core/types/core.js';

const rawSecret = 'OPENAI_API_KEY=sk-test-secret';
const rawGithubToken = 'GITHUB_TOKEN=ghp_testsecret';
const rawBearer = 'Authorization: Bearer test-secret';
const rawBareBearer = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
const date = '2026-05-02';
const sessionId = '001';

function secretText(): string {
  return `${rawSecret}\n${rawGithubToken}\n${rawBearer}\n${rawBareBearer}`;
}

const evidenceDoc: EvidenceDocument = {
  issueTitle: 'Secret leakage in config',
  problem: `Problem contains ${secretText()}`,
  evidence: [`Evidence contains ${secretText()}`],
  severity: 'CRITICAL',
  suggestion: `Remove ${secretText()} from output`,
  filePath: 'src/auth.ts',
  lineRange: [12, 12],
};

function expectNoRawSecrets(output: string): void {
  expect(output).not.toContain('sk-test-secret');
  expect(output).not.toContain('ghp_testsecret');
  expect(output).not.toContain('Bearer test-secret');
  expect(output).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.signature');
}

describe('redaction utilities', () => {
  it('redacts assignment, GitHub token, and bearer token patterns', () => {
    const output = redactSecrets(secretText());

    expectNoRawSecrets(output);
    expect(output).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(output).toContain('GITHUB_TOKEN=[REDACTED]');
    expect(output).toContain('Authorization: Bearer [REDACTED]');
    expect(output).toContain('Bearer [REDACTED]');
  });

  it('preserves structured fields while redacting nested values', () => {
    const redacted = redactDeep({ file: 'src/auth.ts', line: 12, severity: 'CRITICAL', verdict: 'REJECT', token: rawSecret });

    expect(redacted.file).toBe('src/auth.ts');
    expect(redacted.line).toBe(12);
    expect(redacted.severity).toBe('CRITICAL');
    expect(redacted.verdict).toBe('REJECT');
    expect(redacted.token).toBe('OPENAI_API_KEY=[REDACTED]');
  });
});

describe('persisted review artifact redaction', () => {
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-redaction-'));
    process.chdir(tmpRoot);
    await fs.mkdir(path.join('.ca', 'sessions', date, sessionId, 'reviews'), { recursive: true });
    await fs.mkdir(path.join('.ca', 'sessions', date, sessionId, 'discussions', 'd001'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('redacts L1 review output artifacts without removing structured evidence', async () => {
    const review: ReviewOutput = {
      reviewerId: 'r1',
      model: 'test-model',
      group: 'auth',
      evidenceDocs: [evidenceDoc],
      rawResponse: secretText(),
      status: 'success',
    };

    const filePath = await writeReviewOutput(date, sessionId, review);
    const output = await fs.readFile(filePath, 'utf-8');

    expectNoRawSecrets(output);
    expect(output).toContain('**File:** src/auth.ts:12-12');
    expect(output).toContain('**Severity:** CRITICAL');
  });

  it('redacts L2 and L3 persisted artifacts', async () => {
    const round: DiscussionRound = {
      round: 1,
      moderatorPrompt: secretText(),
      supporterResponses: [{ supporterId: 's1', stance: 'agree', response: secretText() }],
    };
    const verdict: DiscussionVerdict = {
      discussionId: 'd001',
      filePath: 'src/auth.ts',
      lineRange: [12, 12],
      finalSeverity: 'CRITICAL',
      reasoning: secretText(),
      consensusReached: true,
      rounds: 1,
    };
    const report: ModeratorReport = {
      discussions: [verdict],
      roundsPerDiscussion: { d001: [round] },
      unconfirmedIssues: [evidenceDoc],
      suggestions: [evidenceDoc],
      summary: { totalDiscussions: 1, resolved: 1, escalated: 0 },
    };
    const head: HeadVerdict = {
      decision: 'REJECT',
      reasoning: secretText(),
      codeChanges: [{ filePath: 'src/auth.ts', changes: secretText() }],
    };

    await writeDiscussionRound(date, sessionId, 'd001', round);
    await writeDiscussionVerdict(date, sessionId, verdict);
    await writeSuggestions(date, sessionId, [evidenceDoc]);
    await writeModeratorReport(date, sessionId, report);
    await writeHeadVerdict(date, sessionId, head);

    const files = [
      '.ca/sessions/2026-05-02/001/discussions/d001/round-1.md',
      '.ca/sessions/2026-05-02/001/discussions/d001/verdict.md',
      '.ca/sessions/2026-05-02/001/suggestions.md',
      '.ca/sessions/2026-05-02/001/report.md',
      '.ca/sessions/2026-05-02/001/result.md',
    ];
    const outputs = await Promise.all(files.map((file) => fs.readFile(file, 'utf-8')));

    for (const output of outputs) {
      expectNoRawSecrets(output);
    }
    expect(outputs.join('\n')).toContain('src/auth.ts');
    expect(outputs.join('\n')).toContain('CRITICAL');
    expect(outputs.join('\n')).toContain('REJECT');
  });
});

describe('GitHub outward response redaction', () => {
  it('redacts review body and inline comments before posting', async () => {
    let capturedReview: unknown;
    const mockOctokit = {
      paginate: vi.fn().mockResolvedValue([]),
      pulls: {
        listReviews: vi.fn(),
        createReview: vi.fn().mockImplementation((params: unknown) => {
          capturedReview = params;
          return Promise.resolve({ data: { id: 123, html_url: 'https://example.test/review/123' } });
        }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: { id: 1, html_url: 'https://example.test/comment/1' } }),
      },
    } as unknown as Octokit;

    await postReview(
      { token: 'token', owner: 'owner', repo: 'repo' },
      7,
      {
        commit_id: 'abc123',
        event: 'COMMENT',
        body: `<!-- codeagora-v3 --> ${secretText()}`,
        comments: [{ path: 'src/auth.ts', position: 1, side: 'RIGHT', body: `**CRITICAL** ${secretText()}` }],
      },
      mockOctokit,
    );

    const serialized = JSON.stringify(capturedReview);
    expectNoRawSecrets(serialized);
    expect(serialized).toContain('src/auth.ts');
    expect(serialized).toContain('CRITICAL');
  });
});

describe('MCP outward response redaction', () => {
  it('redacts structured error details without breaking JSON structure', () => {
    const response = mcpErrorResponse('TEST_SECRET', 'failure', {
      file: 'src/auth.ts',
      line: 12,
      severity: 'CRITICAL',
      token: secretText(),
    });
    const text = response.content[0]?.text ?? '';
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expectNoRawSecrets(text);
    expect(parsed['status']).toBe('error');
    expect(parsed['code']).toBe('TEST_SECRET');
    expect((parsed['details'] as Record<string, unknown>)['file']).toBe('src/auth.ts');
  });
});

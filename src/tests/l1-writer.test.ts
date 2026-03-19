/**
 * L1 Evidence Writer Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReviewOutput, EvidenceDocument } from '@codeagora/core/types/core.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../packages/shared/src/utils/fs.js', () => ({
  writeMarkdown: vi.fn().mockResolvedValue(undefined),
  getReviewsDir: vi.fn(),
}));

import { writeReviewOutput, writeAllReviews } from '@codeagora/core/l1/writer.js';
import { writeMarkdown, getReviewsDir } from '@codeagora/shared/utils/fs.js';

const mockWriteMarkdown = vi.mocked(writeMarkdown);
const mockGetReviewsDir = vi.mocked(getReviewsDir);

// ============================================================================
// Fixtures
// ============================================================================

const sampleEvidence: EvidenceDocument = {
  issueTitle: 'SQL Injection Vulnerability',
  problem: 'User input is concatenated directly into the query.',
  evidence: ['req.body.username is not validated', 'String concatenation instead of parameterized query'],
  severity: 'CRITICAL',
  suggestion: 'Use parameterized queries.',
  filePath: 'src/auth.ts',
  lineRange: [45, 50],
};

function makeSuccessReview(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    reviewerId: 'reviewer-1',
    model: 'gpt-4o',
    group: 'group-a',
    evidenceDocs: [sampleEvidence],
    rawResponse: '',
    status: 'success',
    ...overrides,
  };
}

function makeForfeitReview(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    reviewerId: 'reviewer-2',
    model: 'claude-3-5-sonnet',
    group: 'group-b',
    evidenceDocs: [],
    rawResponse: '',
    status: 'forfeit',
    error: 'Execution timed out after 120s',
    ...overrides,
  };
}

// ============================================================================
// writeReviewOutput – file path construction
// ============================================================================

describe('writeReviewOutput() file path construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewsDir.mockReturnValue('.ca/sessions/2026-03-10/001/reviews');
  });

  it('calls getReviewsDir with the supplied date and sessionId', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    expect(mockGetReviewsDir).toHaveBeenCalledWith('2026-03-10', '001');
  });

  it('returns the full file path that was written', async () => {
    const filePath = await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    expect(filePath).toContain('.ca/sessions/2026-03-10/001/reviews');
    expect(filePath).toMatch(/\.md$/);
  });

  it('includes reviewerId in the filename', async () => {
    const filePath = await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ reviewerId: 'security-bot' }));

    expect(filePath).toContain('security-bot');
  });

  it('includes sanitised model name in the filename', async () => {
    const filePath = await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ model: 'claude-3.5-sonnet' }));

    // Non-alphanumeric chars replaced with '-'
    expect(filePath).toContain('claude-3-5-sonnet');
    expect(filePath).not.toContain('claude-3.5-sonnet');
  });

  it('writes to the correct path passed to writeMarkdown', async () => {
    const returnedPath = await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [writtenPath] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(writtenPath).toBe(returnedPath);
  });
});

// ============================================================================
// writeReviewOutput – content formatting (success with evidence)
// ============================================================================

describe('writeReviewOutput() content for a successful review with evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewsDir.mockReturnValue('.ca/sessions/2026-03-10/001/reviews');
  });

  it('includes a heading with reviewerId and model', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ reviewerId: 'r1', model: 'gpt-4o' }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('# Review by r1 (gpt-4o)');
  });

  it('includes the group in the output', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ group: 'group-a' }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('**Group:** group-a');
  });

  it('includes the status in the output', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ status: 'success' }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('**Status:** success');
  });

  it('shows the count of issues found', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ evidenceDocs: [sampleEvidence] }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('## Issues Found: 1');
  });

  it('includes the issue title for each evidence document', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('## Issue: SQL Injection Vulnerability');
  });

  it('includes file path and line range for each evidence document', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('**File:** src/auth.ts:45-50');
  });

  it('includes severity for each evidence document', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('**Severity:** CRITICAL');
  });

  it('includes the problem description', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('User input is concatenated directly into the query.');
  });

  it('includes each evidence item as a numbered list entry', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('1. req.body.username is not validated');
    expect(content).toContain('2. String concatenation instead of parameterized query');
  });

  it('includes the suggestion', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('Use parameterized queries.');
  });

  it('renders all evidence documents when there are multiple', async () => {
    const secondEvidence: EvidenceDocument = {
      ...sampleEvidence,
      issueTitle: 'Missing Auth Check',
      severity: 'WARNING',
    };
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ evidenceDocs: [sampleEvidence, secondEvidence] }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('## Issues Found: 2');
    expect(content).toContain('SQL Injection Vulnerability');
    expect(content).toContain('Missing Auth Check');
  });
});

// ============================================================================
// writeReviewOutput – content formatting (empty evidenceDocs)
// ============================================================================

describe('writeReviewOutput() content for a review with no evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewsDir.mockReturnValue('.ca/sessions/2026-03-10/001/reviews');
  });

  it('shows the no-issues-found section when evidenceDocs is empty', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ evidenceDocs: [] }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('## No Issues Found');
  });

  it('includes the explanatory sentence for no issues', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ evidenceDocs: [] }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('no issues in the assigned code group');
  });

  it('does not include an issues-found heading when there are no issues', async () => {
    await writeReviewOutput('2026-03-10', '001', makeSuccessReview({ evidenceDocs: [] }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).not.toContain('## Issues Found');
  });
});

// ============================================================================
// writeReviewOutput – content formatting (forfeit status)
// ============================================================================

describe('writeReviewOutput() content for a forfeit review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewsDir.mockReturnValue('.ca/sessions/2026-03-10/001/reviews');
  });

  it('shows the Error section when status is forfeit', async () => {
    await writeReviewOutput('2026-03-10', '001', makeForfeitReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('## Error');
  });

  it('includes the error message in a code block', async () => {
    await writeReviewOutput('2026-03-10', '001', makeForfeitReview({ error: 'Execution timed out after 120s' }));

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('Execution timed out after 120s');
    // Error is wrapped in a fenced code block
    expect(content).toContain('```');
  });

  it('does not include an issues section when status is forfeit', async () => {
    await writeReviewOutput('2026-03-10', '001', makeForfeitReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).not.toContain('## Issues Found');
    expect(content).not.toContain('## No Issues Found');
  });

  it('still shows the status field as forfeit', async () => {
    await writeReviewOutput('2026-03-10', '001', makeForfeitReview());

    const [, content] = mockWriteMarkdown.mock.calls[0] as [string, string];
    expect(content).toContain('**Status:** forfeit');
  });
});

// ============================================================================
// writeAllReviews
// ============================================================================

describe('writeAllReviews()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewsDir.mockReturnValue('.ca/sessions/2026-03-10/001/reviews');
  });

  it('returns an array of file paths, one per review', async () => {
    const reviews = [
      makeSuccessReview({ reviewerId: 'r1', model: 'gpt-4o' }),
      makeSuccessReview({ reviewerId: 'r2', model: 'claude-3-5-sonnet' }),
    ];

    const paths = await writeAllReviews('2026-03-10', '001', reviews);

    expect(paths).toHaveLength(2);
  });

  it('calls writeMarkdown once per review', async () => {
    const reviews = [
      makeSuccessReview({ reviewerId: 'r1' }),
      makeForfeitReview({ reviewerId: 'r2' }),
      makeSuccessReview({ reviewerId: 'r3', evidenceDocs: [] }),
    ];

    await writeAllReviews('2026-03-10', '001', reviews);

    expect(mockWriteMarkdown).toHaveBeenCalledTimes(3);
  });

  it('returns an empty array when given an empty reviews list', async () => {
    const paths = await writeAllReviews('2026-03-10', '001', []);

    expect(paths).toHaveLength(0);
    expect(mockWriteMarkdown).not.toHaveBeenCalled();
  });

  it('each returned path corresponds to its review (reviewerId in path)', async () => {
    const reviews = [
      makeSuccessReview({ reviewerId: 'alpha' }),
      makeSuccessReview({ reviewerId: 'beta' }),
    ];

    const paths = await writeAllReviews('2026-03-10', '001', reviews);

    expect(paths[0]).toContain('alpha');
    expect(paths[1]).toContain('beta');
  });

  it('passes correct date and sessionId when writing each review', async () => {
    await writeAllReviews('2026-03-10', '042', [makeSuccessReview()]);

    expect(mockGetReviewsDir).toHaveBeenCalledWith('2026-03-10', '042');
  });
});

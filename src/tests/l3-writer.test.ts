/**
 * L3 Head - Result Writer Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeHeadVerdict } from '@codeagora/core/l3/writer.js';
import type { HeadVerdict } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../packages/shared/src/utils/fs.js', () => ({
  writeMarkdown: vi.fn(),
  getResultPath: vi.fn(),
}));

import { writeMarkdown, getResultPath } from '@codeagora/shared/utils/fs.js';

const mockWriteMarkdown = vi.mocked(writeMarkdown);
const mockGetResultPath = vi.mocked(getResultPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerdict(overrides: Partial<HeadVerdict> = {}): HeadVerdict {
  return {
    decision: 'ACCEPT',
    reasoning: 'The code looks good and is ready to merge.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('writeHeadVerdict()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetResultPath.mockReturnValue('.ca/sessions/2026-03-10/001/result.md');
    mockWriteMarkdown.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // File path construction
  // -------------------------------------------------------------------------

  describe('file path construction', () => {
    it('calls getResultPath with the provided date and sessionId', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict());

      expect(mockGetResultPath).toHaveBeenCalledWith('2026-03-10', '001');
    });

    it('calls getResultPath exactly once', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict());

      expect(mockGetResultPath).toHaveBeenCalledTimes(1);
    });

    it('passes the path returned by getResultPath to writeMarkdown', async () => {
      mockGetResultPath.mockReturnValue('.ca/sessions/2024-01-15/042/result.md');

      await writeHeadVerdict('2024-01-15', '042', makeVerdict());

      expect(mockWriteMarkdown).toHaveBeenCalledWith(
        '.ca/sessions/2024-01-15/042/result.md',
        expect.any(String)
      );
    });

    it('calls writeMarkdown exactly once', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict());

      expect(mockWriteMarkdown).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Content: required header and decision fields
  // -------------------------------------------------------------------------

  describe('content formatting — required fields', () => {
    it('content starts with the "# Head Final Verdict" heading', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict());

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toMatch(/^# Head Final Verdict/);
    });

    it('content contains the decision field formatted as bold', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict({ decision: 'ACCEPT' }));

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('**Decision:** ACCEPT');
    });

    it('content contains the "## Reasoning" section heading', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict());

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('## Reasoning');
    });

    it('content includes the reasoning text', async () => {
      const reasoning = 'No critical issues found; safe to merge.';
      await writeHeadVerdict('2026-03-10', '001', makeVerdict({ reasoning }));

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain(reasoning);
    });
  });

  // -------------------------------------------------------------------------
  // ACCEPT decision
  // -------------------------------------------------------------------------

  describe('ACCEPT decision', () => {
    it('renders ACCEPT in the decision line', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict({ decision: 'ACCEPT' }));

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('**Decision:** ACCEPT');
    });

    it('does not include "## Questions for Human" section when questionsForHuman is absent', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict({ decision: 'ACCEPT' }));

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Questions for Human');
    });

    it('does not include "## Code Changes Applied" section when codeChanges is absent', async () => {
      await writeHeadVerdict('2026-03-10', '001', makeVerdict({ decision: 'ACCEPT' }));

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Code Changes Applied');
    });
  });

  // -------------------------------------------------------------------------
  // REJECT decision
  // -------------------------------------------------------------------------

  describe('REJECT decision', () => {
    it('renders REJECT in the decision line', async () => {
      const verdict = makeVerdict({
        decision: 'REJECT',
        reasoning: 'Critical security vulnerability found.',
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('**Decision:** REJECT');
    });

    it('does not include questions section when questionsForHuman is undefined', async () => {
      const verdict = makeVerdict({ decision: 'REJECT', questionsForHuman: undefined });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Questions for Human');
    });

    it('includes questions section when questionsForHuman is present', async () => {
      const verdict = makeVerdict({
        decision: 'REJECT',
        questionsForHuman: ['Is this change intentional?'],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('## Questions for Human');
      expect(content).toContain('- Is this change intentional?');
    });
  });

  // -------------------------------------------------------------------------
  // NEEDS_HUMAN decision
  // -------------------------------------------------------------------------

  describe('NEEDS_HUMAN decision', () => {
    it('renders NEEDS_HUMAN in the decision line', async () => {
      const verdict = makeVerdict({
        decision: 'NEEDS_HUMAN',
        reasoning: 'Consensus was not reached on two issues.',
        questionsForHuman: ['Please clarify the intent of d001.'],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('**Decision:** NEEDS_HUMAN');
    });

    it('includes questions section with all listed questions', async () => {
      const verdict = makeVerdict({
        decision: 'NEEDS_HUMAN',
        questionsForHuman: ['Clarify d001?', 'Is d002 a regression?'],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('## Questions for Human');
      expect(content).toContain('- Clarify d001?');
      expect(content).toContain('- Is d002 a regression?');
    });

    it('each question is rendered as a markdown list item', async () => {
      const verdict = makeVerdict({
        decision: 'NEEDS_HUMAN',
        questionsForHuman: ['Question one', 'Question two', 'Question three'],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('- Question one');
      expect(content).toContain('- Question two');
      expect(content).toContain('- Question three');
    });
  });

  // -------------------------------------------------------------------------
  // questionsForHuman edge cases
  // -------------------------------------------------------------------------

  describe('questionsForHuman edge cases', () => {
    it('does not include questions section when questionsForHuman is an empty array', async () => {
      const verdict = makeVerdict({ questionsForHuman: [] });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Questions for Human');
    });

    it('includes questions section when questionsForHuman has a single entry', async () => {
      const verdict = makeVerdict({ questionsForHuman: ['Only one question.'] });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('## Questions for Human');
      expect(content).toContain('- Only one question.');
    });
  });

  // -------------------------------------------------------------------------
  // codeChanges — with changes
  // -------------------------------------------------------------------------

  describe('codeChanges — with entries', () => {
    it('includes "## Code Changes Applied" section heading', async () => {
      const verdict = makeVerdict({
        codeChanges: [{ filePath: 'src/auth.ts', changes: 'return null;' }],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('## Code Changes Applied');
    });

    it('renders the file path as a sub-heading', async () => {
      const verdict = makeVerdict({
        codeChanges: [{ filePath: 'src/auth.ts', changes: 'return null;' }],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('### src/auth.ts');
    });

    it('wraps code changes in a fenced code block', async () => {
      const verdict = makeVerdict({
        codeChanges: [{ filePath: 'src/auth.ts', changes: 'return null;' }],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('```\nreturn null;\n```');
    });

    it('renders multiple code change entries in order', async () => {
      const verdict = makeVerdict({
        codeChanges: [
          { filePath: 'src/auth.ts', changes: 'fix auth' },
          { filePath: 'src/user.ts', changes: 'fix user' },
        ],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      const authIndex = content.indexOf('### src/auth.ts');
      const userIndex = content.indexOf('### src/user.ts');

      expect(authIndex).toBeGreaterThan(-1);
      expect(userIndex).toBeGreaterThan(-1);
      expect(authIndex).toBeLessThan(userIndex);
    });

    it('renders the changes text for each entry', async () => {
      const verdict = makeVerdict({
        codeChanges: [
          { filePath: 'src/auth.ts', changes: 'fix auth' },
          { filePath: 'src/user.ts', changes: 'fix user' },
        ],
      });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('fix auth');
      expect(content).toContain('fix user');
    });
  });

  // -------------------------------------------------------------------------
  // codeChanges — absent or empty
  // -------------------------------------------------------------------------

  describe('codeChanges — absent or empty', () => {
    it('does not include code changes section when codeChanges is undefined', async () => {
      const verdict = makeVerdict({ codeChanges: undefined });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Code Changes Applied');
    });

    it('does not include code changes section when codeChanges is an empty array', async () => {
      const verdict = makeVerdict({ codeChanges: [] });
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).not.toContain('## Code Changes Applied');
    });
  });

  // -------------------------------------------------------------------------
  // Full verdict with all optional fields populated
  // -------------------------------------------------------------------------

  describe('full verdict with all optional fields', () => {
    it('renders decision, reasoning, questions, and code changes together', async () => {
      const verdict: HeadVerdict = {
        decision: 'NEEDS_HUMAN',
        reasoning: 'Mixed signals from reviewers.',
        questionsForHuman: ['Should we keep this pattern?'],
        codeChanges: [{ filePath: 'lib/core.ts', changes: '- old line\n+ new line' }],
      };
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      expect(content).toContain('**Decision:** NEEDS_HUMAN');
      expect(content).toContain('Mixed signals from reviewers.');
      expect(content).toContain('## Questions for Human');
      expect(content).toContain('- Should we keep this pattern?');
      expect(content).toContain('## Code Changes Applied');
      expect(content).toContain('### lib/core.ts');
      expect(content).toContain('- old line\n+ new line');
    });

    it('questions section appears before code changes section', async () => {
      const verdict: HeadVerdict = {
        decision: 'NEEDS_HUMAN',
        reasoning: 'Review needed.',
        questionsForHuman: ['Please clarify.'],
        codeChanges: [{ filePath: 'src/x.ts', changes: 'patch' }],
      };
      await writeHeadVerdict('2026-03-10', '001', verdict);

      const content: string = mockWriteMarkdown.mock.calls[0][1];
      const questionsIndex = content.indexOf('## Questions for Human');
      const changesIndex = content.indexOf('## Code Changes Applied');

      expect(questionsIndex).toBeLessThan(changesIndex);
    });
  });
});

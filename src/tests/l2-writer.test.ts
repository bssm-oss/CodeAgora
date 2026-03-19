/**
 * L2 Writer Tests
 * Tests all exported functions in l2/writer.ts using mocked fs utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the fs utilities module before importing the module under test.
vi.mock('../../packages/shared/src/utils/fs.js', () => ({
  writeMarkdown: vi.fn(),
  appendMarkdown: vi.fn(),
  getDiscussionsDir: vi.fn(),
  getUnconfirmedDir: vi.fn(),
  getSuggestionsPath: vi.fn(),
  getReportPath: vi.fn(),
  getSessionDir: vi.fn(),
  ensureDir: vi.fn(),
}));

// Mock fs/promises writeFile used directly by writeSupportersLog.
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

import {
  writeDiscussionRound,
  writeDiscussionVerdict,
  writeSuggestions,
  writeModeratorReport,
  writeSupportersLog,
} from '@codeagora/core/l2/writer.js';

import {
  writeMarkdown,
  getDiscussionsDir,
  getSuggestionsPath,
  getReportPath,
  ensureDir,
} from '@codeagora/shared/utils/fs.js';

import { writeFile } from 'fs/promises';

import type {
  DiscussionRound,
  DiscussionVerdict,
  EvidenceDocument,
  ModeratorReport,
} from '@codeagora/core/types/core.js';

const mockWriteMarkdown = vi.mocked(writeMarkdown);
const mockGetDiscussionsDir = vi.mocked(getDiscussionsDir);
const mockGetSuggestionsPath = vi.mocked(getSuggestionsPath);
const mockGetReportPath = vi.mocked(getReportPath);
const mockEnsureDir = vi.mocked(ensureDir);
const mockWriteFile = vi.mocked(writeFile);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DATE = '2026-03-10';
const SESSION_ID = '001';
const DISCUSSION_ID = 'd001';

function makeRound(overrides: Partial<DiscussionRound> = {}): DiscussionRound {
  return {
    round: 1,
    moderatorPrompt: 'Is this a real issue?',
    supporterResponses: [
      { supporterId: 'sp1', response: 'Yes, this is critical.', stance: 'agree' },
      { supporterId: 'sp2', response: 'I disagree, it is minor.', stance: 'disagree' },
    ],
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict {
  return {
    discussionId: DISCUSSION_ID,
    filePath: 'src/test.ts',
    lineRange: [1, 5] as [number, number],
    finalSeverity: 'WARNING',
    reasoning: 'Majority agreed on WARNING severity.',
    consensusReached: true,
    rounds: 2,
    ...overrides,
  };
}

function makeEvidenceDocument(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Null dereference',
    problem: 'Pointer may be null here.',
    evidence: ['Line 42 dereferences without a null check.'],
    severity: 'WARNING',
    suggestion: 'Add a null check before dereferencing.',
    filePath: 'src/auth.ts',
    lineRange: [40, 50],
    ...overrides,
  };
}

function makeReport(overrides: Partial<ModeratorReport> = {}): ModeratorReport {
  return {
    discussions: [
      makeVerdict({ discussionId: 'd001', consensusReached: true }),
      makeVerdict({ discussionId: 'd002', consensusReached: false, finalSeverity: 'CRITICAL' }),
    ],
    roundsPerDiscussion: {},
    unconfirmedIssues: [makeEvidenceDocument()],
    suggestions: [makeEvidenceDocument({ severity: 'SUGGESTION' })],
    summary: { totalDiscussions: 2, resolved: 1, escalated: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default return values so path-construction assertions are stable.
  mockGetDiscussionsDir.mockReturnValue('.ca/sessions/2026-03-10/001/discussions');
  mockGetSuggestionsPath.mockReturnValue('.ca/sessions/2026-03-10/001/suggestions.md');
  mockGetReportPath.mockReturnValue('.ca/sessions/2026-03-10/001/report.md');
  mockEnsureDir.mockResolvedValue(undefined);
  mockWriteMarkdown.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

// ============================================================================
// writeDiscussionRound
// ============================================================================

describe('writeDiscussionRound()', () => {
  it('calls getDiscussionsDir with correct date and sessionId', async () => {
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, makeRound());
    expect(mockGetDiscussionsDir).toHaveBeenCalledWith(DATE, SESSION_ID);
  });

  it('ensures the discussion-specific subdirectory exists', async () => {
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, makeRound());
    expect(mockEnsureDir).toHaveBeenCalledWith(
      expect.stringContaining(DISCUSSION_ID)
    );
  });

  it('writes to a file named round-{N}.md inside the discussion directory', async () => {
    const round = makeRound({ round: 3 });
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, round);

    const [filePath] = mockWriteMarkdown.mock.calls[0];
    expect(filePath).toContain('round-3.md');
    expect(filePath).toContain(DISCUSSION_ID);
  });

  it('writes the round number as a heading in the content', async () => {
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, makeRound({ round: 2 }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('# Round 2');
  });

  it('includes the moderator prompt in the content', async () => {
    const prompt = 'What is the impact of this issue?';
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, makeRound({ moderatorPrompt: prompt }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain(prompt);
  });

  it('includes each supporter response with their id and uppercased stance', async () => {
    const round = makeRound({
      supporterResponses: [
        { supporterId: 'sp-alpha', response: 'Confirmed.', stance: 'agree' },
        { supporterId: 'sp-beta', response: 'Not sure.', stance: 'neutral' },
      ],
    });
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, round);
    const [, content] = mockWriteMarkdown.mock.calls[0];

    expect(content).toContain('sp-alpha');
    expect(content).toContain('AGREE');
    expect(content).toContain('Confirmed.');
    expect(content).toContain('sp-beta');
    expect(content).toContain('NEUTRAL');
  });

  it('produces empty supporter section when supporterResponses is empty', async () => {
    const round = makeRound({ supporterResponses: [] });
    await writeDiscussionRound(DATE, SESSION_ID, DISCUSSION_ID, round);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    // Heading is still present; no supporter lines follow
    expect(content).toContain('## Supporter Responses');
  });
});

// ============================================================================
// writeDiscussionVerdict
// ============================================================================

describe('writeDiscussionVerdict()', () => {
  it('calls getDiscussionsDir with correct date and sessionId', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict());
    expect(mockGetDiscussionsDir).toHaveBeenCalledWith(DATE, SESSION_ID);
  });

  it('ensures the discussion subdirectory exists using discussionId from verdict', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ discussionId: 'd042' }));
    expect(mockEnsureDir).toHaveBeenCalledWith(expect.stringContaining('d042'));
  });

  it('writes to verdict.md inside the discussion directory', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict());
    const [filePath] = mockWriteMarkdown.mock.calls[0];
    expect(filePath).toContain('verdict.md');
    expect(filePath).toContain(DISCUSSION_ID);
  });

  it('includes the discussionId in the verdict heading', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ discussionId: 'd007' }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('d007');
  });

  it('writes the finalSeverity into the content', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ finalSeverity: 'CRITICAL' }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('CRITICAL');
  });

  it('marks consensus as Yes when consensusReached is true', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ consensusReached: true }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('Yes');
  });

  it('marks consensus as No (Escalated) when consensusReached is false', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ consensusReached: false }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('No (Escalated)');
  });

  it('writes the round count into the content', async () => {
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ rounds: 5 }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('5');
  });

  it('includes the reasoning text in the content', async () => {
    const reasoning = 'The panel reached a clear agreement.';
    await writeDiscussionVerdict(DATE, SESSION_ID, makeVerdict({ reasoning }));
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain(reasoning);
  });

  it('handles DISMISSED as finalSeverity without error', async () => {
    await writeDiscussionVerdict(
      DATE,
      SESSION_ID,
      makeVerdict({ finalSeverity: 'DISMISSED' })
    );
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('DISMISSED');
  });
});

// ============================================================================
// writeSuggestions
// ============================================================================

describe('writeSuggestions()', () => {
  it('calls getSuggestionsPath with correct date and sessionId', async () => {
    await writeSuggestions(DATE, SESSION_ID, []);
    expect(mockGetSuggestionsPath).toHaveBeenCalledWith(DATE, SESSION_ID);
  });

  it('writes to the path returned by getSuggestionsPath', async () => {
    mockGetSuggestionsPath.mockReturnValue('/custom/suggestions.md');
    await writeSuggestions(DATE, SESSION_ID, [makeEvidenceDocument()]);
    const [filePath] = mockWriteMarkdown.mock.calls[0];
    expect(filePath).toBe('/custom/suggestions.md');
  });

  it('writes a # Suggestions heading regardless of input', async () => {
    await writeSuggestions(DATE, SESSION_ID, []);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('# Suggestions');
  });

  it('writes an empty suggestions body when suggestions array is empty', async () => {
    await writeSuggestions(DATE, SESSION_ID, []);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    // Header present but no issue sections
    expect(content).not.toContain('##');
  });

  it('writes each suggestion as a ## heading with its issueTitle', async () => {
    const s1 = makeEvidenceDocument({ issueTitle: 'Memory leak in auth' });
    const s2 = makeEvidenceDocument({ issueTitle: 'SQL injection risk' });
    await writeSuggestions(DATE, SESSION_ID, [s1, s2]);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('## Memory leak in auth');
    expect(content).toContain('## SQL injection risk');
  });

  it('includes the filePath and lineRange for each suggestion', async () => {
    const s = makeEvidenceDocument({ filePath: 'src/db.ts', lineRange: [10, 20] });
    await writeSuggestions(DATE, SESSION_ID, [s]);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('src/db.ts:10-20');
  });

  it('includes the suggestion text for each evidence document', async () => {
    const s = makeEvidenceDocument({ suggestion: 'Use parameterized queries.' });
    await writeSuggestions(DATE, SESSION_ID, [s]);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('Use parameterized queries.');
  });

  it('handles multiple suggestions with correct filePath and lineRange for each', async () => {
    const s1 = makeEvidenceDocument({ filePath: 'src/a.ts', lineRange: [1, 5], issueTitle: 'Issue A' });
    const s2 = makeEvidenceDocument({ filePath: 'src/b.ts', lineRange: [100, 110], issueTitle: 'Issue B' });
    await writeSuggestions(DATE, SESSION_ID, [s1, s2]);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('src/a.ts:1-5');
    expect(content).toContain('src/b.ts:100-110');
  });
});

// ============================================================================
// writeModeratorReport
// ============================================================================

describe('writeModeratorReport()', () => {
  it('calls getReportPath with correct date and sessionId', async () => {
    await writeModeratorReport(DATE, SESSION_ID, makeReport());
    expect(mockGetReportPath).toHaveBeenCalledWith(DATE, SESSION_ID);
  });

  it('writes to the path returned by getReportPath', async () => {
    mockGetReportPath.mockReturnValue('/custom/report.md');
    await writeModeratorReport(DATE, SESSION_ID, makeReport());
    const [filePath] = mockWriteMarkdown.mock.calls[0];
    expect(filePath).toBe('/custom/report.md');
  });

  it('includes a # Moderator Report heading', async () => {
    await writeModeratorReport(DATE, SESSION_ID, makeReport());
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('# Moderator Report');
  });

  it('writes totalDiscussions, resolved, and escalated counts in the summary', async () => {
    const report = makeReport({
      summary: { totalDiscussions: 5, resolved: 3, escalated: 2 },
    });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('5');
    expect(content).toContain('3');
    expect(content).toContain('2');
  });

  it('places resolved discussions under "## Resolved Discussions"', async () => {
    const resolved = makeVerdict({ discussionId: 'r-001', consensusReached: true });
    const report = makeReport({ discussions: [resolved], summary: { totalDiscussions: 1, resolved: 1, escalated: 0 } });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    const resolvedSection = content.split('## Resolved Discussions')[1];
    expect(resolvedSection).toContain('r-001');
  });

  it('places escalated discussions under "## Escalated to Head"', async () => {
    const escalated = makeVerdict({ discussionId: 'e-002', consensusReached: false });
    const report = makeReport({ discussions: [escalated], summary: { totalDiscussions: 1, resolved: 0, escalated: 1 } });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    const escalatedSection = content.split('## Escalated to Head')[1];
    expect(escalatedSection).toContain('e-002');
  });

  it('does not put a resolved discussion under "## Escalated to Head"', async () => {
    const resolved = makeVerdict({ discussionId: 'only-resolved', consensusReached: true });
    const report = makeReport({ discussions: [resolved], summary: { totalDiscussions: 1, resolved: 1, escalated: 0 } });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    const escalatedSection = content.split('## Escalated to Head')[1];
    expect(escalatedSection).not.toContain('only-resolved');
  });

  it('writes the unconfirmed issues count', async () => {
    const report = makeReport({
      unconfirmedIssues: [makeEvidenceDocument(), makeEvidenceDocument()],
    });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('2 issue(s)');
  });

  it('writes 0 unconfirmed issues when the array is empty', async () => {
    const report = makeReport({ unconfirmedIssues: [] });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('0 issue(s)');
  });

  it('writes the suggestions count', async () => {
    const report = makeReport({
      suggestions: [makeEvidenceDocument(), makeEvidenceDocument(), makeEvidenceDocument()],
    });
    await writeModeratorReport(DATE, SESSION_ID, report);
    const [, content] = mockWriteMarkdown.mock.calls[0];
    expect(content).toContain('3 low-priority suggestion(s)');
  });

  it('handles an empty discussions array without error', async () => {
    const report = makeReport({
      discussions: [],
      summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
    });
    await writeModeratorReport(DATE, SESSION_ID, report);
    expect(mockWriteMarkdown).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// writeSupportersLog
// ============================================================================

describe('writeSupportersLog()', () => {
  it('calls getDiscussionsDir with correct date and sessionId', async () => {
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, []);
    expect(mockGetDiscussionsDir).toHaveBeenCalledWith(DATE, SESSION_ID);
  });

  it('ensures the discussion subdirectory exists', async () => {
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, []);
    expect(mockEnsureDir).toHaveBeenCalledWith(expect.stringContaining(DISCUSSION_ID));
  });

  it('writes to supporters.json inside the discussion directory', async () => {
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, []);
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(filePath).toContain('supporters.json');
    expect(filePath).toContain(DISCUSSION_ID);
  });

  it('writes valid JSON as utf-8', async () => {
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, []);
    const [, rawContent, encoding] = mockWriteFile.mock.calls[0];
    expect(encoding).toBe('utf-8');
    expect(() => JSON.parse(rawContent as string)).not.toThrow();
  });

  it('logs each supporter id, model, and persona in the JSON', async () => {
    const supporters = [
      { id: 'sp1', model: 'gpt-4o', assignedPersona: '.ca/personas/strict.md' },
      { id: 'sp2', model: 'gemini-flash', assignedPersona: undefined },
    ];
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, supporters);
    const [, rawContent] = mockWriteFile.mock.calls[0];
    const log = JSON.parse(rawContent as string);

    expect(log.supporters).toHaveLength(2);
    expect(log.supporters[0]).toMatchObject({ id: 'sp1', model: 'gpt-4o', persona: '.ca/personas/strict.md' });
    expect(log.supporters[1]).toMatchObject({ id: 'sp2', model: 'gemini-flash', persona: null });
  });

  it('builds combination string from model names joined by +', async () => {
    const supporters = [
      { id: 'sp1', model: 'gpt-4o', assignedPersona: undefined },
      { id: 'sp2', model: 'gemini-flash', assignedPersona: undefined },
    ];
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, supporters);
    const [, rawContent] = mockWriteFile.mock.calls[0];
    const log = JSON.parse(rawContent as string);
    expect(log.combination).toContain('gpt-4o+gemini-flash');
  });

  it('uses basename without .md extension for persona in combination string', async () => {
    const supporters = [
      { id: 'sp1', model: 'gpt-4o', assignedPersona: '.ca/personas/strict.md' },
    ];
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, supporters);
    const [, rawContent] = mockWriteFile.mock.calls[0];
    const log = JSON.parse(rawContent as string);
    expect(log.combination).toContain('strict');
    expect(log.combination).not.toContain('.md');
  });

  it('uses "none" as persona identifier in combination string when assignedPersona is absent', async () => {
    const supporters = [{ id: 'sp1', model: 'gpt-4o', assignedPersona: undefined }];
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, supporters);
    const [, rawContent] = mockWriteFile.mock.calls[0];
    const log = JSON.parse(rawContent as string);
    expect(log.combination).toContain('none');
  });

  it('writes an empty supporters array when called with no supporters', async () => {
    await writeSupportersLog(DATE, SESSION_ID, DISCUSSION_ID, []);
    const [, rawContent] = mockWriteFile.mock.calls[0];
    const log = JSON.parse(rawContent as string);
    expect(log.supporters).toEqual([]);
    expect(log.combination).toBe(' / ');
  });
});

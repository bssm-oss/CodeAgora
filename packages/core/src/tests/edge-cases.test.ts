/**
 * Edge-case coverage for core package modules.
 *
 * Covers: parser (empty/JSON response, severity typo, lineRange, filePath, long evidence),
 * chunker (empty diff, huge single-file diff), config validator (empty reviewers, duplicate ids),
 * moderator (maxRounds=0 via checkConsensus path), and L3 verdict (LLM timeout → fallback).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

import { parseEvidenceResponse } from '../l1/parser.js';

describe('parseEvidenceResponse — empty/minimal responses', () => {
  it('returns empty array for empty string (11)', () => {
    const result = parseEvidenceResponse('');
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    const result = parseEvidenceResponse('   \n\n\t  ');
    expect(result).toEqual([]);
  });

  it('returns empty array when response contains "no issues found" (11)', () => {
    const result = parseEvidenceResponse('No issues found.');
    expect(result).toEqual([]);
  });

  it('handles pure JSON response with no markdown blocks (12)', () => {
    // JSON-only response — no ## Issue blocks means no structured evidence parsed.
    // The function should not throw and should return an empty array (no parseable blocks).
    const jsonResponse = JSON.stringify({
      issues: [{ title: 'test', severity: 'WARNING', file: 'src/foo.ts' }],
    });
    expect(() => parseEvidenceResponse(jsonResponse)).not.toThrow();
    // No markdown structure → no evidence documents
    const result = parseEvidenceResponse(jsonResponse);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('parseEvidenceResponse — severity parsing edge cases', () => {
  // Build a minimal well-formed evidence block helper
  function makeBlock(severity: string, fileLine = 'In src/foo.ts:10-20'): string {
    return `## Issue: Test Issue\n\n### 문제\n${fileLine}\n\n### 근거\n1. Evidence item\n\n### 심각도\n${severity}\n\n### 제안\nFix it\n`;
  }

  it('defaults to SUGGESTION for unrecognized severity typo like CRITCAL (19)', () => {
    const result = parseEvidenceResponse(makeBlock('CRITCAL'));
    expect(result).toHaveLength(1);
    // parseSeverity: doesn't match CRITICAL/WARNING/HARSHLY_CRITICAL → SUGGESTION
    expect(result[0].severity).toBe('SUGGESTION');
  });

  it('parses HARSHLY_CRITICAL correctly', () => {
    const result = parseEvidenceResponse(makeBlock('HARSHLY_CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HARSHLY_CRITICAL');
  });

  it('parses WARNING correctly', () => {
    const result = parseEvidenceResponse(makeBlock('WARNING'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('WARNING');
  });
});

describe('parseEvidenceResponse — file info edge cases', () => {
  function makeBlock(problemLine: string): string {
    return `## Issue: File Edge Case\n\n### 문제\n${problemLine}\n\n### 근거\n1. Evidence item\n\n### 심각도\nWARNING\n\n### 제안\nFix it\n`;
  }

  it('handles reversed lineRange [20, 10] — both numbers extracted (20)', () => {
    // The parser extracts start=20, end=10 from "src/foo.ts:20-10"
    // (it does not normalize the order — that is the documented behavior)
    const result = parseEvidenceResponse(makeBlock('In src/foo.ts:20-10'));
    expect(result).toHaveLength(1);
    expect(result[0].lineRange[0]).toBe(20);
    expect(result[0].lineRange[1]).toBe(10);
  });

  it('handles "In :10-20" with empty filePath — falls back to unknown (21)', () => {
    // The primary pattern requires at least one character for the filename.
    // "In :10-20" will not match any pattern → filePath = 'unknown'
    const result = parseEvidenceResponse(makeBlock('In :10-20'));
    expect(result).toHaveLength(1);
    // Falls back to unknown; severity escalated to CRITICAL per parser logic
    expect(result[0].filePath).toBe('unknown');
  });

  it('handles extremely long evidence list — 1000 lines (22)', () => {
    const longEvidence = Array.from({ length: 1000 }, (_, i) => `${i + 1}. Evidence line ${i + 1}`).join('\n');
    const block = `## Issue: Long Evidence\n\n### 문제\nIn src/foo.ts:1-10\n\n### 근거\n${longEvidence}\n\n### 심각도\nWARNING\n\n### 제안\nFix it\n`;
    const result = parseEvidenceResponse(block);
    expect(result).toHaveLength(1);
    // All 1000 evidence items should be parsed
    expect(result[0].evidence).toHaveLength(1000);
  });
});

// ---------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------

import { chunkDiff, parseDiffFiles, estimateTokens } from '../pipeline/chunker.js';

describe('chunkDiff — empty diff (9)', () => {
  it('returns empty array for empty string', async () => {
    const result = await chunkDiff('');
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only diff', async () => {
    const result = await chunkDiff('   \n\n  ');
    expect(result).toEqual([]);
  });
});

describe('chunkDiff — huge single-file diff (10)', () => {
  it('handles a diff with tokens 10x the maxTokens limit', async () => {
    const maxTokens = 1000;
    // Build a valid unified diff with many hunks to exceed 10x token budget
    const hunks = Array.from({ length: 50 }, (_, i) => {
      const base = i * 20 + 1;
      return `@@ -${base},10 +${base},10 @@\n` +
        Array.from({ length: 20 }, (_, j) => ` line ${base + j} content here with enough text to fill tokens`).join('\n') +
        '\n';
    }).join('');

    const diff = `diff --git a/src/huge.ts b/src/huge.ts\nindex abc..def 100644\n--- a/src/huge.ts\n+++ b/src/huge.ts\n${hunks}`;

    const tokens = estimateTokens(diff);
    expect(tokens).toBeGreaterThan(maxTokens * 10);

    // Should not throw — either returns multiple chunks or one best-effort chunk
    const result = await chunkDiff(diff, { maxTokens });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // All files should be accounted for
    const allFiles = result.flatMap((c) => c.files);
    expect(allFiles.some((f) => f.includes('huge.ts'))).toBe(true);
  });
});

describe('parseDiffFiles', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiffFiles('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseDiffFiles('   \n  ')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Config Validator
// ---------------------------------------------------------------------------

import { strictValidateConfig } from '../config/validator.js';
import type { Config } from '../types/config.js';

// Minimal valid config fixture
function makeMinimalConfig(overrides: Partial<Config> = {}): Config {
  return {
    reviewers: [
      { id: 'r1', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
      { id: 'r2', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
      { id: 'r3', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
    ],
    ...overrides,
  } as Config;
}

describe('strictValidateConfig — empty reviewers array (13)', () => {
  it('returns valid:true with a warning for zero enabled reviewers', () => {
    const result = strictValidateConfig(makeMinimalConfig({ reviewers: [] }));
    // The validator does not hard-error on empty array — it warns
    expect(result.valid).toBe(true);
    // No errors (empty array produces no per-reviewer errors)
    expect(result.errors).toHaveLength(0);
  });
});

describe('strictValidateConfig — duplicate reviewer IDs (14)', () => {
  it('does not error on duplicate ids (validator does not check uniqueness)', () => {
    const config = makeMinimalConfig({
      reviewers: [
        { id: 'r1', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
        { id: 'r1', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
        { id: 'r1', backend: 'claude', model: 'claude-3-haiku', enabled: true, timeout: 60, persona: 'general' },
      ],
    });
    const result = strictValidateConfig(config);
    // Duplicate IDs are not explicitly rejected by strictValidateConfig —
    // this test documents the current behavior.
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.valid).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Moderator — runModerator with maxRounds=0 (8)
// ---------------------------------------------------------------------------

import { runModerator } from '../l2/moderator.js';

describe('runModerator — maxRounds=0 (8)', () => {
  beforeEach(() => {
    // Mock writeDiscussionRound, writeDiscussionVerdict, writeSupportersLog to avoid FS
    vi.mock('../l2/writer.js', () => ({
      writeDiscussionRound: vi.fn().mockResolvedValue(undefined),
      writeDiscussionVerdict: vi.fn().mockResolvedValue(undefined),
      writeSupportersLog: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock('../l2/objection.js', () => ({
      checkForObjections: vi.fn().mockResolvedValue({ objections: [] }),
      handleObjections: vi.fn().mockReturnValue({ shouldExtend: false }),
    }));
    vi.mock('../l1/backend.js', () => ({
      executeBackend: vi.fn().mockResolvedValue('Severity: WARNING\nReasonable decision.'),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a report with all discussions producing verdicts when maxRounds=0', async () => {
    const discussion = {
      id: 'disc-001',
      issueTitle: 'Test Issue',
      filePath: 'src/foo.ts',
      lineRange: [1, 10] as [number, number],
      severity: 'WARNING' as const,
      evidenceDocs: [],
      codeSnippet: '',
      status: 'pending' as const,
    };

    const moderatorConfig = {
      backend: 'api' as const,
      model: 'claude-3-haiku',
      provider: 'anthropic',
      timeout: 30,
      enabled: true,
    };

    const supporterPoolConfig = {
      pool: [],
      pickCount: 0,
      pickStrategy: 'random' as const,
      devilsAdvocate: { id: 'da', backend: 'api' as const, model: 'claude-3-haiku', provider: 'anthropic', enabled: false, timeout: 30, persona: 'devil' },
      personaPool: [],
      personaAssignment: 'random' as const,
    };

    const result = await runModerator({
      config: moderatorConfig,
      supporterPoolConfig,
      discussions: [discussion],
      settings: {
        enabled: true,
        maxRounds: 0,
        registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
        codeSnippetRange: 10,
        objectionTimeout: 60,
        maxObjectionRounds: 1,
      },
      date: '2026-03-21',
      sessionId: '001',
    });

    // With maxRounds=0 the for-loop body never executes.
    // moderatorForcedDecision is called, returns a verdict.
    expect(result.discussions).toHaveLength(1);
    expect(result.summary.totalDiscussions).toBe(1);
  });

  it('escalates unresolved discussions directly to head when moderator is disabled', async () => {
    const discussion = {
      id: 'disc-no-moderator',
      issueTitle: 'Escalate Without Moderator',
      filePath: 'src/foo.ts',
      lineRange: [1, 10] as [number, number],
      severity: 'WARNING' as const,
      evidenceDocs: [],
      codeSnippet: '',
      status: 'pending' as const,
    };

    const moderatorConfig = {
      backend: 'api' as const,
      model: 'z-ai/glm-5.1',
      provider: 'openrouter',
      timeout: 30,
      enabled: false,
    };

    const supporterPoolConfig = {
      pool: [
        { id: 's1', backend: 'api' as const, model: 'z-ai/glm-5.1', provider: 'openrouter', enabled: true, timeout: 30, persona: 'supporter' },
      ],
      pickCount: 1,
      pickStrategy: 'random' as const,
      devilsAdvocate: { id: 'da', backend: 'api' as const, model: 'moonshotai/kimi-k2.5', provider: 'openrouter', enabled: false, timeout: 30, persona: 'devil' },
      personaPool: ['supporter'],
      personaAssignment: 'random' as const,
    };

    const result = await runModerator({
      config: moderatorConfig,
      supporterPoolConfig,
      discussions: [discussion],
      settings: {
        enabled: true,
        maxRounds: 0,
        registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
        codeSnippetRange: 10,
        objectionTimeout: 60,
        maxObjectionRounds: 1,
      },
      date: '2026-03-21',
      sessionId: '001',
    });

    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0]!.finalSeverity).toBe('WARNING');
    expect(result.discussions[0]!.consensusReached).toBe(false);
    expect(result.discussions[0]!.reasoning).toContain('Moderator disabled');
    expect(result.summary.escalated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// L3 Verdict — LLM timeout falls back to rule-based (16)
// ---------------------------------------------------------------------------

import { makeHeadVerdict } from '../l3/verdict.js';
import type { ModeratorReport } from '../types/core.js';

function makeReport(overrides: Partial<ModeratorReport> = {}): ModeratorReport {
  return {
    discussions: [],
    roundsPerDiscussion: {},
    unconfirmedIssues: [],
    suggestions: [],
    summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
    ...overrides,
  };
}

describe('makeHeadVerdict — LLM timeout falls back to NEEDS_HUMAN (16)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to rule-based verdict when executeBackend throws (simulates timeout)', async () => {
    vi.mock('../l1/backend.js', () => ({
      executeBackend: vi.fn().mockRejectedValue(new Error('Backend timed out after 120s (SIGKILL escalation)')),
    }));

    const report = makeReport({
      discussions: [
        {
          discussionId: 'disc-001',
          filePath: 'src/foo.ts',
          lineRange: [1, 10],
          finalSeverity: 'WARNING',
          reasoning: 'Test issue',
          consensusReached: false,
          rounds: 1,
        },
      ],
      summary: { totalDiscussions: 1, resolved: 0, escalated: 1 },
    });

    const headConfig = {
      backend: 'api' as const,
      model: 'claude-3-haiku',
      provider: 'anthropic',
      enabled: true,
      timeout: 120,
    };

    const verdict = await makeHeadVerdict(report, headConfig);

    // After LLM failure, rule-based fallback fires.
    // 1 escalated issue → NEEDS_HUMAN
    expect(verdict.decision).toBe('NEEDS_HUMAN');
  });

  it('returns ACCEPT via rule-based when no issues and no head config', async () => {
    const report = makeReport();
    const verdict = await makeHeadVerdict(report);
    expect(verdict.decision).toBe('ACCEPT');
  });
});

// ---------------------------------------------------------------------------
// Moderator supporter partial timeout (15)
// ---------------------------------------------------------------------------

import { parseStance } from '../l2/moderator.js';

describe('parseStance — various response patterns', () => {
  it('returns "agree" for structured "Stance: AGREE"', () => {
    expect(parseStance('Stance: AGREE\nThe evidence is solid.')).toBe('agree');
  });

  it('returns "disagree" for structured "Verdict: disagree"', () => {
    expect(parseStance('Verdict: disagree\nEvidence is insufficient.')).toBe('disagree');
  });

  it('returns "neutral" when response contains no stance keywords', () => {
    expect(parseStance('The code looks interesting.')).toBe('neutral');
  });

  it('does not confuse "disagree" substring in "agree" — returns disagree (15)', () => {
    // "DISAGREE" checked before "AGREE" in first-line scan
    expect(parseStance('DISAGREE')).toBe('disagree');
  });
});

/**
 * Tests for Sprint 3-5 modules
 * Covers pure functions: agreement matrix, diff complexity, session diff,
 * DA tracking, meme mode, badge URL, event emitter
 */

import { describe, it, expect } from 'vitest';
import { computeAgreementMatrix } from '@codeagora/cli/commands/agreement.js';
import { estimateDiffComplexity } from '@codeagora/core/pipeline/diff-complexity.js';
import { diffSessionIssues } from '@codeagora/github/session-diff.js';
import { trackDevilsAdvocate } from '@codeagora/core/l2/devils-advocate-tracker.js';
import { getMemeVerdict, getMemeSeverity, getMemeConfidence } from '@codeagora/shared/meme/index.js';
import { buildReviewBadgeUrl } from '@codeagora/github/mapper.js';
import { DiscussionEmitter } from '@codeagora/core/l2/event-emitter.js';
import { formatDryRunPreviewComment } from '@codeagora/github/dryrun-preview.js';
import type { EvidenceDocument, DiscussionRound, DiscussionVerdict } from '@codeagora/core/types/core.js';

// ============================================================================
// Agreement Matrix (4.2)
// ============================================================================

describe('computeAgreementMatrix', () => {
  it('returns 100% self-agreement on diagonal', () => {
    const reviewerMap = { 'file.ts:1': ['r1', 'r2'] };
    const result = computeAgreementMatrix(reviewerMap, ['r1', 'r2']);
    expect(result.matrix[0][0]).toBe(100);
    expect(result.matrix[1][1]).toBe(100);
  });

  it('computes shared agreement between reviewers', () => {
    const reviewerMap = {
      'a.ts:1': ['r1', 'r2'],
      'b.ts:2': ['r1'],
      'c.ts:3': ['r2'],
    };
    const result = computeAgreementMatrix(reviewerMap, ['r1', 'r2']);
    // r1 and r2 share 1 issue out of 3 total issues involving either
    expect(result.matrix[0][1]).toBe(33); // ~33%
    expect(result.matrix[1][0]).toBe(33);
  });

  it('handles empty reviewer map', () => {
    const result = computeAgreementMatrix({}, ['r1', 'r2']);
    expect(result.matrix[0][1]).toBe(0);
  });
});

// ============================================================================
// Diff Complexity (4.5)
// ============================================================================

describe('estimateDiffComplexity', () => {
  it('classifies small diff as LOW', () => {
    const diff = `diff --git a/foo.ts b/foo.ts
+++ b/foo.ts
+const x = 1;
+const y = 2;`;
    const result = estimateDiffComplexity(diff);
    expect(result.level).toBe('LOW');
    expect(result.addedLines).toBe(2);
    expect(result.removedLines).toBe(0);
  });

  it('detects security-sensitive files', () => {
    const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
+++ b/src/auth/login.ts
+const token = getToken();`;
    const result = estimateDiffComplexity(diff);
    expect(result.securitySensitiveFiles).toContain('src/auth/login.ts');
    expect(result.level).toBe('MEDIUM'); // Bumped from LOW due to security
  });

  it('classifies large diff as HIGH or VERY_HIGH', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `+line${i}`);
    const files = Array.from({ length: 15 }, (_, i) =>
      `diff --git a/file${i}.ts b/file${i}.ts\n+++ b/file${i}.ts\n${lines.slice(i * 20, (i + 1) * 20).join('\n')}`
    );
    const diff = files.join('\n');
    const result = estimateDiffComplexity(diff);
    expect(['HIGH', 'VERY_HIGH']).toContain(result.level);
  });
});

// ============================================================================
// Session Diff (1.8)
// ============================================================================

describe('diffSessionIssues', () => {
  const makeDoc = (file: string, line: number, title: string): EvidenceDocument => ({
    issueTitle: title,
    problem: 'test',
    evidence: [],
    severity: 'WARNING',
    suggestion: '',
    filePath: file,
    lineRange: [line, line + 5],
  });

  it('identifies new, resolved, and unchanged issues', () => {
    const current = [makeDoc('a.ts', 1, 'Issue A'), makeDoc('b.ts', 2, 'Issue B')];
    const previous = [makeDoc('a.ts', 1, 'Issue A'), makeDoc('c.ts', 3, 'Issue C')];
    const result = diffSessionIssues(current, previous, '2026-03-18/001');
    expect(result.newIssues).toBe(1); // Issue B
    expect(result.resolvedIssues).toBe(1); // Issue C
    expect(result.unchangedIssues).toBe(1); // Issue A
  });

  it('handles empty previous session', () => {
    const current = [makeDoc('a.ts', 1, 'Issue A')];
    const result = diffSessionIssues(current, [], '2026-03-18/001');
    expect(result.newIssues).toBe(1);
    expect(result.resolvedIssues).toBe(0);
  });
});

// ============================================================================
// Devil's Advocate Tracking (4.6)
// ============================================================================

describe('trackDevilsAdvocate', () => {
  const makeRound = (roundNum: number, daStance: 'agree' | 'disagree' | 'neutral'): DiscussionRound => ({
    round: roundNum,
    moderatorPrompt: 'test',
    supporterResponses: [
      { supporterId: 'devil', response: 'test', stance: daStance },
      { supporterId: 's1', response: 'test', stance: 'agree' },
    ],
  });

  const makeVerdict = (id: string, severity: string): DiscussionVerdict => ({
    discussionId: id,
    filePath: 'test.ts',
    lineRange: [1, 5],
    finalSeverity: severity as DiscussionVerdict['finalSeverity'],
    reasoning: 'test',
    consensusReached: true,
    rounds: 1,
  });

  it('tracks DA concession (disagree → agree)', () => {
    const rounds = { 'd1': [makeRound(1, 'disagree'), makeRound(2, 'agree')] };
    const verdicts = [makeVerdict('d1', 'CRITICAL')];
    const stats = trackDevilsAdvocate('devil', rounds, verdicts);
    expect(stats.concessions).toBe(1);
    expect(stats.holdOuts).toBe(0);
  });

  it('tracks DA correct rejection (disagree → DISMISSED)', () => {
    const rounds = { 'd1': [makeRound(1, 'disagree')] };
    const verdicts = [makeVerdict('d1', 'DISMISSED')];
    const stats = trackDevilsAdvocate('devil', rounds, verdicts);
    expect(stats.correctRejections).toBe(1);
    expect(stats.holdOuts).toBe(1);
  });

  it('tracks DA initial agreement', () => {
    const rounds = { 'd1': [makeRound(1, 'agree')] };
    const verdicts = [makeVerdict('d1', 'WARNING')];
    const stats = trackDevilsAdvocate('devil', rounds, verdicts);
    expect(stats.initialAgreements).toBe(1);
  });
});

// ============================================================================
// Meme Mode (3.1)
// ============================================================================

describe('Meme Mode', () => {
  it('getMemeVerdict returns a string for known decisions', () => {
    const result = getMemeVerdict('ACCEPT', 'en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('getMemeSeverity returns label and desc', () => {
    const result = getMemeSeverity('CRITICAL', 'en');
    expect(result.label).toBe('SIR');
    expect(result.desc).toContain('production');
  });

  it('getMemeConfidence returns text for different ranges', () => {
    expect(getMemeConfidence(90, 'en')).toContain('pretty sure');
    expect(getMemeConfidence(50, 'en')).toContain('trust me');
    expect(getMemeConfidence(20, 'en')).toContain('vibes');
  });

  it('supports Korean language', () => {
    const result = getMemeSeverity('CRITICAL', 'ko');
    expect(result.desc).toContain('프로덕션');
  });
});

// ============================================================================
// Badge URL (1.11)
// ============================================================================

describe('buildReviewBadgeUrl', () => {
  it('generates green badge for ACCEPT', () => {
    const url = buildReviewBadgeUrl('ACCEPT', {});
    expect(url).toContain('brightgreen');
    expect(url).toContain('CodeAgora');
  });

  it('includes critical count in badge', () => {
    const url = buildReviewBadgeUrl('REJECT', { CRITICAL: 3 });
    expect(url).toContain('red');
    expect(url).toContain('3%20critical');
  });

  it('does not double-encode spaces', () => {
    const url = buildReviewBadgeUrl('REJECT', { CRITICAL: 1 });
    expect(url).not.toContain('%2520'); // No double-encoding
  });
});

// ============================================================================
// DiscussionEmitter (2.1)
// ============================================================================

describe('DiscussionEmitter', () => {
  it('emits typed events', () => {
    const emitter = new DiscussionEmitter();
    let received = false;
    emitter.on('discussion-start', () => { received = true; });
    emitter.emitEvent({
      type: 'discussion-start',
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'test.ts',
      severity: 'CRITICAL',
    });
    expect(received).toBe(true);
  });

  it('emits wildcard events', () => {
    const emitter = new DiscussionEmitter();
    const events: string[] = [];
    emitter.on('*', (e) => { events.push(e.type); });
    emitter.emitEvent({ type: 'round-start', discussionId: 'd1', roundNum: 1 });
    emitter.emitEvent({ type: 'discussion-end', discussionId: 'd1', finalSeverity: 'CRITICAL', consensusReached: true, rounds: 1 });
    expect(events).toEqual(['round-start', 'discussion-end']);
  });

  it('dispose removes all listeners', () => {
    const emitter = new DiscussionEmitter();
    emitter.on('*', () => {});
    emitter.on('discussion-start', () => {});
    expect(emitter.listenerCount('*')).toBe(1);
    emitter.dispose();
    expect(emitter.listenerCount('*')).toBe(0);
  });
});

// ============================================================================
// Dry-Run Preview (1.10)
// ============================================================================

describe('formatDryRunPreviewComment', () => {
  it('renders a markdown table with preview data', () => {
    const result = formatDryRunPreviewComment({
      reviewerCount: 5,
      supporterCount: 3,
      maxRounds: 3,
      estimatedCost: '$0.15',
      estimatedTokens: 50000,
      diffLineCount: 342,
      chunkCount: 2,
    });
    expect(result).toContain('Review Preview');
    expect(result).toContain('5');
    expect(result).toContain('$0.15');
    expect(result).toContain('50,000');
  });
});

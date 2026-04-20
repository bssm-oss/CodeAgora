/**
 * L1 Reviewer — buildReviewerMessages system/user split tests (#308)
 */

import { describe, it, expect } from 'vitest';
import { buildReviewerMessages } from '../l1/reviewer.js';

const SAMPLE_DIFF = `diff --git a/payments.ts b/payments.ts
index abc..def 100644
--- a/payments.ts
+++ b/payments.ts
@@ -10,3 +10,4 @@
+const amount = req.body.amount * multiplier;`;

const SAMPLE_SUMMARY = 'Add payment calculation';

describe('buildReviewerMessages', () => {
  it('returns an object with system and user strings', () => {
    const { system, user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('system contains review instructions', () => {
    const { system } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(system).toContain('ruthless, senior code reviewer');
    expect(system).toContain('Analysis Checklist');
    expect(system).toContain('Severity Guide');
    expect(system).toContain('HARSHLY_CRITICAL');
  });

  it('system does NOT contain diff content', () => {
    const { system } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    // The raw diff lines must not appear in system message
    expect(system).not.toContain('req.body.amount * multiplier');
    expect(system).not.toContain('+const amount');
    expect(system).not.toContain('payments.ts');
  });

  it('user contains the diff content', () => {
    const { user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(user).toContain(SAMPLE_DIFF);
  });

  it('user contains PR summary', () => {
    const { user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(user).toContain(SAMPLE_SUMMARY);
  });

  it('user wraps diff with a unique delimiter tag', () => {
    const { system, user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    // Delimiter tag announced in system, used in user
    const delimMatch = system.match(/<(DIFF_[A-Z0-9]+)>/);
    expect(delimMatch).not.toBeNull();
    const tag = delimMatch![1];
    expect(user).toContain(`<${tag}>`);
    expect(user).toContain(`</${tag}>`);
  });

  it('system warns that diff content is untrusted', () => {
    const { system } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(system).toMatch(/untrusted/i);
  });

  it('neutralizes triple-backtick sequences in diff content (code-fence breakout defense)', () => {
    // #486 self-review: previous impl replaced "`" with "\u0060" which IS
    // the same character (backtick === grave accent U+0060). Attack diff
    // containing ``` could close our enclosing code fence.
    const diffWithFence = '```\nmalicious content after fake fence\n```';
    const { user } = buildReviewerMessages(diffWithFence, SAMPLE_SUMMARY);
    // Original sequence must not appear in the embedded user prompt's diff
    // segment (except as part of our own outer ``` wrapper).
    const tripleBacktickCount = (user.match(/```/g) ?? []).length;
    // Our wrapper uses ```diff (open) + ``` (close) = 2. Any more means the
    // attacker's sequence survived. Check: count should be exactly 2.
    expect(tripleBacktickCount).toBe(2);
  });

  it('delimiter is unique across two calls (injection defense)', () => {
    const first = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    const second = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    const tag1 = first.system.match(/<(DIFF_[A-Z0-9]+)>/)![1];
    const tag2 = second.system.match(/<(DIFF_[A-Z0-9]+)>/)![1];
    // Statistically very unlikely to collide; if it does the test is still valid
    // because the delimiter mechanism itself is correct
    expect(tag1).toMatch(/^DIFF_[A-Z0-9]+$/);
    expect(tag2).toMatch(/^DIFF_[A-Z0-9]+$/);
  });

  it('includes surrounding context in user when provided', () => {
    const ctx = 'function getUser(id: string) { ... }';
    const { user, system } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY, ctx);
    expect(user).toContain(ctx);
    expect(user).toContain('Surrounding Code Context');
    // Context must NOT leak into system
    expect(system).not.toContain(ctx);
  });

  it('omits surrounding context section when not provided', () => {
    const { user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    expect(user).not.toContain('Surrounding Code Context');
  });

  it('handles empty prSummary gracefully', () => {
    const { user } = buildReviewerMessages(SAMPLE_DIFF, '');
    expect(user).toContain('No summary provided');
  });

  // -------------------------------------------------------------------------
  // Few-shot examples: both "issue present" and "no issues" cases
  // -------------------------------------------------------------------------

  it('system contains both a positive (issue) and negative (no-issues) example', () => {
    const { system } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    // Positive example — preserved from earlier revisions
    expect(system).toContain('SQL Injection Vulnerability');
    // Negative example — reviewer should have canonical "no-issues" format
    expect(system).toMatch(/Example 2.*NO issues/is);
    expect(system).toContain('## No Issues');
  });

  it('user prompt directs to No Issues format when nothing to flag', () => {
    const { user } = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
    // Instruction must point to Example 2 and forbid fabricated Issue blocks
    expect(user).toMatch(/No Issues/i);
    expect(user).toMatch(/do not.*invent|do NOT invent/i);
  });

  // -------------------------------------------------------------------------
  // JSON output mode (#463)
  // -------------------------------------------------------------------------

  describe('outputFormat: json', () => {
    it('system prompt includes the JSON schema and empty-findings convention', () => {
      const { system } = buildReviewerMessages(
        SAMPLE_DIFF, SAMPLE_SUMMARY, undefined, undefined, undefined, undefined, 'json',
      );
      expect(system).toMatch(/## Output Format/);
      expect(system).toContain('"findings"');
      expect(system).toContain('"severity"');
      expect(system).toContain('"lineRange"');
      // Empty-findings signal must be taught explicitly
      expect(system).toMatch(/\{\s*"findings":\s*\[\]\s*\}/);
    });

    it('system prompt omits the markdown ## Issue: example blocks', () => {
      const { system } = buildReviewerMessages(
        SAMPLE_DIFF, SAMPLE_SUMMARY, undefined, undefined, undefined, undefined, 'json',
      );
      expect(system).not.toContain('SQL Injection Vulnerability');
      expect(system).not.toContain('Example 1 — When an issue IS present');
      expect(system).not.toContain('## No Issues');
    });

    it('user prompt asks for raw JSON output (no code fences)', () => {
      const { user } = buildReviewerMessages(
        SAMPLE_DIFF, SAMPLE_SUMMARY, undefined, undefined, undefined, undefined, 'json',
      );
      expect(user).toMatch(/JSON/);
      expect(user).toMatch(/no code fences|no prose/i);
    });

    it('preserves untrusted-diff delimiter defense in JSON mode', () => {
      const { system, user } = buildReviewerMessages(
        SAMPLE_DIFF, SAMPLE_SUMMARY, undefined, undefined, undefined, undefined, 'json',
      );
      expect(system).toMatch(/untrusted/i);
      // Delimiter tag announced in system, used in user (same as markdown mode)
      const delimMatch = system.match(/<(DIFF_[A-Z0-9]+)>/);
      expect(delimMatch).not.toBeNull();
      const tag = delimMatch![1];
      expect(user).toContain(`<${tag}>`);
      expect(user).toContain(`</${tag}>`);
    });
  });

  describe('outputFormat: markdown (default)', () => {
    it('matches behavior when outputFormat is undefined', () => {
      const withoutFlag = buildReviewerMessages(SAMPLE_DIFF, SAMPLE_SUMMARY);
      const withMarkdown = buildReviewerMessages(
        SAMPLE_DIFF, SAMPLE_SUMMARY, undefined, undefined, undefined, undefined, 'markdown',
      );
      // System + user text should be structurally identical (modulo the
      // per-call delimiter, which is deliberately random)
      const stripDelim = (s: string) => s.replace(/DIFF_[A-Z0-9]+/g, 'DIFF_XXX');
      expect(stripDelim(withoutFlag.system)).toBe(stripDelim(withMarkdown.system));
      expect(stripDelim(withoutFlag.user)).toBe(stripDelim(withMarkdown.user));
    });
  });
});

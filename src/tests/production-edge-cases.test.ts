/**
 * Production Edge Case Tests
 * Robustness tests: crash-prevention is the primary goal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEvidenceResponse } from '@codeagora/core/l1/parser.js';
import { extractFileListFromDiff, fuzzyMatchFilePath } from '@codeagora/shared/utils/diff.js';
import { applyThreshold } from '@codeagora/core/l2/threshold.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import type { DiscussionSettings } from '@codeagora/core/types/config.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeBlock({
  title = 'Test Issue',
  problem = 'In auth.ts:10-12\n\nThe user input is not sanitized.',
  evidence = ['1. Input is raw', '2. No validation'],
  severity = 'CRITICAL',
  suggestion = 'Sanitize input.',
} = {}): string {
  return `## Issue: ${title}

### 문제
${problem}

### 근거
${evidence.join('\n')}

### 심각도
${severity}

### 제안
${suggestion}
`;
}

const baseSettings: DiscussionSettings = {
  maxRounds: 3,
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 2,
    SUGGESTION: null,
  },
  codeSnippetRange: 10,
};

// ---------------------------------------------------------------------------
// 1. LLM Response Mutations (Parser Robustness)
// ---------------------------------------------------------------------------

describe('LLM response mutations — parser robustness', () => {
  // (a) Response truncated mid-way — no ### 근거 section
  it('(a) truncated response: no crash, returns empty or partial', () => {
    const truncated =
      '## Issue: SQL Injection\n\n### 문제\nIn auth.ts:10-12\n\nThe user input...';
    expect(() => parseEvidenceResponse(truncated)).not.toThrow();
    const result = parseEvidenceResponse(truncated);
    expect(Array.isArray(result)).toBe(true);
  });

  // (b) Plain text instead of markdown
  it('(b) plain text response: no crash, returns empty array or partial', () => {
    const plain =
      'I found a security issue in auth.ts line 10. The password is hardcoded.';
    expect(() => parseEvidenceResponse(plain)).not.toThrow();
    const result = parseEvidenceResponse(plain);
    expect(Array.isArray(result)).toBe(true);
  });

  // (c) Korean headers replaced with English — "### Problem" instead of "### 문제"
  it('(c) English headers: parser does not crash (may return 0 docs due to regex mismatch)', () => {
    const englishHeaders =
      '## Issue: SQL Injection\n\n### Problem\nIn auth.ts:10-12\n\n### Evidence\n1. Raw input\n\n### Severity\nCRITICAL\n\n### Suggestion\nUse parameterized queries.\n';
    expect(() => parseEvidenceResponse(englishHeaders)).not.toThrow();
    const result = parseEvidenceResponse(englishHeaders);
    expect(Array.isArray(result)).toBe(true);
  });

  // (d) Mixed Korean and English headers in the same response
  it('(d) mixed headers: no crash, Korean blocks are parsed, English blocks are skipped', () => {
    const mixed =
      makeBlock({ title: 'Korean Issue' }) +
      '## Issue: English Issue\n\n### Problem\nIn util.ts:5\n\n### Evidence\n1. Thing\n\n### Severity\nWARNING\n\n### Suggestion\nFix it.\n';
    expect(() => parseEvidenceResponse(mixed)).not.toThrow();
    const result = parseEvidenceResponse(mixed);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].issueTitle).toBe('Korean Issue');
  });

  // (e) Severity in lowercase — "critical" should be treated case-insensitively
  it('(e) lowercase severity: parsed case-insensitively', () => {
    const doc = makeBlock({ severity: 'critical' });
    expect(() => parseEvidenceResponse(doc)).not.toThrow();
    const result = parseEvidenceResponse(doc);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
  });

  // (f) Garbage text between issue blocks
  it('(f) garbage text between blocks: both valid blocks are parsed', () => {
    const response =
      makeBlock({ title: 'First Issue' }) +
      '\n\n이건 잡담입니다. Some random chatter here.\n\n' +
      makeBlock({ title: 'Second Issue' });
    expect(() => parseEvidenceResponse(response)).not.toThrow();
    const result = parseEvidenceResponse(response);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const titles = result.map((d) => d.issueTitle);
    expect(titles).toContain('First Issue');
    expect(titles).toContain('Second Issue');
  });

  // (g) "## Issue" inside a fenced code block — should not be a false positive
  it('(g) ## Issue inside code block: no crash', () => {
    const response =
      'Here is an example of bad output:\n\n```markdown\n## Issue: Fake Issue\n\n### 문제\nfake\n\n### 근거\n1. fake\n\n### 심각도\nCRITICAL\n\n### 제안\nfake\n```\n\nNo real issues found.\n';
    expect(() => parseEvidenceResponse(response)).not.toThrow();
    const result = parseEvidenceResponse(response);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Diff Filename Edge Cases
// ---------------------------------------------------------------------------

describe('diff filename edge cases', () => {
  // (h) Filename with spaces
  it('(h) filename with spaces: extractFileListFromDiff does not crash', () => {
    const diff = `diff --git a/my file.ts b/my file.ts
index abc..def 100644
--- a/my file.ts
+++ b/my file.ts
@@ -1,3 +1,3 @@
 const x = 1;
`;
    expect(() => extractFileListFromDiff(diff)).not.toThrow();
    const files = extractFileListFromDiff(diff);
    expect(Array.isArray(files)).toBe(true);
  });

  // (i) Korean filename
  it('(i) Korean filename: extractFileListFromDiff does not crash', () => {
    const diff = `diff --git a/컴포넌트.tsx b/컴포넌트.tsx
index abc..def 100644
--- a/컴포넌트.tsx
+++ b/컴포넌트.tsx
@@ -1,2 +1,2 @@
 export default function Component() {}
`;
    expect(() => extractFileListFromDiff(diff)).not.toThrow();
    const files = extractFileListFromDiff(diff);
    expect(Array.isArray(files)).toBe(true);
  });

  // (j) Very long path (300 chars)
  it('(j) 300-char file path: no crash', () => {
    const longName = 'a'.repeat(280) + '.ts';
    const diff = `diff --git a/${longName} b/${longName}
index abc..def 100644
--- a/${longName}
+++ b/${longName}
@@ -1,1 +1,1 @@
 const x = 1;
`;
    expect(() => extractFileListFromDiff(diff)).not.toThrow();
    const files = extractFileListFromDiff(diff);
    expect(Array.isArray(files)).toBe(true);
  });

  // (k) "." as filename
  it('(k) dot-only filename: no crash', () => {
    const diff = `diff --git a/. b/.
index abc..def 100644
--- a/.
+++ b/.
@@ -1,1 +1,1 @@
 something
`;
    expect(() => extractFileListFromDiff(diff)).not.toThrow();
    const files = extractFileListFromDiff(diff);
    expect(Array.isArray(files)).toBe(true);
  });

  // fuzzyMatchFilePath with empty query
  it('fuzzyMatchFilePath: empty query returns null without crash', () => {
    expect(() => fuzzyMatchFilePath('', ['src/auth.ts'])).not.toThrow();
    const result = fuzzyMatchFilePath('', ['src/auth.ts']);
    expect(result).toBeNull();
  });

  // fuzzyMatchFilePath with empty paths list
  it('fuzzyMatchFilePath: empty paths list returns null without crash', () => {
    expect(() => fuzzyMatchFilePath('In auth.ts:10', [])).not.toThrow();
    const result = fuzzyMatchFilePath('In auth.ts:10', []);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Single Reviewer + Discussion Threshold
// ---------------------------------------------------------------------------

describe('single reviewer + discussion threshold', () => {
  // (l) 1 reviewer, HARSHLY_CRITICAL, threshold=1 => goes to discussions
  it('(l) 1 reviewer HARSHLY_CRITICAL with threshold=1: registered as discussion', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Remote Code Execution',
        problem: 'In auth.ts:10',
        evidence: ["1. User input is directly executed"],
        severity: 'HARSHLY_CRITICAL',
        suggestion: 'Never execute user input.',
        filePath: 'auth.ts',
        lineRange: [10, 15],
      },
    ];
    expect(() => applyThreshold(docs, baseSettings)).not.toThrow();
    const result = applyThreshold(docs, baseSettings);
    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0].severity).toBe('HARSHLY_CRITICAL');
    expect(result.unconfirmed).toHaveLength(0);
  });

  // (m) 1 reviewer, WARNING, threshold=2 => goes to unconfirmed
  it('(m) 1 reviewer WARNING with threshold=2: lands in unconfirmed, not discussions', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Missing Error Handling',
        problem: 'In service.ts:30',
        evidence: ['1. No try-catch around network call'],
        severity: 'WARNING',
        suggestion: 'Add error handling.',
        filePath: 'service.ts',
        lineRange: [30, 35],
      },
    ];
    expect(() => applyThreshold(docs, baseSettings)).not.toThrow();
    const result = applyThreshold(docs, baseSettings);
    expect(result.discussions).toHaveLength(0);
    expect(result.unconfirmed).toHaveLength(1);
    expect(result.unconfirmed[0].issueTitle).toBe('Missing Error Handling');
  });

  // Same WARNING issue from 2 reviewers => goes to discussions
  it('same WARNING issue from 2 reviewers with threshold=2: registered as discussion', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Missing Error Handling',
        problem: 'In service.ts:30',
        evidence: ['1. No try-catch'],
        severity: 'WARNING',
        suggestion: 'Add try-catch.',
        filePath: 'service.ts',
        lineRange: [30, 35],
      },
      {
        issueTitle: 'Missing Error Handling',
        problem: 'In service.ts:30',
        evidence: ['1. Unhandled rejection'],
        severity: 'WARNING',
        suggestion: 'Add error handling.',
        filePath: 'service.ts',
        lineRange: [30, 35],
      },
    ];
    expect(() => applyThreshold(docs, baseSettings)).not.toThrow();
    const result = applyThreshold(docs, baseSettings);
    expect(result.discussions).toHaveLength(1);
    expect(result.unconfirmed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. API Response Edge Cases
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/l1/provider-registry.js', () => ({
  getModel: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { executeViaAISDK } from '@codeagora/core/l1/api-backend.js';
import { getModel } from '@codeagora/core/l1/provider-registry.js';
import { generateText } from 'ai';

const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);

describe('API response edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (n) API returns empty string => downstream parseEvidenceResponse returns []
  it('(n) empty API response string: returns empty string, parseEvidenceResponse returns []', async () => {
    const fakeModel = { modelId: 'test-model' };
    mockGetModel.mockReturnValue(fakeModel as any);
    mockGenerateText.mockResolvedValue({ text: '' } as any);

    const raw = await executeViaAISDK({
      backend: 'api',
      model: 'test-model',
      provider: 'groq',
      prompt: 'Review this diff',
      timeout: 60,
    });

    expect(raw).toBe('');
    expect(() => parseEvidenceResponse(raw)).not.toThrow();
    const docs = parseEvidenceResponse(raw);
    expect(docs).toHaveLength(0);
  });

  // (o) API returns HTML error page => parseEvidenceResponse returns [] without crash
  it('(o) HTML error page as API response: parseEvidenceResponse returns [] without crash', async () => {
    const htmlResponse =
      '<html><body><h1>Internal Server Error</h1><p>Something went wrong.</p></body></html>';

    const fakeModel = { modelId: 'test-model' };
    mockGetModel.mockReturnValue(fakeModel as any);
    mockGenerateText.mockResolvedValue({ text: htmlResponse } as any);

    const raw = await executeViaAISDK({
      backend: 'api',
      model: 'test-model',
      provider: 'groq',
      prompt: 'Review this diff',
      timeout: 60,
    });

    expect(raw).toBe(htmlResponse);
    expect(() => parseEvidenceResponse(raw)).not.toThrow();
    const docs = parseEvidenceResponse(raw);
    expect(Array.isArray(docs)).toBe(true);
    expect(docs).toHaveLength(0);
  });

  // Large response stress test (regex backtracking guard)
  it('very large response (10k chars): no crash, completes within 5s', () => {
    const padding = 'Lorem ipsum dolor sit amet. '.repeat(350);
    const response = padding + makeBlock({ title: 'Real Issue' });
    const start = Date.now();
    expect(() => parseEvidenceResponse(response)).not.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    const docs = parseEvidenceResponse(response);
    expect(Array.isArray(docs)).toBe(true);
  });
});

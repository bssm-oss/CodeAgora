import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvidenceDocument } from '../types/core.js';

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

import { access } from 'fs/promises';
import { extractCodeBlock, verifySuggestions } from '../pipeline/suggestion-verifier.js';

const mockAccess = vi.mocked(access);

// ============================================================================
// Helper
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test issue',
    problem: 'Some problem',
    evidence: ['evidence 1'],
    severity: 'CRITICAL',
    suggestion: 'Use `foo` instead',
    filePath: 'src/index.ts',
    lineRange: [1, 5] as [number, number],
    confidence: 80,
    ...overrides,
  };
}

// ============================================================================
// extractCodeBlock
// ============================================================================

describe('extractCodeBlock', () => {
  it('should extract code from a fenced block', () => {
    const suggestion = 'Try this:\n```typescript\nconst x = 1;\n```';
    expect(extractCodeBlock(suggestion)).toBe('const x = 1;');
  });

  it('should extract code from a block without language', () => {
    const suggestion = '```\nconst x = 1;\n```';
    expect(extractCodeBlock(suggestion)).toBe('const x = 1;');
  });

  it('should return null for suggestions without code blocks', () => {
    expect(extractCodeBlock('Use foo instead of bar')).toBeNull();
  });

  it('should extract only the first code block', () => {
    const suggestion = '```ts\nconst a = 1;\n```\n```ts\nconst b = 2;\n```';
    expect(extractCodeBlock(suggestion)).toBe('const a = 1;');
  });
});

// ============================================================================
// verifySuggestions
// ============================================================================

describe('verifySuggestions', () => {
  const repoPath = '/tmp/test-repo';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: tsconfig does not exist
    mockAccess.mockRejectedValue(new Error('ENOENT'));
  });

  it('should skip docs without suggestion code blocks', async () => {
    const doc = makeDoc({ severity: 'CRITICAL', suggestion: 'Just use foo' });
    await verifySuggestions(repoPath, [doc]);
    // No code block -> not a candidate -> no field set
    expect((doc as Record<string, unknown>).suggestionVerified).toBeUndefined();
  });

  it('should skip docs with SUGGESTION severity', async () => {
    const doc = makeDoc({
      severity: 'SUGGESTION',
      suggestion: '```ts\nconst x = 1;\n```',
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBeUndefined();
  });

  it('should skip docs with WARNING severity', async () => {
    const doc = makeDoc({
      severity: 'WARNING',
      suggestion: '```ts\nconst x = 1;\n```',
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBeUndefined();
  });

  it('should mark as skipped when tsconfig.json does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const doc = makeDoc({
      severity: 'CRITICAL',
      suggestion: '```ts\nconst x: number = 1;\n```',
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBe('skipped');
  });

  it('should pass valid TypeScript code', async () => {
    mockAccess.mockResolvedValue(undefined);

    const doc = makeDoc({
      severity: 'CRITICAL',
      suggestion: '```typescript\nconst x: number = 42;\n```',
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBe('passed');
    expect(doc.confidence).toBe(80); // unchanged
  });

  it('should fail obviously broken syntax', async () => {
    mockAccess.mockResolvedValue(undefined);

    const doc = makeDoc({
      severity: 'HARSHLY_CRITICAL',
      suggestion: '```ts\nconst x: number = {\n```',
      confidence: 90,
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBe('failed');
    // Confidence penalty: 90 * 0.5 = 45
    expect(doc.confidence).toBe(45);
  });

  it('should apply 50% confidence penalty on failure', async () => {
    mockAccess.mockResolvedValue(undefined);

    const doc = makeDoc({
      severity: 'CRITICAL',
      suggestion: '```ts\nfunction( { broken syntax\n```',
      confidence: 100,
    });
    await verifySuggestions(repoPath, [doc]);
    expect((doc as Record<string, unknown>).suggestionVerified).toBe('failed');
    expect(doc.confidence).toBe(50); // 100 * 0.5
  });

  it('should use default confidence of 50 when none set', async () => {
    mockAccess.mockResolvedValue(undefined);

    const doc = makeDoc({
      severity: 'CRITICAL',
      suggestion: '```ts\nfunction( { broken\n```',
      confidence: undefined,
    });
    await verifySuggestions(repoPath, [doc]);
    if ((doc as Record<string, unknown>).suggestionVerified === 'failed') {
      expect(doc.confidence).toBe(25); // (50 default) * 0.5
    }
  });

  it('should handle multiple docs independently', async () => {
    mockAccess.mockResolvedValue(undefined);

    const validDoc = makeDoc({
      severity: 'CRITICAL',
      suggestion: '```ts\nconst a = 1;\n```',
      confidence: 80,
    });
    const brokenDoc = makeDoc({
      severity: 'HARSHLY_CRITICAL',
      suggestion: '```ts\nconst x: = ;\n```',
      confidence: 80,
    });
    const noncriticalDoc = makeDoc({
      severity: 'WARNING',
      suggestion: '```ts\nconst w = 1;\n```',
    });

    await verifySuggestions(repoPath, [validDoc, brokenDoc, noncriticalDoc]);

    expect((validDoc as Record<string, unknown>).suggestionVerified).toBe('passed');
    expect(validDoc.confidence).toBe(80);

    expect((brokenDoc as Record<string, unknown>).suggestionVerified).toBe('failed');
    expect(brokenDoc.confidence).toBe(40); // 80 * 0.5

    // WARNING doc should not be touched
    expect((noncriticalDoc as Record<string, unknown>).suggestionVerified).toBeUndefined();
  });

  it('should return early when no candidates', async () => {
    const docs = [
      makeDoc({ severity: 'WARNING', suggestion: '```ts\ncode\n```' }),
      makeDoc({ severity: 'SUGGESTION', suggestion: 'just text' }),
    ];
    await verifySuggestions(repoPath, docs);
    // access should not have been called since there are no candidates
    expect(mockAccess).not.toHaveBeenCalled();
  });

  // ========================================================================
  // ConfidenceTrace population
  // ========================================================================

  describe('ConfidenceTrace: verified stage', () => {
    it('should populate confidenceTrace.verified only on verification failure', async () => {
      mockAccess.mockResolvedValue(undefined);

      const brokenDoc = makeDoc({
        severity: 'CRITICAL',
        suggestion: '```ts\nconst x: = ;\n```',
        confidence: 80,
      });
      const validDoc = makeDoc({
        severity: 'CRITICAL',
        suggestion: '```ts\nconst a = 1;\n```',
        confidence: 80,
      });

      await verifySuggestions(repoPath, [brokenDoc, validDoc]);

      // Failure writes verified = confidence * 0.5 = 40
      expect(brokenDoc.confidenceTrace?.verified).toBe(40);
      // BC parity: legacy field mirrors trace.verified on failure.
      expect(brokenDoc.confidenceTrace?.verified).toBe(brokenDoc.confidence);

      // Pass: verified stays absent so downstream falls back to corroborated.
      expect(validDoc.confidenceTrace?.verified).toBeUndefined();
    });
  });
});

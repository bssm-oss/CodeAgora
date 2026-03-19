/**
 * Slice 5 Tests - Edge Cases
 */

import { describe, it, expect } from 'vitest';
import { extractCodeSnippet } from '@codeagora/shared/utils/diff.js';
import { findDuplicates, mergeDiscussions, deduplicateDiscussions } from '@codeagora/core/l2/deduplication.js';
import { checkForObjections } from '@codeagora/core/l2/objection.js';
import { retryWithBackoff, isRetryableError } from '@codeagora/shared/utils/recovery.js';
import { CircuitBreaker } from '@codeagora/core/l1/circuit-breaker.js';
import type { Discussion } from '@codeagora/core/types/core.js';

describe('Code Snippet Extraction', () => {
  const sampleDiff = `diff --git a/auth.ts b/auth.ts
index 123..456 789
--- a/auth.ts
+++ b/auth.ts
@@ -10,5 +10,5 @@
 function login(username) {
-  const query = "SELECT * FROM users WHERE username = '" + username + "'";
+  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
   return db.query(query);
 }
`;

  it('should extract code snippet with context', () => {
    const snippet = extractCodeSnippet(sampleDiff, 'auth.ts', [11, 11], 2);

    expect(snippet).toBeDefined();
    expect(snippet!.filePath).toBe('auth.ts');
    expect(snippet!.code).toContain('function login');
    expect(snippet!.code).toContain('SELECT * FROM users');
  });

  it('should return null for non-existent file', () => {
    const snippet = extractCodeSnippet(sampleDiff, 'nonexistent.ts', [1, 1], 2);
    expect(snippet).toBeNull();
  });
});

describe('Discussion Deduplication', () => {
  it('should find duplicate discussions', () => {
    const discussions: Discussion[] = [
      {
        id: 'd001',
        severity: 'CRITICAL',
        issueTitle: 'SQL Injection',
        filePath: 'auth.ts',
        lineRange: [10, 15],
        codeSnippet: '',
        evidenceDocs: ['e1.md'],
        status: 'pending',
      },
      {
        id: 'd002',
        severity: 'CRITICAL',
        issueTitle: 'SQL Injection Risk',
        filePath: 'auth.ts',
        lineRange: [12, 14],
        codeSnippet: '',
        evidenceDocs: ['e2.md'],
        status: 'pending',
      },
    ];

    const duplicates = findDuplicates(discussions);

    expect(duplicates.size).toBeGreaterThan(0);
    expect(duplicates.get('d001')).toContain('d002');
  });

  it('should merge duplicate discussions', () => {
    const primary: Discussion = {
      id: 'd001',
      severity: 'WARNING',
      issueTitle: 'Issue A',
      filePath: 'file.ts',
      lineRange: [10, 15],
      codeSnippet: '',
      evidenceDocs: ['e1.md'],
      status: 'pending',
    };

    const duplicate: Discussion = {
      id: 'd002',
      severity: 'CRITICAL',
      issueTitle: 'Issue A',
      filePath: 'file.ts',
      lineRange: [12, 18],
      codeSnippet: '',
      evidenceDocs: ['e2.md'],
      status: 'pending',
    };

    const merged = mergeDiscussions(primary, [duplicate]);

    expect(merged.severity).toBe('CRITICAL'); // Higher severity wins
    expect(merged.lineRange).toEqual([10, 18]); // Expanded range
    expect(merged.evidenceDocs).toHaveLength(2);
  });

  it('should deduplicate discussion list', () => {
    const discussions: Discussion[] = [
      {
        id: 'd001',
        severity: 'CRITICAL',
        issueTitle: 'SQL Injection',
        filePath: 'auth.ts',
        lineRange: [10, 15],
        codeSnippet: '',
        evidenceDocs: [],
        status: 'pending',
      },
      {
        id: 'd002',
        severity: 'CRITICAL',
        issueTitle: 'SQL Injection',
        filePath: 'auth.ts',
        lineRange: [11, 14],
        codeSnippet: '',
        evidenceDocs: [],
        status: 'pending',
      },
      {
        id: 'd003',
        severity: 'WARNING',
        issueTitle: 'Different Issue',
        filePath: 'other.ts',
        lineRange: [20, 25],
        codeSnippet: '',
        evidenceDocs: [],
        status: 'pending',
      },
    ];

    const result = deduplicateDiscussions(discussions);

    expect(result.deduplicated.length).toBe(2); // d001+d002 merged, d003 separate
    expect(result.mergedCount).toBe(1);
  });
});

describe('Error Recovery', () => {
  it('should retry on retryable errors', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('ETIMEDOUT');
      }
      return 'success';
    };

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should identify retryable errors', () => {
    expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(new Error('Invalid input'))).toBe(false);
  });

  it('should open circuit after threshold', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
    const provider = 'test-provider';
    const model = 'test-model';

    // First failure
    breaker.recordFailure(provider, model);
    expect(breaker.getState(provider, model)).toBe('closed');

    // Second failure - opens circuit
    breaker.recordFailure(provider, model);
    expect(breaker.getState(provider, model)).toBe('open');

    // Circuit is open
    expect(breaker.isOpen(provider, model)).toBe(true);
  });
});

/**
 * L1 Reviewer Tests
 */

import { describe, it, expect } from 'vitest';
import { parseEvidenceResponse } from '@codeagora/core/l1/parser.js';
import { checkForfeitThreshold } from '@codeagora/core/l1/reviewer.js';
import type { ReviewOutput } from '@codeagora/core/types/core.js';

describe('L1 Evidence Parser', () => {
  it('should parse valid evidence document', () => {
    const response = `
## Issue: SQL Injection Vulnerability

### 문제
In auth.ts:45-50, user input is directly concatenated into SQL query without sanitization.

### 근거
1. User input from req.body.username is not validated
2. String concatenation is used instead of parameterized query
3. This allows SQL injection attacks like "admin' OR '1'='1"

### 심각도
CRITICAL

### 제안
Use parameterized queries with prepared statements: db.query('SELECT * FROM users WHERE username = ?', [username])
    `;

    const docs = parseEvidenceResponse(response);

    expect(docs).toHaveLength(1);
    expect(docs[0].issueTitle).toBe('SQL Injection Vulnerability');
    expect(docs[0].severity).toBe('CRITICAL');
    expect(docs[0].evidence).toHaveLength(3);
    expect(docs[0].filePath).toBe('auth.ts');
    expect(docs[0].lineRange).toEqual([45, 50]);
  });

  it('should handle multiple evidence documents', () => {
    const response = `
## Issue: First Issue

### 문제
Problem 1 in file.ts:10

### 근거
1. Evidence 1

### 심각도
WARNING

### 제안
Fix it

## Issue: Second Issue

### 문제
Problem 2 in file.ts:20

### 근거
1. Evidence 2

### 심각도
SUGGESTION

### 제안
Improve it
    `;

    const docs = parseEvidenceResponse(response);

    expect(docs).toHaveLength(2);
    expect(docs[0].issueTitle).toBe('First Issue');
    expect(docs[1].issueTitle).toBe('Second Issue');
  });

  it('should handle "no issues found" response', () => {
    const response = 'No issues found';
    const docs = parseEvidenceResponse(response);
    expect(docs).toHaveLength(0);
  });
});

describe('L1 Forfeit Threshold', () => {
  it('should pass when forfeit rate is below threshold', () => {
    const results: ReviewOutput[] = [
      { reviewerId: 'r1', model: 'm1', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'success' },
      { reviewerId: 'r2', model: 'm2', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'success' },
      { reviewerId: 'r3', model: 'm3', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'forfeit' },
    ];

    const result = checkForfeitThreshold(results, 0.7);

    expect(result.passed).toBe(true);
    expect(result.forfeitRate).toBeCloseTo(0.33);
  });

  it('should fail when forfeit rate exceeds threshold', () => {
    const results: ReviewOutput[] = [
      { reviewerId: 'r1', model: 'm1', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'forfeit' },
      { reviewerId: 'r2', model: 'm2', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'forfeit' },
      { reviewerId: 'r3', model: 'm3', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'forfeit' },
      { reviewerId: 'r4', model: 'm4', group: 'g1', evidenceDocs: [], rawResponse: '', status: 'success' },
    ];

    const result = checkForfeitThreshold(results, 0.7);

    expect(result.passed).toBe(false);
    expect(result.forfeitRate).toBe(0.75);
  });
});

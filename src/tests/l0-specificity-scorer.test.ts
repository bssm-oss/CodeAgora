import { describe, it, expect } from 'vitest';
import { scoreSpecificity, scoreReviewerSpecificity } from '@codeagora/core/l0/specificity-scorer.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'A problem description that is long enough to pass rationale check easily.',
    evidence: ['Evidence point 1', 'Evidence point 2'],
    severity: 'WARNING',
    suggestion: 'Fix the issue by replacing the code.',
    filePath: 'src/auth.ts',
    lineRange: [10, 15] as [number, number],
    ...overrides,
  };
}

describe('scoreSpecificity', () => {
  it('should give +0.2 for line reference in evidence', () => {
    const doc = makeDoc({
      problem: 'In line 42, the variable is unused.',
      evidence: ['line 42 shows unused code'],
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasLineRef).toBe(0.2);
  });

  it('should give 0 for no line reference', () => {
    const doc = makeDoc({
      problem: 'The function is incorrect.',
      evidence: ['No specific location mentioned'],
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasLineRef).toBe(0);
  });

  it('should give +0.2 for code token in evidence', () => {
    const doc = makeDoc({
      problem: 'The `getUserName` function is broken.',
      evidence: ['`getUserName` returns null'],
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasCodeToken).toBe(0.2);
  });

  it('should give +0.2 for action verb in suggestion', () => {
    const doc = makeDoc({
      suggestion: 'Replace the string concatenation with template literals.',
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasActionVerb).toBe(0.2);
  });

  it('should give 0 for no action verb in suggestion', () => {
    const doc = makeDoc({
      suggestion: 'This is bad code.',
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasActionVerb).toBe(0);
  });

  it('should give word count score proportional to text length', () => {
    const shortDoc = makeDoc({
      problem: 'Bad.',
      evidence: ['Short'],
    });
    const longDoc = makeDoc({
      problem: 'The authentication handler fails to validate the JWT token expiry before granting access to protected resources, which allows expired tokens to be used.',
      evidence: [
        'The verifyToken function at line 45 does not check the exp claim',
        'RFC 7519 requires exp validation for security',
        'Integration tests show expired tokens pass validation',
      ],
    });

    const shortResult = scoreSpecificity(shortDoc);
    const longResult = scoreSpecificity(longDoc);

    expect(longResult.breakdown.wordCount).toBeGreaterThan(
      shortResult.breakdown.wordCount
    );
  });

  it('should give +0.2 for severity rationale (2+ evidence, long problem)', () => {
    const doc = makeDoc({
      problem: 'A substantial problem description with enough detail to justify severity.',
      evidence: ['Evidence 1', 'Evidence 2'],
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasSeverityRationale).toBe(0.2);
  });

  it('should give 0 for weak rationale (1 evidence or short problem)', () => {
    const doc = makeDoc({
      problem: 'Short.',
      evidence: ['Only one point'],
    });
    const result = scoreSpecificity(doc);
    expect(result.breakdown.hasSeverityRationale).toBe(0);
  });

  it('should return 1.0 for fully specified evidence', () => {
    const doc = makeDoc({
      problem: 'In line 42, the `processPayment` function does not validate the amount parameter before sending it to the payment gateway, which could result in negative charges.',
      evidence: [
        'line 42: amount parameter is passed directly without validation',
        '`processPayment` calls `gateway.charge(amount)` without bounds checking',
        'Negative amounts would result in refunds being issued',
      ],
      suggestion: 'Add validation to check that amount is positive before processing.',
    });
    const result = scoreSpecificity(doc);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it('should return 0 for empty evidence', () => {
    const doc = makeDoc({
      problem: '',
      evidence: [],
      suggestion: '',
    });
    const result = scoreSpecificity(doc);
    expect(result.score).toBe(0);
  });
});

describe('scoreReviewerSpecificity', () => {
  it('should return 0 for empty docs array', () => {
    expect(scoreReviewerSpecificity([])).toBe(0);
  });

  it('should average scores across multiple docs', () => {
    const goodDoc = makeDoc({
      problem: 'In line 10, the `fetchData` function is broken.',
      evidence: ['line 10 error', 'Evidence 2'],
      suggestion: 'Replace with correct implementation.',
    });
    const badDoc = makeDoc({
      problem: '',
      evidence: [],
      suggestion: '',
    });

    const avgScore = scoreReviewerSpecificity([goodDoc, badDoc]);
    const goodScore = scoreSpecificity(goodDoc).score;

    expect(avgScore).toBeCloseTo(goodScore / 2, 1);
  });
});

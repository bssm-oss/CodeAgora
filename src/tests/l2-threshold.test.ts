/**
 * L2 Threshold Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyThreshold } from '@codeagora/core/l2/threshold.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import type { DiscussionSettings } from '@codeagora/core/types/config.js';

describe('L2 Threshold Logic', () => {
  const settings: DiscussionSettings = {
    maxRounds: 3,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  };

  it('should register HARSHLY_CRITICAL with 1 reviewer', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Security Vulnerability',
        problem: 'In auth.ts:10',
        evidence: ['Evidence 1'],
        severity: 'HARSHLY_CRITICAL',
        suggestion: 'Fix it',
        filePath: 'auth.ts',
        lineRange: [10, 15],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0].severity).toBe('HARSHLY_CRITICAL');
    expect(result.unconfirmed).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('should register CRITICAL with 1 reviewer', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Bug',
        problem: 'In file.ts:20',
        evidence: ['Evidence 1'],
        severity: 'CRITICAL',
        suggestion: 'Fix',
        filePath: 'file.ts',
        lineRange: [20, 25],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0].severity).toBe('CRITICAL');
  });

  it('should require 2 reviewers for WARNING', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Code Quality',
        problem: 'In file.ts:30',
        evidence: ['Evidence 1'],
        severity: 'WARNING',
        suggestion: 'Improve',
        filePath: 'file.ts',
        lineRange: [30, 35],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.discussions).toHaveLength(0);
    expect(result.unconfirmed).toHaveLength(1);
  });

  it('should register WARNING with 2+ reviewers', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Code Quality',
        problem: 'In file.ts:30',
        evidence: ['Evidence 1'],
        severity: 'WARNING',
        suggestion: 'Improve',
        filePath: 'file.ts',
        lineRange: [30, 35],
      },
      {
        issueTitle: 'Code Quality',
        problem: 'In file.ts:30',
        evidence: ['Evidence 2'],
        severity: 'WARNING',
        suggestion: 'Improve',
        filePath: 'file.ts',
        lineRange: [30, 35],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.discussions).toHaveLength(1);
    expect(result.unconfirmed).toHaveLength(0);
  });

  it('should collect SUGGESTION separately', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Style',
        problem: 'In file.ts:40',
        evidence: ['Evidence 1'],
        severity: 'SUGGESTION',
        suggestion: 'Consider',
        filePath: 'file.ts',
        lineRange: [40, 45],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.discussions).toHaveLength(0);
    expect(result.unconfirmed).toHaveLength(0);
    expect(result.suggestions).toHaveLength(1);
  });

  // TC-4: HARSHLY_CRITICAL with threshold=0 never registers (falsy check)
  it('should not register HARSHLY_CRITICAL when threshold is 0', () => {
    const settingsZeroHC: DiscussionSettings = {
      ...settings,
      registrationThreshold: {
        ...settings.registrationThreshold,
        HARSHLY_CRITICAL: 0,
      },
    };

    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Critical Security Issue',
        problem: 'In auth.ts:5',
        evidence: ['Evidence 1'],
        severity: 'HARSHLY_CRITICAL',
        suggestion: 'Fix immediately',
        filePath: 'auth.ts',
        lineRange: [5, 5],
      },
    ];

    const result = applyThreshold(docs, settingsZeroHC);

    // threshold=0 means it never registers as HARSHLY_CRITICAL discussion
    expect(result.discussions).toHaveLength(0);
  });

  // TC-4: SUGGESTION is always null in schema — always routes to suggestions array
  it('should place SUGGESTION in suggestions array (SUGGESTION threshold is always null)', () => {
    const docs: EvidenceDocument[] = [
      {
        issueTitle: 'Minor nit',
        problem: 'In util.ts:1',
        evidence: ['e1'],
        severity: 'SUGGESTION',
        suggestion: 'Rename variable',
        filePath: 'util.ts',
        lineRange: [1, 1],
      },
    ];

    const result = applyThreshold(docs, settings);

    expect(result.suggestions).toHaveLength(1);
    expect(result.discussions).toHaveLength(0);
    expect(result.unconfirmed).toHaveLength(0);
  });

  // TC-4: Empty docs → all empty results
  it('should return empty results for empty input', () => {
    const result = applyThreshold([], settings);

    expect(result.discussions).toHaveLength(0);
    expect(result.unconfirmed).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });
});

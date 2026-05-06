/**
 * L2 Threshold — applyThreshold, null threshold handling
 */

import { describe, it, expect } from 'vitest';
import { applyThreshold } from '../l2/threshold.js';
import type { EvidenceDocument } from '../types/core.js';
import type { DiscussionSettings } from '../types/config.js';

// ============================================================================
// Helpers
// ============================================================================

const defaultSettings: DiscussionSettings = {
  enabled: true,
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 2,
    SUGGESTION: null,
  },
  maxRounds: 3,
  codeSnippetRange: 10,
  objectionTimeout: 60,
  maxObjectionRounds: 1,
};

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'test issue',
    problem: 'a problem',
    evidence: ['line 1'],
    severity: 'WARNING',
    suggestion: 'fix it',
    filePath: 'src/foo.ts',
    lineRange: [10, 20],
    ...overrides,
  };
}

// ============================================================================
// SUGGESTION severity
// ============================================================================

describe('applyThreshold — SUGGESTION severity', () => {
  it('never registers a SUGGESTION as a Discussion', () => {
    const doc = makeDoc({ severity: 'SUGGESTION' });
    const { discussions, suggestions } = applyThreshold([doc], defaultSettings);
    expect(discussions).toHaveLength(0);
    expect(suggestions).toHaveLength(1);
  });

  it('places SUGGESTION in suggestions even when threshold is null', () => {
    const settings: DiscussionSettings = {
      ...defaultSettings,
      registrationThreshold: { ...defaultSettings.registrationThreshold, SUGGESTION: null },
    };
    const doc = makeDoc({ severity: 'SUGGESTION' });
    const { discussions, suggestions } = applyThreshold([doc], settings);
    expect(discussions).toHaveLength(0);
    expect(suggestions).toHaveLength(1);
  });
});

// ============================================================================
// HARSHLY_CRITICAL severity
// ============================================================================

describe('applyThreshold — HARSHLY_CRITICAL severity', () => {
  it('registers immediately with a single reviewer when threshold is 1', () => {
    const doc = makeDoc({ severity: 'HARSHLY_CRITICAL' });
    const { discussions } = applyThreshold([doc], defaultSettings);
    expect(discussions).toHaveLength(1);
    expect(discussions[0].severity).toBe('HARSHLY_CRITICAL');
  });

  it('does NOT register when threshold is 0 (disabled)', () => {
    // The runtime guard treats threshold === 0 the same as disabled
    const settings: DiscussionSettings = {
      ...defaultSettings,
      registrationThreshold: { ...defaultSettings.registrationThreshold, HARSHLY_CRITICAL: 0 },
    };
    const doc = makeDoc({ severity: 'HARSHLY_CRITICAL' });
    const { discussions } = applyThreshold([doc], settings);
    expect(discussions).toHaveLength(0);
  });
});

// ============================================================================
// CRITICAL severity
// ============================================================================

describe('applyThreshold — CRITICAL severity', () => {
  it('registers CRITICAL with threshold=1 and one reviewer', () => {
    const doc = makeDoc({ severity: 'CRITICAL' });
    const { discussions } = applyThreshold([doc], defaultSettings);
    expect(discussions).toHaveLength(1);
    expect(discussions[0].severity).toBe('CRITICAL');
  });

  it('single CRITICAL reviewer goes to unconfirmed when threshold is 2', () => {
    const settings: DiscussionSettings = {
      ...defaultSettings,
      registrationThreshold: { ...defaultSettings.registrationThreshold, CRITICAL: 2 },
    };
    const doc = makeDoc({ severity: 'CRITICAL' });
    const { discussions, unconfirmed } = applyThreshold([doc], settings);
    expect(discussions).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });
});

// ============================================================================
// WARNING severity
// ============================================================================

describe('applyThreshold — WARNING severity', () => {
  it('does NOT register WARNING with a single reviewer (threshold=2)', () => {
    const doc = makeDoc({ severity: 'WARNING' });
    const { discussions, unconfirmed } = applyThreshold([doc], defaultSettings);
    expect(discussions).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it('registers WARNING with two reviewers on the same location', () => {
    const doc1 = makeDoc({ severity: 'WARNING', filePath: 'src/a.ts', lineRange: [1, 5], reviewerId: 'r1' });
    const doc2 = makeDoc({ severity: 'WARNING', filePath: 'src/a.ts', lineRange: [1, 5], reviewerId: 'r2' });
    const { discussions } = applyThreshold([doc1, doc2], defaultSettings);
    expect(discussions).toHaveLength(1);
    expect(discussions[0].severity).toBe('WARNING');
  });

  it('does not register WARNING when duplicate findings come from the same reviewer', () => {
    const doc1 = makeDoc({ severity: 'WARNING', filePath: 'src/a.ts', lineRange: [1, 5], reviewerId: 'r1' });
    const doc2 = makeDoc({ severity: 'WARNING', filePath: 'src/a.ts', lineRange: [2, 6], reviewerId: 'r1' });
    const { discussions, unconfirmed } = applyThreshold([doc1, doc2], defaultSettings);
    expect(discussions).toHaveLength(0);
    expect(unconfirmed).toHaveLength(2);
  });

  it('assigns sequential Discussion IDs starting from d001', () => {
    const doc1 = makeDoc({ severity: 'CRITICAL', filePath: 'src/a.ts', lineRange: [1, 5] });
    const doc2 = makeDoc({ severity: 'CRITICAL', filePath: 'src/b.ts', lineRange: [1, 5] });
    const { discussions } = applyThreshold([doc1, doc2], defaultSettings);
    expect(discussions[0].id).toBe('d001');
    expect(discussions[1].id).toBe('d002');
  });
});

// ============================================================================
// Mixed batch
// ============================================================================

describe('applyThreshold — mixed severities', () => {
  it('correctly partitions docs into discussions, unconfirmed, and suggestions', () => {
    const docs = [
      makeDoc({ severity: 'HARSHLY_CRITICAL', filePath: 'src/a.ts', lineRange: [1, 5] }),
      makeDoc({ severity: 'WARNING', filePath: 'src/b.ts', lineRange: [1, 5] }),
      makeDoc({ severity: 'SUGGESTION', filePath: 'src/c.ts', lineRange: [1, 5] }),
    ];
    const { discussions, unconfirmed, suggestions } = applyThreshold(docs, defaultSettings);
    expect(discussions).toHaveLength(1); // HARSHLY_CRITICAL
    expect(unconfirmed).toHaveLength(1); // single WARNING
    expect(suggestions).toHaveLength(1); // SUGGESTION
  });
});

import { describe, it, expect } from 'vitest';
import type { EvidenceDocument } from '../types/evidence.js';
import {
  evidenceToActualFinding,
  evidenceListToActualFindings,
} from '../utils/golden-bug-mapping.js';

function doc(over: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'title',
    problem: 'problem',
    evidence: ['foo'],
    severity: 'CRITICAL',
    suggestion: 's',
    filePath: 'src/a.ts',
    lineRange: [10, 10],
    ...over,
  };
}

describe('evidenceToActualFinding', () => {
  it('prefers confidenceTrace.final', () => {
    const result = evidenceToActualFinding(
      doc({
        confidence: 50,
        confidenceTrace: { raw: 80, filtered: 80, corroborated: 95, verified: 95, final: 95 },
      }),
    );
    expect(result.confidence).toBe(95);
  });

  it('falls back to doc.confidence when trace absent', () => {
    const result = evidenceToActualFinding(doc({ confidence: 42 }));
    expect(result.confidence).toBe(42);
  });

  it('omits confidence when neither trace nor doc.confidence is set', () => {
    const result = evidenceToActualFinding(doc());
    expect(result.confidence).toBeUndefined();
    expect('confidence' in result).toBe(false);
  });

  it('carries filePath, lineRange, severity verbatim', () => {
    const result = evidenceToActualFinding(
      doc({
        filePath: 'pkg/x.ts',
        lineRange: [5, 9],
        severity: 'HARSHLY_CRITICAL',
      }),
    );
    expect(result.filePath).toBe('pkg/x.ts');
    expect(result.lineRange).toEqual([5, 9]);
    expect(result.severity).toBe('HARSHLY_CRITICAL');
  });

  it('does not include evidence[] or suggestion (scorer does not need them)', () => {
    const result = evidenceToActualFinding(doc());
    expect('evidence' in result).toBe(false);
    expect('suggestion' in result).toBe(false);
  });
});

describe('evidenceListToActualFindings', () => {
  it('maps every entry preserving order', () => {
    const input = [
      doc({ issueTitle: 'A', filePath: 'a.ts' }),
      doc({ issueTitle: 'B', filePath: 'b.ts' }),
    ];
    const result = evidenceListToActualFindings(input);
    expect(result.map((r) => r.issueTitle)).toEqual(['A', 'B']);
    expect(result.map((r) => r.filePath)).toEqual(['a.ts', 'b.ts']);
  });

  it('returns empty array for empty input', () => {
    expect(evidenceListToActualFindings([])).toEqual([]);
  });
});

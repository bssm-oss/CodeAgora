/**
 * Witness-based echo dampener tests (#468 follow-up).
 *
 * Separate from the existing parser-bilingual corroboration tests so
 * the file stays focused on the new semantic. Scenarios build on
 * computeL1Confidence — each case pins down when the ×0.75 dampener
 * should and shouldn't fire.
 */

import { describe, it, expect } from 'vitest';
import type { EvidenceDocument, Severity } from '../types/core.js';
import { computeL1Confidence } from '../pipeline/confidence.js';

interface DocInput {
  line?: number;
  file?: string;
  confidence?: number;
  severity?: Severity;
  evidence?: string[];
  problem?: string;
}

function makeDoc(o: DocInput = {}): EvidenceDocument {
  return {
    issueTitle: 'T',
    problem: o.problem ?? 'generic problem',
    evidence: o.evidence ?? [],
    severity: o.severity ?? 'WARNING',
    suggestion: 's',
    filePath: o.file ?? 'src/foo.ts',
    lineRange: [o.line ?? 10, (o.line ?? 10) + 10],
    ...(o.confidence !== undefined && { confidence: o.confidence }),
  };
}

describe('witness-based echo dampener', () => {
  it('3 identical evidence strings → dampener fires, ×0.75 applied', () => {
    const echoed = ['line 10 looks suspicious because the regex may backtrack'];
    const doc = makeDoc({ confidence: 80, evidence: echoed });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: echoed }),
      makeDoc({ confidence: 80, evidence: echoed }),
      makeDoc({ confidence: 80, evidence: echoed }),
    ];
    // agreeing=3, activeReviewers=3 → normal boost path (×1.2 on blend)
    // blend = round(80*0.6 + 100*0.4) = 88
    // boost = min(100, round(88 * 1.2)) = 100 (capped)
    // echo dampener = round(100 * 0.75) = 75
    const result = computeL1Confidence(doc, allDocs, 3);
    expect(result).toBe(75);
  });

  it('3 distinct evidence strings → dampener stays off', () => {
    const doc = makeDoc({
      confidence: 80,
      evidence: ['line 10 reads the buffer without bounds check'],
    });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: ['line 10 reads the buffer without bounds check'] }),
      makeDoc({ confidence: 80, evidence: ['the caller in src/parse.ts:42 passes untrusted input'] }),
      makeDoc({ confidence: 80, evidence: ['adjacent unit test at line 55 covers only short inputs'] }),
    ];
    // Each reviewer has distinct evidence → 3 distinct fingerprints → no dampener
    // Full boost path applies.
    const result = computeL1Confidence(doc, allDocs, 3);
    expect(result).toBe(100);
  });

  it('2 identical evidence + 1 distinct → dampener stays off (need 3+ with evidence)', () => {
    const echo = ['same concern phrased the same way'];
    const doc = makeDoc({ confidence: 80, evidence: echo });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: echo }),
      makeDoc({ confidence: 80, evidence: echo }),
      makeDoc({ confidence: 80, evidence: ['a totally different angle on the same bug'] }),
    ];
    // withEvidence.length = 3, fingerprints = [echo, echo, distinct], distinctCount = 2.
    // Math.floor(3/2) = 1. 2 > 1 → dampener does NOT fire.
    const result = computeL1Confidence(doc, allDocs, 3);
    expect(result).toBe(100);
  });

  it('3 identical but fingerprints trimmed to first 80 chars — long identical prefixes still collapse', () => {
    const longA = 'x'.repeat(100) + ' tail-one';
    const longB = 'x'.repeat(100) + ' tail-two';
    // Both normalize to 80 chars of x's → same fingerprint
    const doc = makeDoc({ confidence: 80, evidence: [longA] });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: [longA] }),
      makeDoc({ confidence: 80, evidence: [longB] }),
      makeDoc({ confidence: 80, evidence: [longA] }),
    ];
    const result = computeL1Confidence(doc, allDocs, 3);
    expect(result).toBe(75); // dampener fires
  });

  it('empty evidence lists across the board → dampener stays off (matches existing test suite)', () => {
    const doc = makeDoc({ confidence: 80, evidence: [] });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: [] }),
      makeDoc({ confidence: 80, evidence: [] }),
      makeDoc({ confidence: 80, evidence: [] }),
    ];
    // No evidence → not eligible for echo detection → full boost
    const result = computeL1Confidence(doc, allDocs, 3);
    expect(result).toBe(100);
  });

  it('echo dampener composes with dissent penalty (not both apply: dissent needs agreeing=1)', () => {
    // When agreeing=1 we are in the dissent branch, NOT the boost branch.
    // Echo detection requires 3+ coLocated docs; with agreeing=1 the
    // coLocated filter yields 1 doc, so echo branch cannot fire.
    const doc = makeDoc({ confidence: 80, evidence: ['something specific'] });
    const allDocs = [
      makeDoc({ confidence: 80, evidence: ['something specific'] }),
      makeDoc({ line: 100, evidence: ['unrelated'] }),
      makeDoc({ line: 200, evidence: ['unrelated'] }),
      makeDoc({ line: 300, evidence: ['unrelated'] }),
      makeDoc({ line: 400, evidence: ['unrelated'] }),
    ];
    // Only 1 agreeing, 5 active → dissent regime (small diff). With
    // WARNING severity and small diff, dissent = ×0.5.
    // blend = round(80*0.6 + 20*0.4) = 56; dissent → round(56 * 0.5) = 28
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(28);
  });
});

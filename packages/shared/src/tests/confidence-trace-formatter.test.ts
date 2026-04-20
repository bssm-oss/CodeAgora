import { describe, it, expect } from 'vitest';
import {
  buildTraceRows,
  classifyTriageTab,
  formatFindingTrace,
  formatSessionTrace,
  type TraceableDoc,
} from '../utils/confidence-trace-formatter.js';

function makeDoc(overrides: Partial<TraceableDoc> = {}): TraceableDoc {
  return {
    issueTitle: 'Test Issue',
    severity: 'WARNING',
    filePath: 'src/foo.ts',
    lineRange: [10, 10],
    ...overrides,
  };
}

describe('buildTraceRows', () => {
  it('renders all 5 stages when trace is fully populated', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 80, filtered: 80, corroborated: 96, verified: 96, final: 96 },
    });
    const rows = buildTraceRows(doc);
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.label)).toEqual(['raw', 'filtered', 'corroborated', 'verified', 'final']);
    expect(rows.map(r => r.value)).toEqual([80, 80, 96, 96, 96]);
  });

  it('marks verified stage as skipped when absent (below CRITICAL threshold)', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 60, filtered: 60, corroborated: 48, final: 48 },
    });
    const rows = buildTraceRows(doc);
    const verified = rows.find(r => r.label === 'verified');
    expect(verified?.value).toBeNull();
    expect(verified?.note).toMatch(/skipped/);
  });

  it('marks final as not populated when trace stage absent (pre-#319 session)', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 80, filtered: 80, corroborated: 80 },
    });
    const rows = buildTraceRows(doc);
    const final = rows.find(r => r.label === 'final');
    expect(final?.value).toBeNull();
    expect(final?.note).toMatch(/pre-#319/);
  });

  it('infers speculation penalty (×0.7) from raw → filtered ratio', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 80, filtered: 56 },
    });
    const rows = buildTraceRows(doc);
    const filtered = rows.find(r => r.label === 'filtered');
    expect(filtered?.note).toMatch(/×0\.7.*speculation/);
  });

  it('infers strong penalty (×0.5) from filtered → corroborated ratio', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 80, filtered: 80, corroborated: 40 },
    });
    const rows = buildTraceRows(doc);
    const corroborated = rows.find(r => r.label === 'corroborated');
    expect(corroborated?.note).toMatch(/×0\.5/);
  });

  it('infers sparse regime (×0.8) from filtered → corroborated ratio', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 50, filtered: 50, corroborated: 40 },
    });
    const rows = buildTraceRows(doc);
    const corroborated = rows.find(r => r.label === 'corroborated');
    expect(corroborated?.note).toMatch(/×0\.8.*sparse/);
  });

  it('infers boost (×1.2) from corroboration', () => {
    const doc = makeDoc({
      confidenceTrace: { raw: 80, filtered: 80, corroborated: 96 },
    });
    const rows = buildTraceRows(doc);
    const corroborated = rows.find(r => r.label === 'corroborated');
    expect(corroborated?.note).toMatch(/×1\.2.*boost/);
  });

  it('falls back to delta for unrecognized multipliers (e.g. L2 adjustment)', () => {
    // verified=60 → final=75 is ratio 1.25 — doesn't match any known multiplier
    // (closest is ×1.2 boost but ratio delta 0.05 > 0.03 tolerance)
    const doc = makeDoc({
      confidenceTrace: { raw: 60, filtered: 60, corroborated: 60, verified: 60, final: 75 },
    });
    const rows = buildTraceRows(doc);
    const finalRow = rows.find(r => r.label === 'final');
    // L2 adjustment "+15 consensus" isn't a simple multiplier — fallback to delta
    expect(finalRow?.note).toMatch(/\+15|L2/);
  });

  it('handles raw missing (reviewer did not self-report confidence)', () => {
    const doc = makeDoc({
      confidenceTrace: { filtered: 50, corroborated: 50, final: 50 },
    });
    const rows = buildTraceRows(doc);
    const raw = rows.find(r => r.label === 'raw');
    expect(raw?.value).toBeNull();
    expect(raw?.note).toMatch(/not recorded/);
  });
});

describe('classifyTriageTab', () => {
  it('routes CRITICAL + high confidence to must-fix', () => {
    expect(classifyTriageTab(makeDoc({ severity: 'CRITICAL', confidenceTrace: { final: 85 } }))).toBe('must-fix');
  });

  it('routes CRITICAL + low confidence to verify', () => {
    expect(classifyTriageTab(makeDoc({ severity: 'CRITICAL', confidenceTrace: { final: 40 } }))).toBe('verify');
  });

  it('routes WARNING + high confidence to verify', () => {
    expect(classifyTriageTab(makeDoc({ severity: 'WARNING', confidenceTrace: { final: 75 } }))).toBe('verify');
  });

  it('routes very low confidence to ignore regardless of severity', () => {
    expect(classifyTriageTab(makeDoc({ severity: 'CRITICAL', confidenceTrace: { final: 15 } }))).toBe('ignore');
  });

  it('falls back to legacy confidence when confidenceTrace.final absent', () => {
    expect(classifyTriageTab(makeDoc({ severity: 'CRITICAL', confidence: 85 }))).toBe('must-fix');
  });
});

describe('formatFindingTrace', () => {
  it('produces a header line with index, path, severity', () => {
    const doc = makeDoc({
      issueTitle: 'SQL Injection',
      severity: 'CRITICAL',
      filePath: 'src/auth.ts',
      lineRange: [10, 12],
      confidenceTrace: { raw: 90, filtered: 90, corroborated: 100, final: 100 },
    });
    const lines = formatFindingTrace(doc, 2);
    expect(lines[0]).toBe('[2] src/auth.ts:10-12 — SQL Injection (CRITICAL)');
  });

  it('ends with triage tab indicator', () => {
    const doc = makeDoc({
      confidenceTrace: { final: 15 },
    });
    const lines = formatFindingTrace(doc, 1);
    expect(lines[lines.length - 1]).toBe('    → ignore tab');
  });

  it('renders single-line range without dash', () => {
    const doc = makeDoc({ lineRange: [42, 42], confidenceTrace: { final: 80 } });
    const lines = formatFindingTrace(doc, 1);
    expect(lines[0]).toContain(':42 ');
    expect(lines[0]).not.toContain(':42-42');
  });
});

describe('formatSessionTrace', () => {
  it('handles empty session', () => {
    const lines = formatSessionTrace([]);
    expect(lines).toEqual(['No findings in this session.']);
  });

  it('renders multiple findings separated by blank lines', () => {
    const docs = [
      makeDoc({ issueTitle: 'First', confidenceTrace: { final: 80 } }),
      makeDoc({ issueTitle: 'Second', confidenceTrace: { final: 40 } }),
    ];
    const lines = formatSessionTrace(docs);
    const blanks = lines.filter(l => l === '').length;
    expect(blanks).toBeGreaterThanOrEqual(2);
    expect(lines.find(l => l.includes('First'))).toBeDefined();
    expect(lines.find(l => l.includes('Second'))).toBeDefined();
  });
});

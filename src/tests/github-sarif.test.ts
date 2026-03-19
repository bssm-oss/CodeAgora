import { describe, it, expect } from 'vitest';
import { buildSarifReport, serializeSarif } from '@codeagora/github/sarif.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

const makeDoc = (overrides?: Partial<EvidenceDocument>): EvidenceDocument => ({
  issueTitle: 'SQL injection vulnerability',
  problem: 'User input concatenated into SQL query',
  evidence: ['query = "SELECT * FROM users WHERE id = " + userId'],
  severity: 'CRITICAL',
  suggestion: 'Use parameterized queries',
  filePath: 'src/db/queries.ts',
  lineRange: [42, 45] as [number, number],
  ...overrides,
});

describe('buildSarifReport', () => {
  it('produces valid SARIF 2.1.0 structure', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    expect(report.$schema).toContain('sarif-schema-2.1.0');
    expect(report.version).toBe('2.1.0');
    expect(report.runs).toHaveLength(1);
    expect(report.runs[0].tool.driver.name).toBe('CodeAgora');
    expect(report.runs[0].results).toHaveLength(1);
  });

  it('maps CRITICAL to error level with CA002', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    const result = report.runs[0].results[0];
    expect(result.ruleId).toBe('CA002');
    expect(result.level).toBe('error');
  });

  it('maps HARSHLY_CRITICAL to error level with CA001', () => {
    const report = buildSarifReport([makeDoc({ severity: 'HARSHLY_CRITICAL' })], '001', '2026-03-16');
    expect(report.runs[0].results[0].ruleId).toBe('CA001');
    expect(report.runs[0].results[0].level).toBe('error');
  });

  it('maps WARNING to warning level with CA003', () => {
    const report = buildSarifReport([makeDoc({ severity: 'WARNING' })], '001', '2026-03-16');
    expect(report.runs[0].results[0].ruleId).toBe('CA003');
    expect(report.runs[0].results[0].level).toBe('warning');
  });

  it('maps SUGGESTION to note level with CA004', () => {
    const report = buildSarifReport([makeDoc({ severity: 'SUGGESTION' })], '001', '2026-03-16');
    expect(report.runs[0].results[0].ruleId).toBe('CA004');
    expect(report.runs[0].results[0].level).toBe('note');
  });

  it('includes file location with %SRCROOT%', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    const loc = report.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe('src/db/queries.ts');
    expect(loc.artifactLocation.uriBaseId).toBe('%SRCROOT%');
    expect(loc.region.startLine).toBe(42);
    expect(loc.region.endLine).toBe(45);
  });

  it('includes fix suggestion when available', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    expect(report.runs[0].results[0].fixes).toHaveLength(1);
    expect(report.runs[0].results[0].fixes![0].description.text).toBe('Use parameterized queries');
  });

  it('omits fixes when no suggestion', () => {
    const report = buildSarifReport([makeDoc({ suggestion: '' })], '001', '2026-03-16');
    expect(report.runs[0].results[0].fixes).toBeUndefined();
  });

  it('includes markdown with problem and evidence', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    const md = report.runs[0].results[0].message.markdown!;
    expect(md).toContain('**Problem:**');
    expect(md).toContain('**Evidence:**');
    expect(md).toContain('**Suggestion:**');
  });

  it('handles multiple documents', () => {
    const docs = [makeDoc(), makeDoc({ severity: 'WARNING', filePath: 'src/auth.ts' })];
    const report = buildSarifReport(docs, '002', '2026-03-16');
    expect(report.runs[0].results).toHaveLength(2);
  });

  it('handles empty documents', () => {
    const report = buildSarifReport([], '001', '2026-03-16');
    expect(report.runs[0].results).toHaveLength(0);
  });

  it('sets automationDetails with session info', () => {
    const report = buildSarifReport([], '003', '2026-03-16');
    expect(report.runs[0].automationDetails.id).toBe('codeagora/2026-03-16/003');
  });
});

describe('serializeSarif', () => {
  it('produces valid JSON string', () => {
    const report = buildSarifReport([makeDoc()], '001', '2026-03-16');
    const json = serializeSarif(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

/**
 * SARIF Report Generator Tests
 * Tests buildSarifReport() and serializeSarif()
 */

import { describe, it, expect } from 'vitest';
import {
  buildSarifReport,
  filterSarifPublishableEvidenceDocs,
  isSarifPublishableEvidenceDoc,
  serializeSarif,
} from '../sarif.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import type { SarifDiscussionMeta } from '../sarif.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL Injection Risk',
    problem: 'User input used directly in query.',
    evidence: ['Line 10: raw input interpolated into SQL string'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries.',
    filePath: 'src/db.ts',
    lineRange: [10, 12],
    ...overrides,
  };
}

// ============================================================================
// buildSarifReport — structure
// ============================================================================

describe('buildSarifReport — structure', () => {
  it('returns a SARIF 2.1.0 report with correct schema and version', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    expect(report.$schema).toContain('sarif-schema-2.1.0.json');
    expect(report.version).toBe('2.1.0');
  });

  it('has exactly one run', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    expect(report.runs).toHaveLength(1);
  });

  it('tool driver name is "CodeAgora"', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    expect(report.runs[0]!.tool.driver.name).toBe('CodeAgora');
  });

  it('uses provided version string in driver', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21', '2.5.0');
    expect(report.runs[0]!.tool.driver.version).toBe('2.5.0');
  });

  it('defaults version to "1.0.0" when not provided', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    expect(report.runs[0]!.tool.driver.version).toBe('1.0.0');
  });

  it('automationDetails.id contains sessionDate and sessionId', () => {
    const report = buildSarifReport([], 'sess-abc', '2026-03-21');
    expect(report.runs[0]!.automationDetails.id).toContain('2026-03-21');
    expect(report.runs[0]!.automationDetails.id).toContain('sess-abc');
  });

  it('driver includes all four CA rules', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    const ruleIds = report.runs[0]!.tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toContain('CA001');
    expect(ruleIds).toContain('CA002');
    expect(ruleIds).toContain('CA003');
    expect(ruleIds).toContain('CA004');
  });

  it('driver rules include stable SARIF metadata', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    const rule = report.runs[0]!.tool.driver.rules.find((candidate) => candidate.id === 'CA002')!;
    expect(rule.name).toBe('CriticalIssue');
    expect(rule.fullDescription.text).toContain('CRITICAL');
    expect(rule.helpUri).toContain('CodeAgora');
    expect(rule.properties.tags).toContain('critical');
    expect(rule.properties.precision).toBe('high');
    expect(rule.properties.problemSeverity).toBe('CRITICAL');
    expect(rule.properties['security-severity']).toBe('8.0');
  });

  it('produces empty results array for empty evidenceDocs', () => {
    const report = buildSarifReport([], 'sess-001', '2026-03-21');
    expect(report.runs[0]!.results).toHaveLength(0);
  });
});

// ============================================================================
// buildSarifReport — severity mapping
// ============================================================================

describe('buildSarifReport — severity mapping', () => {
  it('maps HARSHLY_CRITICAL to level "error" and ruleId CA001', () => {
    const report = buildSarifReport([makeDoc({ severity: 'HARSHLY_CRITICAL' })], 's', 'd');
    const result = report.runs[0]!.results[0]!;
    expect(result.level).toBe('error');
    expect(result.ruleId).toBe('CA001');
  });

  it('maps CRITICAL to level "error" and ruleId CA002', () => {
    const report = buildSarifReport([makeDoc({ severity: 'CRITICAL' })], 's', 'd');
    const result = report.runs[0]!.results[0]!;
    expect(result.level).toBe('error');
    expect(result.ruleId).toBe('CA002');
    expect(result.ruleIndex).toBe(1);
  });

  it('maps WARNING to level "warning" and ruleId CA003', () => {
    const report = buildSarifReport([makeDoc({ severity: 'WARNING' })], 's', 'd');
    const result = report.runs[0]!.results[0]!;
    expect(result.level).toBe('warning');
    expect(result.ruleId).toBe('CA003');
  });

  it('maps SUGGESTION to level "note" and ruleId CA004', () => {
    const report = buildSarifReport([makeDoc({ severity: 'SUGGESTION' })], 's', 'd');
    const result = report.runs[0]!.results[0]!;
    expect(result.level).toBe('note');
    expect(result.ruleId).toBe('CA004');
  });

  it('defaults unknown severity to level "note" and ruleId CA004', () => {
    const doc = makeDoc();
    (doc as unknown as Record<string, string>).severity = 'BOGUS';
    const report = buildSarifReport([doc as EvidenceDocument], 's', 'd');
    const result = report.runs[0]!.results[0]!;
    expect(result.level).toBe('note');
    expect(result.ruleId).toBe('CA004');
  });
});

// ============================================================================
// buildSarifReport — result content
// ============================================================================

describe('buildSarifReport — result content', () => {
  it('sets message.text to issueTitle', () => {
    const report = buildSarifReport([makeDoc()], 's', 'd');
    expect(report.runs[0]!.results[0]!.message.text).toBe('SQL Injection Risk');
  });

  it('sets physical location uri to filePath', () => {
    const report = buildSarifReport([makeDoc({ filePath: 'src/auth.ts' })], 's', 'd');
    const loc = report.runs[0]!.results[0]!.locations[0]!.physicalLocation;
    expect(loc.artifactLocation.uri).toBe('src/auth.ts');
    expect(loc.artifactLocation.uriBaseId).toBe('%SRCROOT%');
  });

  it('normalizes artifact URIs for SARIF and GitHub code scanning', () => {
    const report = buildSarifReport([makeDoc({ filePath: '../src\\db queries.ts' })], 's', 'd');
    const loc = report.runs[0]!.results[0]!.locations[0]!.physicalLocation;
    expect(loc.artifactLocation.uri).toBe('src/db%20queries.ts');
  });

  it('sets region startLine and endLine from lineRange', () => {
    const report = buildSarifReport([makeDoc({ lineRange: [20, 25] })], 's', 'd');
    const region = report.runs[0]!.results[0]!.locations[0]!.physicalLocation.region;
    expect(region.startLine).toBe(20);
    expect(region.endLine).toBe(25);
  });

  it('normalizes invalid regions so SARIF line numbers remain valid', () => {
    const report = buildSarifReport([makeDoc({ lineRange: [20, 10] })], 's', 'd');
    const region = report.runs[0]!.results[0]!.locations[0]!.physicalLocation.region;
    expect(region.startLine).toBe(20);
    expect(region.endLine).toBe(20);
  });

  it('keeps suggestion in markdown without emitting an invalid SARIF fix', () => {
    const report = buildSarifReport([makeDoc({ suggestion: 'Use parameterized queries.' })], 's', 'd');
    expect(report.runs[0]!.results[0]!.fixes).toBeUndefined();
    expect(report.runs[0]!.results[0]!.message.markdown).toContain('Use parameterized queries.');
  });

  it('omits fixes when suggestion is empty string', () => {
    const report = buildSarifReport([makeDoc({ suggestion: '' })], 's', 'd');
    // suggestion is falsy — fixes should not be set
    expect(report.runs[0]!.results[0]!.fixes).toBeUndefined();
  });

  it('includes problem and evidence in markdown field', () => {
    const report = buildSarifReport([makeDoc()], 's', 'd');
    const md = report.runs[0]!.results[0]!.message.markdown!;
    expect(md).toContain('User input used directly in query.');
    expect(md).toContain('Line 10: raw input interpolated into SQL string');
  });

  it('produces one result per evidence document', () => {
    const docs = [makeDoc({ filePath: 'a.ts' }), makeDoc({ filePath: 'b.ts' })];
    const report = buildSarifReport(docs, 's', 'd');
    expect(report.runs[0]!.results).toHaveLength(2);
  });

  it('adds stable fingerprints and finding metadata properties', () => {
    const report = buildSarifReport(
      [
        makeDoc({
          reviewerId: 'security-reviewer',
          source: 'llm',
          confidence: 91,
          suggestionVerified: 'passed',
        }),
      ],
      's',
      'd',
    );
    const result = report.runs[0]!.results[0]!;
    expect(result.partialFingerprints?.primaryLocationLineHash).toMatch(/^[a-f0-9]{32}$/);
    expect(result.properties).toMatchObject({
      severity: 'CRITICAL',
      reviewerId: 'security-reviewer',
      source: 'llm',
      confidence: 91,
      suggestionVerified: 'passed',
    });
  });
});

// ============================================================================
// SARIF publishing gate
// ============================================================================

describe('SARIF publishing gate', () => {
  it('keeps deterministic rule findings even without confidence', () => {
    expect(isSarifPublishableEvidenceDoc(makeDoc({ source: 'rule', confidence: undefined }))).toBe(true);
  });

  it('keeps high-confidence actionable LLM findings', () => {
    expect(isSarifPublishableEvidenceDoc(makeDoc({ confidence: 88 }))).toBe(true);
  });

  it('drops low-confidence LLM findings from Code Scanning publication', () => {
    expect(isSarifPublishableEvidenceDoc(makeDoc({ confidence: 25 }))).toBe(false);
  });

  it('drops hallucination-filter class-prior findings from Code Scanning publication', () => {
    expect(isSarifPublishableEvidenceDoc(makeDoc({
      confidence: 92,
      confidenceTrace: { raw: 92, classPrior: 'undeclared-type' },
    }))).toBe(false);
  });

  it('drops suggestions and failed suggestion-verification findings', () => {
    expect(isSarifPublishableEvidenceDoc(makeDoc({ severity: 'SUGGESTION', confidence: 99 }))).toBe(false);
    expect(isSarifPublishableEvidenceDoc(makeDoc({ confidence: 99, suggestionVerified: 'failed' }))).toBe(false);
  });

  it('filters to publishable findings while preserving input order', () => {
    const publishableRule = makeDoc({ issueTitle: 'rule', source: 'rule', confidence: undefined });
    const lowConfidence = makeDoc({ issueTitle: 'low', confidence: 12 });
    const publishableLlm = makeDoc({ issueTitle: 'llm', confidenceTrace: { final: 73 } });

    expect(filterSarifPublishableEvidenceDocs([publishableRule, lowConfidence, publishableLlm])).toEqual([
      publishableRule,
      publishableLlm,
    ]);
  });
});

// ============================================================================
// buildSarifReport — discussion metadata (1.7)
// ============================================================================

describe('buildSarifReport — discussion metadata', () => {
  it('attaches discussion metadata properties when discussionMeta is provided', () => {
    const doc = makeDoc({ filePath: 'src/db.ts', lineRange: [10, 12] });
    const meta = new Map<string, SarifDiscussionMeta>();
    meta.set('src/db.ts:10', {
      discussionId: 'd001',
      rounds: 2,
      consensusReached: true,
      finalSeverity: 'CRITICAL',
    });

    const report = buildSarifReport([doc], 's', 'd', '1.0.0', meta);
    const props = report.runs[0]!.results[0]!.properties;
    expect(props).toBeDefined();
    expect(props!['discussionId']).toBe('d001');
    expect(props!['rounds']).toBe(2);
    expect(props!['consensusReached']).toBe(true);
    expect(props!['finalSeverity']).toBe('CRITICAL');
  });

  it('does not set properties when no matching meta entry exists', () => {
    const doc = makeDoc({ filePath: 'src/db.ts', lineRange: [10, 12] });
    const meta = new Map<string, SarifDiscussionMeta>();
    // meta for a different location
    meta.set('src/other.ts:99', {
      discussionId: 'd002',
      rounds: 1,
      consensusReached: false,
      finalSeverity: 'WARNING',
    });

    const report = buildSarifReport([doc], 's', 'd', '1.0.0', meta);
    expect(report.runs[0]!.results[0]!.properties?.['discussionId']).toBeUndefined();
    expect(report.runs[0]!.results[0]!.properties?.['severity']).toBe('CRITICAL');
  });
});

// ============================================================================
// serializeSarif
// ============================================================================

describe('serializeSarif', () => {
  it('returns a valid JSON string', () => {
    const report = buildSarifReport([makeDoc()], 'sess-001', '2026-03-21');
    const json = serializeSarif(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('serialized JSON round-trips back to the original report', () => {
    const report = buildSarifReport([makeDoc()], 'sess-001', '2026-03-21');
    const parsed = JSON.parse(serializeSarif(report));
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].results[0].ruleId).toBe('CA002');
  });

  it('uses 2-space indentation', () => {
    const report = buildSarifReport([], 's', 'd');
    const json = serializeSarif(report);
    // 2-space indent means lines start with "  "
    expect(json).toContain('\n  ');
  });
});

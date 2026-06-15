/**
 * SARIF 2.1.0 Output Generator
 * Converts EvidenceDocument[] to SARIF JSON for GitHub Code Scanning.
 */

import crypto from 'crypto';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import { REVIEW_SEVERITIES, SARIF_SEVERITY_RULES } from '@codeagora/shared/contracts/stable.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';

// ============================================================================
// SARIF Type Definitions
// ============================================================================

interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: { driver: SarifDriver };
  results: SarifResult[];
  automationDetails: { id: string };
}

interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  defaultConfiguration: { level: string };
  properties: {
    tags: string[];
    precision: 'medium' | 'high';
    problemSeverity: string;
    'security-severity'?: string;
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: { text: string; markdown?: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: string };
      region: { startLine: number; endLine: number };
    };
  }>;
  fixes?: Array<{ description: { text: string }; artifactChanges: unknown[] }>;
  partialFingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
}

// ============================================================================
// Severity Mapping
// ============================================================================

const SARIF_RULE_DESCRIPTIONS: Record<string, string> = {
  CA001: 'Harshly critical issue detected by multi-agent review',
  CA002: 'Critical issue detected by multi-agent review',
  CA003: 'Warning-level issue detected by multi-agent review',
  CA004: 'Suggestion from multi-agent review',
};

const SARIF_SECURITY_SEVERITY: Record<string, string | undefined> = {
  HARSHLY_CRITICAL: '9.0',
  CRITICAL: '8.0',
  WARNING: '5.0',
  SUGGESTION: undefined,
};

const SARIF_RULES: SarifRule[] = REVIEW_SEVERITIES.map((severity) => {
  const rule = SARIF_SEVERITY_RULES[severity];
  return {
    id: rule.ruleId,
    name: rule.ruleName,
    shortDescription: { text: SARIF_RULE_DESCRIPTIONS[rule.ruleId] ?? 'CodeAgora review finding' },
    fullDescription: {
      text: `${severity} finding produced by CodeAgora's multi-agent code review pipeline.`,
    },
    helpUri: 'https://github.com/bssm-oss/CodeAgora',
    defaultConfiguration: { level: rule.level },
    properties: {
      tags: ['code-review', 'codeagora', severity.toLowerCase().replaceAll('_', '-')],
      precision: severity === 'SUGGESTION' ? 'medium' : 'high',
      problemSeverity: severity,
      ...(SARIF_SECURITY_SEVERITY[severity]
        ? { 'security-severity': SARIF_SECURITY_SEVERITY[severity] }
        : {}),
    },
  };
});

const SARIF_RULE_INDEX = new Map(SARIF_RULES.map((rule, index) => [rule.id, index]));
const ACTIONABLE_SARIF_MIN_CONFIDENCE = 60;

function sarifRuleForSeverity(
  severity: string,
): { level: SarifResult['level']; ruleId: string; ruleIndex: number } {
  const rule = SARIF_SEVERITY_RULES[severity as keyof typeof SARIF_SEVERITY_RULES] ?? SARIF_SEVERITY_RULES.SUGGESTION;
  return {
    level: rule.level,
    ruleId: rule.ruleId,
    ruleIndex: SARIF_RULE_INDEX.get(rule.ruleId) ?? SARIF_RULE_INDEX.get(SARIF_SEVERITY_RULES.SUGGESTION.ruleId) ?? 0,
  };
}

function normalizeLineNumber(value: number | undefined, fallback = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function normalizeRegion(lineRange: [number, number]): { startLine: number; endLine: number } {
  const startLine = normalizeLineNumber(lineRange[0]);
  const endLine = Math.max(startLine, normalizeLineNumber(lineRange[1], startLine));
  return { startLine, endLine };
}

function normalizeArtifactUri(filePath: string): string {
  const withoutNul = filePath.replaceAll('\0', '');
  const slashPath = withoutNul.trim().replaceAll('\\', '/');
  const withoutScheme = slashPath.replace(/^file:\/+/i, '').replace(/^[A-Za-z]:\//, '');
  const segments = withoutScheme.split('/').filter((segment) => {
    return segment.length > 0 && segment !== '.' && segment !== '..';
  });
  const normalized = segments.join('/') || 'unknown';
  return encodeURI(normalized);
}

function stableFingerprint(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

function finalConfidence(doc: EvidenceDocument): number | undefined {
  return doc.confidenceTrace?.final ?? doc.confidenceTrace?.verified ?? doc.confidenceTrace?.filtered ?? doc.confidence;
}

export function isSarifPublishableEvidenceDoc(doc: EvidenceDocument): boolean {
  if (doc.severity === 'SUGGESTION') return false;
  if (doc.source === 'rule') return true;
  if (doc.suggestionVerified === 'failed') return false;
  if (doc.confidenceTrace?.classPrior) return false;
  const confidence = finalConfidence(doc);
  return confidence !== undefined && confidence >= ACTIONABLE_SARIF_MIN_CONFIDENCE;
}

export function filterSarifPublishableEvidenceDocs(evidenceDocs: EvidenceDocument[]): EvidenceDocument[] {
  return evidenceDocs.filter(isSarifPublishableEvidenceDoc);
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build a SARIF 2.1.0 report from evidence documents.
 */
export interface SarifDiscussionMeta {
  discussionId: string;
  rounds: number;
  consensusReached: boolean;
  finalSeverity: string;
}

export function buildSarifReport(
  evidenceDocs: EvidenceDocument[],
  sessionId: string,
  sessionDate: string,
  version: string = '1.0.0',
  discussionMeta?: Map<string, SarifDiscussionMeta>,
): SarifReport {
  const safeDocs = redactDeep(evidenceDocs);
  const results: SarifResult[] = safeDocs.map((doc) => {
    const mapping = sarifRuleForSeverity(doc.severity);
    const region = normalizeRegion(doc.lineRange);
    const artifactUri = normalizeArtifactUri(doc.filePath);

    const markdown = [
      `**Problem:** ${doc.problem}`,
      doc.evidence.length > 0 ? `\n**Evidence:**\n${doc.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '',
      doc.suggestion ? `\n**Suggestion:** ${doc.suggestion}` : '',
    ].filter(Boolean).join('\n');

    const result: SarifResult = {
      ruleId: mapping.ruleId,
      ruleIndex: mapping.ruleIndex,
      level: mapping.level,
      message: {
        text: doc.issueTitle,
        markdown,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: artifactUri,
              uriBaseId: '%SRCROOT%',
            },
            region,
          },
        },
      ],
      partialFingerprints: {
        primaryLocationLineHash: stableFingerprint(
          `${artifactUri}:${region.startLine}:${region.endLine}:${mapping.ruleId}:${doc.issueTitle}`,
        ),
      },
      properties: {
        severity: doc.severity,
        ...(doc.reviewerId ? { reviewerId: doc.reviewerId } : {}),
        ...(doc.source ? { source: doc.source } : {}),
        ...(doc.confidence !== undefined ? { confidence: doc.confidence } : {}),
        ...(doc.confidenceTrace ? { confidenceTrace: doc.confidenceTrace } : {}),
        ...(doc.suggestionVerified ? { suggestionVerified: doc.suggestionVerified } : {}),
      },
    };

    // Free-form review suggestions stay in the markdown body above. SARIF fixes
    // require concrete artifactChanges, and GitHub rejects description-only fixes.

    // Attach discussion metadata (1.7)
    const locKey = `${doc.filePath}:${doc.lineRange[0]}`;
    const meta = discussionMeta?.get(locKey);
    if (meta) {
      result.properties = {
        ...result.properties,
        discussionId: meta.discussionId,
        rounds: meta.rounds,
        consensusReached: meta.consensusReached,
        finalSeverity: meta.finalSeverity,
      };
    }

    return result;
  });

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeAgora',
            version,
            informationUri: 'https://github.com/bssm-oss/CodeAgora',
            rules: SARIF_RULES,
          },
        },
        results,
        automationDetails: {
          id: `codeagora/${sessionDate}/${sessionId}`,
        },
      },
    ],
  };
}

/**
 * Serialize a SARIF report to a JSON string.
 */
export function serializeSarif(report: SarifReport): string {
  return JSON.stringify(report, null, 2);
}

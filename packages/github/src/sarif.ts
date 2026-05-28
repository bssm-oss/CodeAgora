/**
 * SARIF 2.1.0 Output Generator
 * Converts EvidenceDocument[] to SARIF JSON for GitHub Code Scanning.
 */

import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import { SARIF_SEVERITY_RULES } from '@codeagora/shared/contracts/stable.js';
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
  defaultConfiguration: { level: string };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string; markdown?: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: string };
      region: { startLine: number; endLine: number };
    };
  }>;
  fixes?: Array<{ description: { text: string } }>;
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

const SARIF_RULES: SarifRule[] = Object.values(SARIF_SEVERITY_RULES).map((rule) => ({
  id: rule.ruleId,
  name: rule.ruleName,
  shortDescription: { text: SARIF_RULE_DESCRIPTIONS[rule.ruleId] ?? 'CodeAgora review finding' },
  defaultConfiguration: { level: rule.level },
}));

function sarifRuleForSeverity(severity: string): { level: SarifResult['level']; ruleId: string } {
  return SARIF_SEVERITY_RULES[severity as keyof typeof SARIF_SEVERITY_RULES] ?? SARIF_SEVERITY_RULES.SUGGESTION;
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

    const markdown = [
      `**Problem:** ${doc.problem}`,
      doc.evidence.length > 0 ? `\n**Evidence:**\n${doc.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '',
      doc.suggestion ? `\n**Suggestion:** ${doc.suggestion}` : '',
    ].filter(Boolean).join('\n');

    const result: SarifResult = {
      ruleId: mapping.ruleId,
      level: mapping.level,
      message: {
        text: doc.issueTitle,
        markdown,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: doc.filePath,
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: Math.max(1, doc.lineRange[0]),
              endLine: Math.max(1, doc.lineRange[1]),
            },
          },
        },
      ],
    };

    if (doc.suggestion) {
      result.fixes = [{ description: { text: doc.suggestion } }];
    }

    // Attach discussion metadata (1.7)
    const locKey = `${doc.filePath}:${doc.lineRange[0]}`;
    const meta = discussionMeta?.get(locKey);
    if (meta) {
      result.properties = {
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

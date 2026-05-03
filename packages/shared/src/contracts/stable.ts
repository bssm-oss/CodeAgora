/**
 * Shared stable-readiness contract markers and registries.
 *
 * These constants are intentionally dependency-free so CLI, GitHub Action,
 * MCP, and core packages can reuse the same machine-contract source of truth.
 */

export const REVIEW_CONTRACT_VERSION = 'codeagora.review.v1' as const;
export const SESSION_ARTIFACT_SCHEMA_VERSION = 'codeagora.session.v1' as const;
export const CACHE_METADATA_SCHEMA_VERSION = 'codeagora.cache.v1' as const;

export type ReviewContractVersion = typeof REVIEW_CONTRACT_VERSION;
export type SessionArtifactSchemaVersion = typeof SESSION_ARTIFACT_SCHEMA_VERSION;
export type CacheMetadataSchemaVersion = typeof CACHE_METADATA_SCHEMA_VERSION;

export const REVIEW_SEVERITIES = [
  'HARSHLY_CRITICAL',
  'CRITICAL',
  'WARNING',
  'SUGGESTION',
] as const;

export type ReviewSeverity = typeof REVIEW_SEVERITIES[number];

export const CONFIG_DEFAULT_CONTRACT = {
  requiredSections: [
    'reviewers',
    'supporters',
    'moderator',
    'discussion',
    'errorHandling',
  ],
  discussionThresholds: REVIEW_SEVERITIES,
} as const;

export type ConfigDefaultSection = typeof CONFIG_DEFAULT_CONTRACT.requiredSections[number];

export const MCP_ERROR_CODES = [
  'INVALID_INPUT',
  'INVALID_REPO_PATH',
  'REVIEW_FAILED',
  'REVIEW_PR_FAILED',
  'DRY_RUN_FAILED',
  'CONFIG_GET_FAILED',
  'CONFIG_SET_FAILED',
] as const;

export type McpErrorCode = typeof MCP_ERROR_CODES[number];

export const ACTION_DEGRADED_REASONS = [
  'missing-github-token',
  'missing-provider-secrets',
  'fork-missing-provider-secrets',
  'posting-disabled',
] as const;

export type ActionDegradedReason = typeof ACTION_DEGRADED_REASONS[number];

export const SARIF_SEVERITY_RULES = {
  HARSHLY_CRITICAL: { level: 'error', ruleId: 'CA001', ruleName: 'HarshlyCriticalIssue' },
  CRITICAL: { level: 'error', ruleId: 'CA002', ruleName: 'CriticalIssue' },
  WARNING: { level: 'warning', ruleId: 'CA003', ruleName: 'WarningIssue' },
  SUGGESTION: { level: 'note', ruleId: 'CA004', ruleName: 'Suggestion' },
} as const satisfies Record<ReviewSeverity, {
  level: 'error' | 'warning' | 'note';
  ruleId: `CA00${1 | 2 | 3 | 4}`;
  ruleName: string;
}>;

export type SarifSeverityRule = typeof SARIF_SEVERITY_RULES[ReviewSeverity];

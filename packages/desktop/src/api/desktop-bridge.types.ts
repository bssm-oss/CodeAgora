import type {
  SessionCostSummary as CoreSessionCostSummary,
  SessionDetailView,
  SessionReviewDecision,
  SessionSeverityCounts,
  SessionSummary as CoreSessionSummary,
  SessionTopIssue,
} from '@codeagora/core/session/contracts.js';

export type ReviewDecision = SessionReviewDecision;
export type SeverityCounts = SessionSeverityCounts;
export type TopIssue = SessionTopIssue;
export type SessionSummary = CoreSessionSummary;
export type SessionCostSummary = CoreSessionCostSummary;
export type SessionDetail = SessionDetailView;

export interface SessionExport {
  format: string;
  fileName: string;
  content: string;
}

export interface RunReviewResult {
  ok: boolean;
  message: string;
  sessionId?: string;
}

export type ReviewRunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';

export interface ReviewRunEvent {
  kind: string;
  message: string;
  timestamp: string;
  schemaVersion?: 'codeagora.review.v1';
  type?: 'progress' | 'result' | string;
  stage?: string;
  event?: string;
  progress?: number;
  sessionId?: string;
  payload?: unknown;
}

export interface ReviewRunSnapshot {
  runId: string;
  staged: boolean;
  status: ReviewRunStatus;
  message: string;
  sessionId?: string;
  startedAt: string;
  completedAt?: string;
  events: ReviewRunEvent[];
}

export interface DesktopConfig {
  raw: string;
  path: string;
}

export interface ConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProviderStatus {
  name: string;
  kind: string; // 'api' | 'cli'
  envVar?: string;
  configured: boolean;
  redactedValue?: string;
  binary?: string;
}

export interface DoctorCheck {
  name: string;
  status: string;
  message: string;
}

export interface DoctorSummary {
  pass: number;
  fail: number;
  warn: number;
}

export interface LiveCheckResult {
  provider: string;
  model: string;
  status: string;
  latencyMs?: number;
  error?: string;
}

export interface LiveDoctorStatus {
  command: string;
  checks: DoctorCheck[];
  summary: DoctorSummary;
  liveChecks: LiveCheckResult[];
}

export interface McpStatus {
  command: string;
  tools: string[];
  clientSnippet: string;
}

export interface WorkflowStatus {
  path: string;
  mentionsCodeagora: boolean;
  hasPullRequestTrigger: boolean;
  hasPermissions: boolean;
  hasConfigPath: boolean;
}

export interface GitHubActionStatus {
  workflowCount: number;
  codeagoraWorkflowCount: number;
  workflows: WorkflowStatus[];
  recommendedSnippet: string;
}

export interface EvidenceStatus {
  releaseEvidencePath?: string;
  benchmarkReportPath?: string;
  evidenceManifestPath?: string;
  hasReleaseEvidence: boolean;
  hasBenchmarkReport: boolean;
  hasEvidenceManifest: boolean;
}

export interface RepoInfo {
  path: string;
  gitRoot?: string;
  isGitRepo: boolean;
  branch?: string;
  headSha?: string;
  dirtyFileCount: number;
  hasConfig: boolean;
  configPath?: string;
  reviewIgnorePath?: string;
  reviewRulesPath?: string;
  sessionsRoot: string;
  sessionCount: number;
  trusted: boolean;
  trustReason: string;
}

export interface DesktopCommandContract {
  name: string;
  classification: string;
  readsProject: boolean;
  mutatesProject: boolean;
  spawnsProcess: boolean;
  notes: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  notifySuccess: boolean;
  notifyFailure: boolean;
  sound: boolean;
  badge: boolean;
}

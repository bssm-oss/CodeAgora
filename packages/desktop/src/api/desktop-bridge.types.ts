export type ReviewDecision = 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';

export interface SeverityCounts {
  HARSHLY_CRITICAL?: number;
  CRITICAL?: number;
  WARNING?: number;
  SUGGESTION?: number;
}

export interface TopIssue {
  severity: string;
  filePath: string;
  lineRange: [number, number];
  title: string;
  confidence?: number;
}

export interface SessionSummary {
  id: string;
  date: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'interrupted' | 'in_progress' | 'unknown';
  dirPath?: string;
  decision?: ReviewDecision;
  reasoning?: string;
  severityCounts?: SeverityCounts;
  topIssues?: TopIssue[];
  updatedAt?: string;
}

export interface SessionCostSummary {
  known: boolean;
  formattedTotalCost: string;
  totalCost?: number;
  callCount?: number;
  totalTokens?: number;
  source?: string;
}

export interface SessionDetail extends SessionSummary {
  findings?: TopIssue[];
  markdown?: string;
  evidenceCount?: number;
  discussionsCount?: number;
  degraded?: boolean;
  degradedReasons?: string[];
  costSummary?: SessionCostSummary;
}

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

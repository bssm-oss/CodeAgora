import crypto from 'crypto';
import { appendFileSync } from 'fs';
import { getActionGuidance } from './action-policy.js';
import { createOctokit, type GitHubConfig } from './client.js';
import type { ActionDegradedReason } from '@codeagora/shared/contracts/stable.js';
import type { GitHubCheckRunConclusion, GitHubCommitStatusVerdict } from './types.js';

export type ActionOutputName =
  | 'verdict'
  | 'review-url'
  | 'session-id'
  | 'sarif-file'
  | 'degraded'
  | 'degraded-reason'
  | 'head-sha'
  | 'base-sha';

export interface DocumentedActionOutputs {
  verdict?: string;
  reviewUrl?: string;
  sessionId?: string;
  sarifFile?: string;
  degraded?: boolean;
  degradedReason?: ActionDegradedReason;
  headSha?: string;
  baseSha?: string;
}

export interface ActionCheckRunReport {
  config: GitHubConfig;
  sha: string;
  verdict: GitHubCommitStatusVerdict;
  executionOutcome?: ActionReviewExecutionOutcome;
  degradedReason?: ActionDegradedReason;
  checkRunName?: string;
  reviewUrl?: string;
  summary?: string;
  details?: string;
  octokit?: unknown;
}

export interface ActionCheckRunResult {
  id: number;
  htmlUrl?: string;
  conclusion: GitHubCheckRunConclusion;
  operation: 'created' | 'updated';
}

export type ActionReviewExecutionOutcome = 'completed' | 'skipped' | 'blocked';

interface CheckRunListItem {
  id: number;
  name?: string;
  head_sha?: string;
  html_url?: string | null;
}

interface CheckRunRequestBase {
  owner: string;
  repo: string;
  name: string;
  status: 'completed';
  conclusion: GitHubCheckRunConclusion;
  completed_at: string;
  output: {
    title: string;
    summary: string;
    text?: string;
  };
}

interface CheckRunCreateRequest extends CheckRunRequestBase {
  head_sha: string;
  details_url?: string;
}

interface CheckRunUpdateRequest extends CheckRunRequestBase {
  check_run_id: number;
  details_url?: string;
}

interface CheckRunOctokit {
  checks: {
    listForRef(input: {
      owner: string;
      repo: string;
      ref: string;
      check_name: string;
      filter: 'latest';
      per_page: number;
    }): Promise<{ data: { check_runs: CheckRunListItem[] } }>;
    create(input: CheckRunCreateRequest): Promise<{ data: { id: number; html_url?: string | null } }>;
    update(input: CheckRunUpdateRequest): Promise<{ data: { id: number; html_url?: string | null } }>;
  };
}

/**
 * Set a GitHub Actions output variable.
 * Writes to $GITHUB_OUTPUT file if available, falls back to ::set-output.
 */
export function setActionOutput(
  name: ActionOutputName,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const outputFile = env['GITHUB_OUTPUT'];
  if (outputFile) {
    if (value.includes('\n')) {
      const delimiter = `EOF_${crypto.randomBytes(16).toString('hex')}`;
      appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    } else {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  } else {
    // Fallback for older runners
    console.log(`::set-output name=${name}::${value}`);
  }
}

export function writeDocumentedActionOutputs(
  outputs: DocumentedActionOutputs,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (outputs.headSha !== undefined) setActionOutput('head-sha', outputs.headSha, env);
  if (outputs.baseSha !== undefined) setActionOutput('base-sha', outputs.baseSha, env);
  if (outputs.degraded !== undefined) setActionOutput('degraded', String(outputs.degraded), env);
  if (outputs.degradedReason !== undefined) {
    setActionOutput('degraded-reason', outputs.degradedReason, env);
  }
  if (outputs.verdict !== undefined) setActionOutput('verdict', outputs.verdict, env);
  if (outputs.reviewUrl !== undefined) setActionOutput('review-url', outputs.reviewUrl, env);
  if (outputs.sessionId !== undefined) setActionOutput('session-id', outputs.sessionId, env);
  if (outputs.sarifFile !== undefined) setActionOutput('sarif-file', outputs.sarifFile, env);
}

export function setActionDegraded(
  reason: ActionDegradedReason,
  env: NodeJS.ProcessEnv = process.env,
): void {
  writeDocumentedActionOutputs({ degraded: true, degradedReason: reason }, env);
}

export function logActionDiagnostic(
  title: string,
  reason: ActionDegradedReason,
  detail?: string,
): void {
  const guidance = getActionGuidance(reason);
  console.log(`::group::CodeAgora ${title}`);
  console.log(`Reason: ${reason}`);
  console.log(`Why: ${guidance.why}`);
  if (detail) {
    console.log(`Detail: ${detail}`);
  }
  console.log('Next steps:');
  for (const step of guidance.nextSteps) {
    console.log(`- ${step}`);
  }
  console.log('::endgroup::');
}

export function writeActionSummary(
  status: 'degraded' | 'skipped',
  reason: ActionDegradedReason,
  detail?: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const summaryFile = env['GITHUB_STEP_SUMMARY'];
  if (!summaryFile) return;

  const guidance = getActionGuidance(reason);
  const lines = [
    `### CodeAgora review ${status}`,
    '',
    `- Reason: \`${reason}\``,
    `- Why: ${guidance.why}`,
    ...(detail ? [`- Detail: ${detail}`] : []),
    '- Next steps:',
    ...guidance.nextSteps.map((step) => `  - ${step}`),
    '',
  ];

  appendFileSync(summaryFile, `${lines.join('\n')}\n`);
}

export function mapActionVerdictToCheckRunConclusion(
  verdict: GitHubCommitStatusVerdict,
): GitHubCheckRunConclusion {
  const conclusionMap: Record<GitHubCommitStatusVerdict, GitHubCheckRunConclusion> = {
    ACCEPT: 'success',
    REJECT: 'failure',
    NEEDS_HUMAN: 'neutral',
    NEUTRAL: 'neutral',
    DEGRADED: 'neutral',
    SKIPPED: 'neutral',
  };

  return conclusionMap[verdict] ?? 'neutral';
}

function normalizeCheckRunName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, 100) : 'CodeAgora Review';
}

function normalizeRenderedVerdict(
  verdict: GitHubCommitStatusVerdict,
  executionOutcome: ActionReviewExecutionOutcome | undefined,
): GitHubCommitStatusVerdict {
  switch (executionOutcome) {
    case 'skipped':
      return 'SKIPPED';
    case 'blocked':
      return 'DEGRADED';
    case 'completed':
    case undefined:
      return verdict;
  }
}

function buildCheckRunTitle(
  renderedVerdict: GitHubCommitStatusVerdict,
  executionOutcome: ActionReviewExecutionOutcome | undefined,
): string {
  if (executionOutcome === 'blocked') return 'CodeAgora BLOCKED';
  return `CodeAgora ${renderedVerdict}`;
}

function buildBypassedCheckRunSummary(
  executionOutcome: Exclude<ActionReviewExecutionOutcome, 'completed'>,
  reason: ActionDegradedReason | undefined,
): string {
  const reasonText = reason ? ` Reason: ${reason}.` : '';
  return `CodeAgora review ${executionOutcome}. Review execution did not run.${reasonText} Inspect workflow outputs for details.`;
}

function buildCheckRunSummary(
  verdict: GitHubCommitStatusVerdict,
  summary: string | undefined,
  executionOutcome: ActionReviewExecutionOutcome | undefined,
  degradedReason: ActionDegradedReason | undefined,
): string {
  if (executionOutcome === 'skipped' || executionOutcome === 'blocked') {
    return buildBypassedCheckRunSummary(executionOutcome, degradedReason);
  }

  if (summary?.trim()) return summary.trim();

  switch (verdict) {
    case 'ACCEPT':
      return 'CodeAgora completed successfully with no blocking issues.';
    case 'REJECT':
      return 'CodeAgora found blocking issues.';
    case 'NEEDS_HUMAN':
      return 'CodeAgora completed, but a human review is required.';
    case 'DEGRADED':
      return 'CodeAgora ran in degraded mode. Inspect workflow outputs for details.';
    case 'SKIPPED':
      return 'CodeAgora review was skipped. Inspect workflow outputs for details.';
    case 'NEUTRAL':
      return 'CodeAgora completed without a blocking pass or fail verdict.';
  }
}

export async function reportActionCheckRun(report: ActionCheckRunReport): Promise<ActionCheckRunResult> {
  const kit = (report.octokit ?? createOctokit(report.config)) as CheckRunOctokit;
  const name = normalizeCheckRunName(report.checkRunName);
  const renderedVerdict = normalizeRenderedVerdict(report.verdict, report.executionOutcome);
  const conclusion = mapActionVerdictToCheckRunConclusion(renderedVerdict);
  const completedAt = new Date().toISOString();
  const output = {
    title: buildCheckRunTitle(renderedVerdict, report.executionOutcome),
    summary: buildCheckRunSummary(
      renderedVerdict,
      report.summary,
      report.executionOutcome,
      report.degradedReason,
    ),
    ...(report.details?.trim() ? { text: report.details.trim() } : {}),
  };

  const existing = await kit.checks.listForRef({
    owner: report.config.owner,
    repo: report.config.repo,
    ref: report.sha,
    check_name: name,
    filter: 'latest',
    per_page: 10,
  });
  const existingRun = existing.data.check_runs.find((run) => {
    return run.name === name && run.head_sha === report.sha;
  });

  if (existingRun) {
    const response = await kit.checks.update({
      owner: report.config.owner,
      repo: report.config.repo,
      check_run_id: existingRun.id,
      name,
      status: 'completed',
      conclusion,
      completed_at: completedAt,
      output,
      ...(report.reviewUrl ? { details_url: report.reviewUrl } : {}),
    });

    return {
      id: response.data.id,
      htmlUrl: response.data.html_url ?? undefined,
      conclusion,
      operation: 'updated',
    };
  }

  const response = await kit.checks.create({
    owner: report.config.owner,
    repo: report.config.repo,
    name,
    head_sha: report.sha,
    status: 'completed',
    conclusion,
    completed_at: completedAt,
    output,
    ...(report.reviewUrl ? { details_url: report.reviewUrl } : {}),
  });

  return {
    id: response.data.id,
    htmlUrl: response.data.html_url ?? undefined,
    conclusion,
    operation: 'created',
  };
}

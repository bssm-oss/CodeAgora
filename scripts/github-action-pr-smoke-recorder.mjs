#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_EVIDENCE_METADATA_LOG } from './evidence-recorder.mjs';
import { EXPECTED_EVIDENCE } from './release-gates.mjs';

export const LIVE_GITHUB_ACTION_PR_SMOKE_SCHEMA_VERSION = 'codeagora.live-github-action-pr-smoke.v1';
export const LIVE_GITHUB_ACTION_PR_SMOKE_METADATA_SCHEMA_VERSION = 'codeagora.live-github-action-pr-smoke-metadata.v1';

const LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE = EXPECTED_EVIDENCE.find((entry) => entry.name === 'live-github-action-pr-smoke');

if (!LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE) {
  throw new Error('Missing live-github-action-pr-smoke release evidence inventory entry');
}

const OUTPUT_ENV = {
  verdict: 'CODEAGORA_VERDICT',
  reviewUrl: 'CODEAGORA_REVIEW_URL',
  sessionId: 'CODEAGORA_SESSION_ID',
  degraded: 'CODEAGORA_DEGRADED',
  degradedReason: 'CODEAGORA_DEGRADED_REASON',
  headSha: 'CODEAGORA_HEAD_SHA',
  baseSha: 'CODEAGORA_BASE_SHA',
  reviewStepOutcome: 'CODEAGORA_REVIEW_STEP_OUTCOME',
  reviewStepConclusion: 'CODEAGORA_REVIEW_STEP_CONCLUSION',
  jobStatus: 'CODEAGORA_JOB_STATUS',
};

function parseArgs(argv) {
  const options = {
    eventPath: undefined,
    outputsPath: undefined,
    summaryPath: undefined,
    output: path.join('docs', 'archived', 'live-github-action-pr-smoke.md'),
    evidenceDir: path.join('.sisyphus', 'evidence'),
    metadataStore: undefined,
    scenario: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--event-path') {
      options.eventPath = argv[++index];
    } else if (arg?.startsWith('--event-path=')) {
      options.eventPath = arg.slice('--event-path='.length);
    } else if (arg === '--outputs') {
      options.outputsPath = argv[++index];
    } else if (arg?.startsWith('--outputs=')) {
      options.outputsPath = arg.slice('--outputs='.length);
    } else if (arg === '--summary') {
      options.summaryPath = argv[++index];
    } else if (arg?.startsWith('--summary=')) {
      options.summaryPath = arg.slice('--summary='.length);
    } else if (arg === '--output') {
      options.output = argv[++index];
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--metadata-store') {
      options.metadataStore = argv[++index];
    } else if (arg?.startsWith('--metadata-store=')) {
      options.metadataStore = arg.slice('--metadata-store='.length);
    } else if (arg === '--scenario') {
      options.scenario = argv[++index];
    } else if (arg?.startsWith('--scenario=')) {
      options.scenario = arg.slice('--scenario='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function parseGitHubOutputText(text) {
  const outputs = {};
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;

    const heredoc = line.match(/^([^<>=]+)<<(.+)$/);
    if (heredoc) {
      const key = heredoc[1];
      const delimiter = heredoc[2];
      const valueLines = [];
      index++;
      while (index < lines.length && lines[index] !== delimiter) {
        valueLines.push(lines[index]);
        index++;
      }
      outputs[key] = valueLines.join('\n');
      continue;
    }

    const separator = line.indexOf('=');
    if (separator > 0) {
      outputs[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }

  return outputs;
}

async function readOutputsFile(outputsPath) {
  if (!outputsPath) return {};
  const raw = await fs.readFile(outputsPath, 'utf-8');
  return parseGitHubOutputText(raw);
}

function envValue(env, name) {
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeActionOutputs(fileOutputs, env) {
  return {
    verdict: fileOutputs.verdict ?? envValue(env, OUTPUT_ENV.verdict),
    reviewUrl: fileOutputs['review-url'] ?? envValue(env, OUTPUT_ENV.reviewUrl),
    sessionId: fileOutputs['session-id'] ?? envValue(env, OUTPUT_ENV.sessionId),
    degraded: fileOutputs.degraded ?? envValue(env, OUTPUT_ENV.degraded),
    degradedReason: fileOutputs['degraded-reason'] ?? envValue(env, OUTPUT_ENV.degradedReason),
    headSha: fileOutputs['head-sha'] ?? envValue(env, OUTPUT_ENV.headSha),
    baseSha: fileOutputs['base-sha'] ?? envValue(env, OUTPUT_ENV.baseSha),
    reviewStepOutcome: envValue(env, OUTPUT_ENV.reviewStepOutcome),
    reviewStepConclusion: envValue(env, OUTPUT_ENV.reviewStepConclusion),
    jobStatus: envValue(env, OUTPUT_ENV.jobStatus),
  };
}

function requireObject(value, description) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected ${description} in GitHub event payload`);
  }
  return value;
}

function requireString(value, description) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required ${description}`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function buildRunUrl(env, repository) {
  const serverUrl = envValue(env, 'GITHUB_SERVER_URL') ?? 'https://github.com';
  const runId = envValue(env, 'GITHUB_RUN_ID');
  if (!runId) return null;
  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function inferScenario({ pullRequest, outputs, env }) {
  const explicit = envValue(env, 'CODEAGORA_SMOKE_SCENARIO');
  if (explicit) return explicit;
  if (outputs.degradedReason === 'diff-too-large') return 'oversized-diff';
  if (outputs.degradedReason === 'stale-head-sha') return 'stale-head';
  if (outputs.degradedReason === 'fork-missing-provider-secrets') return 'fork-missing-provider-secrets';
  if (pullRequest.fork) return 'fork-pr';
  return 'same-repo-pr';
}

function validateRequiredMetadata({ eventName, repository, workflow, runId, outputs }) {
  const missing = [];
  if (eventName !== 'pull_request') missing.push('GITHUB_EVENT_NAME=pull_request');
  if (!repository) missing.push('GITHUB_REPOSITORY');
  if (!workflow) missing.push('GITHUB_WORKFLOW');
  if (!runId) missing.push('GITHUB_RUN_ID');
  for (const key of ['verdict', 'degraded', 'headSha', 'baseSha']) {
    if (!outputs[key]) missing.push(`CodeAgora output ${key}`);
  }
  if (outputs.degraded === 'true' && !outputs.degradedReason) {
    missing.push('CodeAgora output degradedReason');
  }
  if (missing.length > 0) {
    throw new Error(`Cannot record live GitHub Action PR smoke evidence; missing: ${missing.join(', ')}`);
  }
}

export function buildSmokeRecord({ event, outputs, env = process.env, options = {}, summary = '' }) {
  const pullRequestEvent = requireObject(event.pull_request, 'pull_request');
  const repository = optionalString(event.repository?.full_name) ?? optionalString(env.GITHUB_REPOSITORY);
  const eventName = optionalString(env.GITHUB_EVENT_NAME) ?? 'pull_request';
  if (eventName !== 'pull_request') {
    throw new Error(`GitHub Action PR smoke evidence must come from a pull_request event, got ${eventName}`);
  }

  const baseRepo = requireString(pullRequestEvent.base?.repo?.full_name, 'pull_request.base.repo.full_name');
  const headRepo = requireString(pullRequestEvent.head?.repo?.full_name, 'pull_request.head.repo.full_name');
  const pullRequest = {
    number: pullRequestEvent.number,
    url: optionalString(pullRequestEvent.html_url),
    title: optionalString(pullRequestEvent.title),
    base: {
      ref: requireString(pullRequestEvent.base?.ref, 'pull_request.base.ref'),
      sha: requireString(pullRequestEvent.base?.sha, 'pull_request.base.sha'),
      repo: baseRepo,
    },
    head: {
      ref: requireString(pullRequestEvent.head?.ref, 'pull_request.head.ref'),
      sha: requireString(pullRequestEvent.head?.sha, 'pull_request.head.sha'),
      repo: headRepo,
    },
    fork: baseRepo !== headRepo || pullRequestEvent.head?.repo?.fork === true,
  };

  const workflow = optionalString(env.GITHUB_WORKFLOW);
  const runId = optionalString(env.GITHUB_RUN_ID);
  validateRequiredMetadata({ eventName, repository, workflow, runId, outputs });

  const runUrl = buildRunUrl(env, repository);
  const checks = {
    actualPullRequestContext: true,
    outputHeadShaMatchesEvent: outputs.headSha === pullRequest.head.sha,
    outputBaseShaMatchesEvent: outputs.baseSha === pullRequest.base.sha,
    hasVerdict: Boolean(outputs.verdict),
    hasRunUrl: Boolean(runUrl),
  };

  return {
    schemaVersion: LIVE_GITHUB_ACTION_PR_SMOKE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    source: {
      eventPath: optionalString(options.eventPath),
      outputsPath: optionalString(options.outputsPath),
      summaryPath: optionalString(options.summaryPath),
    },
    scenario: options.scenario ?? inferScenario({ pullRequest, outputs, env }),
    workflowRun: {
      eventName,
      eventAction: optionalString(event.action),
      repository,
      workflow,
      job: optionalString(env.GITHUB_JOB),
      actor: optionalString(env.GITHUB_ACTOR),
      sha: optionalString(env.GITHUB_SHA),
      runId,
      runNumber: optionalString(env.GITHUB_RUN_NUMBER),
      runAttempt: optionalString(env.GITHUB_RUN_ATTEMPT),
      runUrl,
    },
    pullRequest,
    actionOutputs: outputs,
    checks,
    extractionPassed: Object.values(checks).every(Boolean),
    summaryExcerpt: summary.trim().split(/\r?\n/).slice(0, 40).join('\n'),
  };
}

function markdownValue(value) {
  return value === null || value === undefined || value === '' ? '`not recorded`' : `\`${String(value).replaceAll('`', '\\`')}\``;
}

function markdownLink(label, url) {
  return url ? `[${label}](${url})` : '`not recorded`';
}

function passFail(value) {
  return value ? 'pass' : 'fail';
}

function relativePath(fromCwd, targetPath) {
  return path.relative(fromCwd, targetPath) || path.basename(targetPath);
}

function linkEntry(label, url) {
  return url ? { label, url } : null;
}

function pathEntry(label, filePath, cwd) {
  return filePath ? { label, path: relativePath(cwd, path.resolve(cwd, filePath)) } : null;
}

export function buildSmokeMetadataEntry({ record, outputPath, cwd = process.cwd() }) {
  const resolvedOutputPath = path.resolve(cwd, outputPath);
  const artifactLinks = [
    pathEntry('Live GitHub Action PR smoke evidence', resolvedOutputPath, cwd),
    pathEntry('GitHub event payload', record.source.eventPath, cwd),
    pathEntry('GitHub output file', record.source.outputsPath, cwd),
    pathEntry('GitHub step summary', record.source.summaryPath, cwd),
    linkEntry('GitHub Actions run', record.workflowRun.runUrl),
    linkEntry('Pull request', record.pullRequest.url),
  ].filter(Boolean);
  const outputLinks = [
    linkEntry('review-url', record.actionOutputs.reviewUrl),
  ].filter(Boolean);

  return {
    schemaVersion: LIVE_GITHUB_ACTION_PR_SMOKE_METADATA_SCHEMA_VERSION,
    name: LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE.name,
    command: LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE.command,
    tier: LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE.tier,
    execution: LIVE_GITHUB_ACTION_PR_SMOKE_EVIDENCE.execution,
    passed: record.extractionPassed,
    timestamp: record.capturedAt,
    evidencePath: relativePath(cwd, resolvedOutputPath),
    scenario: record.scenario,
    workflowRun: record.workflowRun,
    pullRequest: record.pullRequest,
    actionOutputs: record.actionOutputs,
    checks: record.checks,
    artifactLinks,
    outputLinks,
  };
}

async function appendSmokeMetadataEntry({ record, outputPath, options, cwd = process.cwd() }) {
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const metadataStorePath = path.resolve(cwd, options.metadataStore ?? path.join(evidenceDir, RELEASE_EVIDENCE_METADATA_LOG));
  const entry = buildSmokeMetadataEntry({ record, outputPath, cwd });

  await fs.mkdir(path.dirname(metadataStorePath), { recursive: true });
  await fs.appendFile(metadataStorePath, `${JSON.stringify(entry)}\n`);

  return {
    entry,
    metadataStorePath,
  };
}

export function renderSmokeMarkdown(record) {
  const lines = [
    '# Live GitHub Action PR Smoke',
    '',
    `Schema: \`${record.schemaVersion}\``,
    `Captured: \`${record.capturedAt}\``,
    'Source: actual GitHub Actions `pull_request` event context plus CodeAgora Action outputs.',
    '',
    '## Summary',
    '',
    `- Scenario: ${markdownValue(record.scenario)}`,
    `- Extraction: ${record.extractionPassed ? '`pass`' : '`fail`'}`,
    `- Verdict: ${markdownValue(record.actionOutputs.verdict)}`,
    `- Degraded: ${markdownValue(record.actionOutputs.degraded)}`,
    `- Degraded reason: ${markdownValue(record.actionOutputs.degradedReason)}`,
    `- Review URL: ${markdownLink(record.actionOutputs.reviewUrl ?? 'not recorded', record.actionOutputs.reviewUrl)}`,
    `- Session: ${markdownValue(record.actionOutputs.sessionId)}`,
    '',
    '## Pull Request Context',
    '',
    `- PR: ${record.pullRequest.url ? markdownLink(`#${record.pullRequest.number}`, record.pullRequest.url) : markdownValue(record.pullRequest.number)}`,
    `- Title: ${markdownValue(record.pullRequest.title)}`,
    `- Fork: ${markdownValue(String(record.pullRequest.fork))}`,
    `- Base: ${markdownValue(`${record.pullRequest.base.repo}:${record.pullRequest.base.ref}`)}`,
    `- Base SHA: ${markdownValue(record.pullRequest.base.sha)}`,
    `- Head: ${markdownValue(`${record.pullRequest.head.repo}:${record.pullRequest.head.ref}`)}`,
    `- Head SHA: ${markdownValue(record.pullRequest.head.sha)}`,
    '',
    '## Workflow Run',
    '',
    `- Repository: ${markdownValue(record.workflowRun.repository)}`,
    `- Event: ${markdownValue(record.workflowRun.eventName)}`,
    `- Event action: ${markdownValue(record.workflowRun.eventAction)}`,
    `- Workflow: ${markdownValue(record.workflowRun.workflow)}`,
    `- Job: ${markdownValue(record.workflowRun.job)}`,
    `- Run: ${markdownLink(record.workflowRun.runId ?? 'not recorded', record.workflowRun.runUrl)}`,
    `- Run number: ${markdownValue(record.workflowRun.runNumber)}`,
    `- Run attempt: ${markdownValue(record.workflowRun.runAttempt)}`,
    `- Actor: ${markdownValue(record.workflowRun.actor)}`,
    `- Workflow SHA: ${markdownValue(record.workflowRun.sha)}`,
    '',
    '## CodeAgora Action Outputs',
    '',
    `- \`verdict\`: ${markdownValue(record.actionOutputs.verdict)}`,
    `- \`review-url\`: ${markdownLink(record.actionOutputs.reviewUrl ?? 'not recorded', record.actionOutputs.reviewUrl)}`,
    `- \`session-id\`: ${markdownValue(record.actionOutputs.sessionId)}`,
    `- \`degraded\`: ${markdownValue(record.actionOutputs.degraded)}`,
    `- \`degraded-reason\`: ${markdownValue(record.actionOutputs.degradedReason)}`,
    `- \`head-sha\`: ${markdownValue(record.actionOutputs.headSha)}`,
    `- \`base-sha\`: ${markdownValue(record.actionOutputs.baseSha)}`,
    `- Review step outcome: ${markdownValue(record.actionOutputs.reviewStepOutcome)}`,
    `- Review step conclusion: ${markdownValue(record.actionOutputs.reviewStepConclusion)}`,
    `- Job status: ${markdownValue(record.actionOutputs.jobStatus)}`,
    '',
    '## Consistency Checks',
    '',
    `- Pull request event payload present: \`${passFail(record.checks.actualPullRequestContext)}\``,
    `- Output head SHA matches event head SHA: \`${passFail(record.checks.outputHeadShaMatchesEvent)}\``,
    `- Output base SHA matches event base SHA: \`${passFail(record.checks.outputBaseShaMatchesEvent)}\``,
    `- Verdict output recorded: \`${passFail(record.checks.hasVerdict)}\``,
    `- Workflow run URL derived: \`${passFail(record.checks.hasRunUrl)}\``,
  ];

  if (record.summaryExcerpt) {
    lines.push(
      '',
      '## Job Summary Excerpt',
      '',
      '```text',
      record.summaryExcerpt,
      '```',
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function recordGithubActionPrSmoke(options, env = process.env) {
  const eventPath = options.eventPath ?? env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('Missing --event-path or GITHUB_EVENT_PATH');
  }

  const event = await readJson(eventPath);
  const outputs = normalizeActionOutputs(await readOutputsFile(options.outputsPath), env);
  const summary = options.summaryPath ? await fs.readFile(options.summaryPath, 'utf-8') : '';
  const record = buildSmokeRecord({
    event,
    outputs,
    env,
    options: { ...options, eventPath },
    summary,
  });
  const markdown = renderSmokeMarkdown(record);
  const outputPath = path.resolve(options.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown);
  const metadata = await appendSmokeMetadataEntry({ record, outputPath, options });
  return { record, markdown, outputPath, metadata };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await recordGithubActionPrSmoke(options);
  console.log(`Wrote ${path.relative(process.cwd(), result.outputPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

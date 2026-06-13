import { readFileSync } from 'node:fs';

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/i;

export function resolveReviewedPrCommitSha(env: NodeJS.ProcessEnv = process.env): string {
  if (env['GITHUB_EVENT_NAME'] && env['GITHUB_EVENT_NAME'] !== 'pull_request') {
    throw new Error('CodeAgora GitHub Action requires a pull_request event payload to resolve the reviewed commit SHA');
  }

  const eventPath = env['GITHUB_EVENT_PATH'];
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required to resolve the reviewed pull_request head SHA');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(eventPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read valid GitHub pull_request event payload: ${message}`);
  }

  const pullRequest = getRecordField(payload, 'pull_request');
  const head = getRecordField(pullRequest, 'head');
  const sha = getUnknownField(head, 'sha');

  if (typeof sha !== 'string' || sha.trim() === '') {
    throw new Error('GitHub pull_request event payload is missing pull_request.head.sha');
  }

  const normalized = sha.trim();
  if (!FULL_COMMIT_SHA.test(normalized)) {
    throw new Error('GitHub pull_request event payload pull_request.head.sha must be a 40-character commit SHA');
  }

  return normalized;
}

function getRecordField(value: unknown, field: string): Record<string, unknown> | undefined {
  const nested = getUnknownField(value, field);
  return isRecord(nested) ? nested : undefined;
}

function getUnknownField(value: unknown, field: string): unknown {
  return isRecord(value) ? value[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

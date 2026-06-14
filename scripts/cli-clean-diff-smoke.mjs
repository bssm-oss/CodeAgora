#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'codeagora.cli-clean-diff-smoke.v1';
const DEFAULT_TIMEOUT_MS = 180_000;
const CLI_DIST_PATH = path.resolve('packages/cli/dist/index.js');
const TSX_BIN = path.resolve('node_modules/.bin/tsx');
const CLI_SOURCE_PATH = path.resolve('packages/cli/src/index.ts');
const PROVIDER_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};
const PROVIDER_DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4.1-mini',
  openrouter: 'xiaomi/mimo-v2.5',
};
const REVIEW_BACKENDS = new Set(['api', 'claude', 'codex', 'gemini', 'antigravity', 'copilot', 'cursor', 'opencode', 'pi']);
const BACKEND_DEFAULT_MODELS = {
  claude: 'sonnet',
  codex: 'auto',
  gemini: 'gemini-2.5-pro',
  antigravity: 'auto',
  copilot: 'auto',
  cursor: 'auto',
  opencode: 'deepseek-v4-flash',
  pi: 'auto',
};

const CLEAN_FIXTURE_DIFF = [
  'diff --git a/src/math.ts b/src/math.ts',
  '--- a/src/math.ts',
  '+++ b/src/math.ts',
  '@@ -1,3 +1,4 @@',
  ' export function add(a: number, b: number): number {',
  '+  // Keep this harmless change as the clean-diff smoke fixture.',
  '   return a + b;',
  ' }',
  '',
].join('\n');

const INVALID_CONFIG_ERROR_MARKER = 'JSON parse error';
const MISSING_PROVIDER_KEY_ERROR_MARKER = 'API key not found';
const PROVIDER_FAILURE_RUNTIME_ERROR_MARKER = /provider|api|reviewer|forfeit|auth|rate limit|quota|timeout|network|failed/i;
const TIMEOUT_RUNTIME_ERROR_MARKER = /timeout|timed out/i;
const PROVIDER_FAILURE_INVALID_KEY = 'codeagora-provider-failure-smoke-invalid-key';
const SETUP_ERROR_FIXTURES = new Set(['invalid-config', 'missing-provider-key']);
const RUNTIME_ERROR_FIXTURES = new Set(['provider-failure', 'timeout-runtime']);
const FIXTURE_KINDS = new Set(['clean-diff', 'staged-diff', 'patch-file', 'invalid-config', 'missing-provider-key', 'provider-failure', 'timeout-runtime']);

function parseArgs(argv) {
  const options = {
    backend: process.env.CODEAGORA_SMOKE_BACKEND || 'api',
    provider: process.env.CODEAGORA_SMOKE_PROVIDER || 'openrouter',
    providerExplicit: Boolean(process.env.CODEAGORA_SMOKE_PROVIDER),
    model: process.env.CODEAGORA_SMOKE_MODEL || '',
    cli: process.env.CODEAGORA_SMOKE_CLI || '',
    output: '',
    transcriptOutput: '',
    fixture: process.env.CODEAGORA_SMOKE_FIXTURE || 'clean-diff',
    patchFile: process.env.CODEAGORA_SMOKE_PATCH_FILE || '',
    dryRun: false,
    keepTemp: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--keep-temp') {
      options.keepTemp = true;
    } else if (arg === '--provider') {
      options.provider = argv[++index] ?? options.provider;
      options.providerExplicit = true;
    } else if (arg?.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length);
      options.providerExplicit = true;
    } else if (arg === '--backend') {
      options.backend = argv[++index] ?? options.backend;
    } else if (arg?.startsWith('--backend=')) {
      options.backend = arg.slice('--backend='.length);
    } else if (arg === '--model') {
      options.model = argv[++index] ?? options.model;
    } else if (arg?.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg === '--cli') {
      options.cli = argv[++index] ?? options.cli;
    } else if (arg?.startsWith('--cli=')) {
      options.cli = arg.slice('--cli='.length);
    } else if (arg === '--output') {
      options.output = argv[++index] ?? options.output;
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--transcript-output') {
      options.transcriptOutput = argv[++index] ?? options.transcriptOutput;
    } else if (arg?.startsWith('--transcript-output=')) {
      options.transcriptOutput = arg.slice('--transcript-output='.length);
    } else if (arg === '--fixture') {
      options.fixture = argv[++index] ?? options.fixture;
    } else if (arg?.startsWith('--fixture=')) {
      options.fixture = arg.slice('--fixture='.length);
    } else if (arg === '--patch-file') {
      options.patchFile = argv[++index] ?? options.patchFile;
    } else if (arg?.startsWith('--patch-file=')) {
      options.patchFile = arg.slice('--patch-file='.length);
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[++index] ?? options.timeoutMs);
    } else if (arg?.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${options.timeoutMs}`);
  }
  if (!REVIEW_BACKENDS.has(options.backend)) {
    throw new Error(`Invalid --backend value: ${options.backend}. Expected one of: ${Array.from(REVIEW_BACKENDS).join(', ')}.`);
  }
  if (options.patchFile && options.fixture === 'clean-diff') {
    options.fixture = 'patch-file';
  }
  if (!FIXTURE_KINDS.has(options.fixture)) {
    throw new Error(`Invalid --fixture value: ${options.fixture}. Expected clean-diff, staged-diff, patch-file, invalid-config, missing-provider-key, provider-failure, or timeout-runtime.`);
  }
  if (options.patchFile && options.fixture !== 'patch-file') {
    throw new Error('--patch-file can only be combined with --fixture patch-file.');
  }
  if (options.patchFile) {
    options.patchFile = path.resolve(options.patchFile);
  }
  if ((options.fixture === 'missing-provider-key' || options.fixture === 'provider-failure') && options.backend !== 'api') {
    throw new Error(`--fixture ${options.fixture} requires --backend api.`);
  }
  if (options.backend === 'opencode' && !options.providerExplicit) {
    options.provider = 'opencode-go';
  }
  if (!options.model) {
    options.model = defaultModelForOptions(options);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage: node scripts/cli-clean-diff-smoke.mjs [options]',
    '',
    'Runs the CLI against a harmless clean fixture diff and emits a structured JSON result.',
    '',
    'Options:',
    '  --dry-run              Validate runner and fixture plumbing without provider calls',
    '  --backend <name>       Review backend for live config: api, claude, codex, gemini, antigravity, copilot, cursor, opencode, or pi (default: api)',
    '  --provider <name>      Provider for live review config (default: openrouter)',
    '  --model <name>         Reviewer/head model for live review config (default: auto)',
    '  --cli <path>           CLI entrypoint or binary to execute',
    '  --output <path>        Also write the structured JSON result to this path',
    '  --transcript-output <path>  Write full child stdout/stderr transcript to this path',
    '  --fixture <kind>       Fixture to review: clean-diff, staged-diff, patch-file, invalid-config, missing-provider-key, provider-failure, or timeout-runtime',
    '  --patch-file <path>    Patch file path to pass to the CLI patch-file smoke',
    '  --timeout-ms <number>  Child process timeout in milliseconds',
    '  --keep-temp            Keep the temporary fixture workspace for inspection',
  ].join('\n'));
}

function providerEnvVar(provider) {
  return PROVIDER_ENV[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

function defaultModelForOptions(options) {
  if (options.backend === 'api') {
    return PROVIDER_DEFAULT_MODELS[options.provider] || 'auto';
  }
  return BACKEND_DEFAULT_MODELS[options.backend] || 'auto';
}

function defaultCredentialsPath() {
  return path.join(os.homedir(), '.config', 'codeagora', 'credentials');
}

function loadCredentialStoreIntoEnv(credentialsPath = defaultCredentialsPath(), env = process.env) {
  let content = '';
  try {
    const stat = fs.statSync(credentialsPath);
    if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) {
      return false;
    }
    content = fs.readFileSync(credentialsPath, 'utf-8');
  } catch {
    return false;
  }

  let loaded = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key || !value || env[key]) {
      continue;
    }
    env[key] = value;
    loaded = true;
  }

  return loaded;
}

function fixtureRequiresProviderCredentials(options) {
  return options.backend === 'api'
    && !options.dryRun
    && options.fixture !== 'invalid-config'
    && options.fixture !== 'missing-provider-key'
    && options.fixture !== 'provider-failure';
}

function fixtureRecordsRequiredEnvVar(options) {
  return options.backend === 'api'
    && (fixtureRequiresProviderCredentials(options) || options.fixture === 'missing-provider-key' || options.fixture === 'provider-failure');
}

function fixtureIsolatesUserHome(options) {
  return options.backend === 'api';
}

function reviewTimeoutSeconds(options) {
  return options.fixture === 'timeout-runtime'
    ? 1
    : Math.max(1, Math.ceil(options.timeoutMs / 1000));
}

function hasNoExpectedReviewDecision(fixture) {
  return SETUP_ERROR_FIXTURES.has(fixture) || RUNTIME_ERROR_FIXTURES.has(fixture);
}

function createSmokeConfig(options) {
  const model = options.model || defaultModelForOptions(options);
  const timeoutSeconds = reviewTimeoutSeconds(options);
  const backend = options.backend;
  const includeProvider = backend === 'api' || backend === 'opencode';
  const agent = {
    id: 'clean-diff-smoke-reviewer',
    model,
    backend,
    enabled: true,
    timeout: timeoutSeconds,
    maxOutputTokens: 2048,
  };
  if (includeProvider) {
    agent.provider = options.provider;
  }

  const config = {
    mode: 'pragmatic',
    language: 'en',
    reviewers: [agent],
    supporters: {
      pool: [{ ...agent, id: 'clean-diff-smoke-supporter' }],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: { ...agent, id: 'clean-diff-smoke-devils-advocate' },
      personaPool: ['.ca/personas/pragmatic.md'],
      personaAssignment: 'random',
    },
    moderator: {
      backend,
      model,
      timeout: timeoutSeconds,
      maxOutputTokens: 2048,
    },
    discussion: {
      enabled: false,
      maxRounds: 1,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 1,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    head: {
      backend,
      model,
      enabled: true,
      timeout: timeoutSeconds,
      maxOutputTokens: 2048,
    },
    errorHandling: {
      maxRetries: 0,
      forfeitThreshold: 1,
    },
    autoApprove: {
      enabled: false,
    },
  };
  if (includeProvider) {
    config.moderator.provider = options.provider;
    config.head.provider = options.provider;
  }
  return config;
}

function resolveCliCommand(options) {
  if (options.cli) {
    return { file: options.cli, args: [] };
  }
  if (fs.existsSync(CLI_DIST_PATH)) {
    return { file: process.execPath, args: [CLI_DIST_PATH] };
  }
  if (fs.existsSync(TSX_BIN) && fs.existsSync(CLI_SOURCE_PATH)) {
    return { file: TSX_BIN, args: ['--conditions', 'development', CLI_SOURCE_PATH] };
  }
  throw new Error('CLI entrypoint not found. Run `pnpm build` or pass --cli <path>.');
}

function spawnCapture({ file, args, cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref?.();

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
        exitCode: 127,
        signal: null,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function parseJsonOutput(stdout) {
  try {
    return { value: JSON.parse(stdout), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function summarizeReview(parsed) {
  const evidenceDocs = Array.isArray(parsed?.evidenceDocs) ? parsed.evidenceDocs : [];
  return {
    schemaVersion: typeof parsed?.schemaVersion === 'string' ? parsed.schemaVersion : null,
    status: typeof parsed?.status === 'string' ? parsed.status : null,
    decision: typeof parsed?.summary?.decision === 'string' ? parsed.summary.decision : null,
    evidenceCount: evidenceDocs.length,
    severityCounts: parsed?.summary?.severityCounts && typeof parsed.summary.severityCounts === 'object'
      ? parsed.summary.severityCounts
      : {},
    sessionId: typeof parsed?.sessionId === 'string' ? parsed.sessionId : null,
    date: typeof parsed?.date === 'string' ? parsed.date : null,
  };
}

function buildSessionArtifactReference({ parsed, fixtureDir, keepTemp, dryRun, unavailableReason }) {
  if (unavailableReason) {
    return {
      state: 'absent',
      reason: unavailableReason,
      sessionId: null,
      date: null,
      directory: null,
      resultPath: null,
      retained: false,
    };
  }

  if (dryRun) {
    return {
      state: 'absent',
      reason: 'dry-run-does-not-create-session-artifacts',
      sessionId: null,
      date: null,
      directory: null,
      resultPath: null,
      retained: false,
    };
  }

  const review = summarizeReview(parsed);
  if (!review.date || !review.sessionId) {
    return {
      state: 'absent',
      reason: 'cli-json-missing-session-artifact-reference',
      sessionId: review.sessionId,
      date: review.date,
      directory: null,
      resultPath: null,
      retained: false,
    };
  }

  const directory = path.join('.ca', 'sessions', review.date, review.sessionId);
  const resultPath = path.join(directory, 'result.json');
  const absoluteResultPath = path.join(fixtureDir, resultPath);
  if (!fs.existsSync(absoluteResultPath)) {
    return {
      state: 'absent',
      reason: 'session-artifact-result-json-missing',
      sessionId: review.sessionId,
      date: review.date,
      directory,
      resultPath,
      retained: false,
      retainedPath: null,
    };
  }
  const resultStat = fs.statSync(absoluteResultPath);

  return {
    state: 'present',
    reason: null,
    sessionId: review.sessionId,
    date: review.date,
    directory,
    resultPath,
    retained: Boolean(keepTemp),
    retainedPath: keepTemp ? displayPath(absoluteResultPath) : null,
    sizeBytes: resultStat.size,
    sha256: sha256File(absoluteResultPath),
  };
}

function summarizeDryRun(parsed) {
  return {
    estimationPresent: typeof parsed?.estimation?.totalEstimatedCost === 'string',
    totalEstimatedCost: typeof parsed?.estimation?.totalEstimatedCost === 'string'
      ? parsed.estimation.totalEstimatedCost
      : null,
    includedFiles: Array.isArray(parsed?.diffMetadata?.includedFiles)
      ? parsed.diffMetadata.includedFiles
      : [],
    excludedFiles: Array.isArray(parsed?.diffMetadata?.excludedFiles)
      ? parsed.diffMetadata.excludedFiles
      : [],
    health: Array.isArray(parsed?.health) ? parsed.health : [],
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
  };
}

function evaluateOutcome({ options, childResult, parsed, parseError, missingEnvVar }) {
  if (!options.dryRun && missingEnvVar) {
    return {
      status: 'blocked',
      passed: false,
      reason: `${missingEnvVar} is required for live CLI ${options.fixture} smoke; checked process env and ${defaultCredentialsPath()}`,
    };
  }
  if (childResult.timedOut) {
    return { status: 'fail', passed: false, reason: 'CLI smoke timed out' };
  }
  if (options.fixture === 'invalid-config') {
    if (childResult.exitCode !== 2) {
      return { status: 'fail', passed: false, reason: `Invalid-config smoke expected CLI exit 2, got ${childResult.exitCode}` };
    }
    if (!childResult.stderr.includes(INVALID_CONFIG_ERROR_MARKER)) {
      return { status: 'fail', passed: false, reason: `Invalid-config smoke stderr did not include ${INVALID_CONFIG_ERROR_MARKER}` };
    }
    return {
      status: 'pass',
      passed: true,
      reason: 'CLI invalid-config validation rejected malformed config with exit code 2',
    };
  }
  if (options.fixture === 'missing-provider-key') {
    const requiredEnvVar = providerEnvVar(options.provider);
    const diagnosticText = [
      childResult.stderr,
      childResult.stdout,
      typeof parsed?.error === 'string' ? parsed.error : '',
    ].filter(Boolean).join('\n');
    if (childResult.exitCode !== 2) {
      return {
        status: 'fail',
        passed: false,
        reason: `Missing-provider-key smoke expected CLI exit 2, got ${childResult.exitCode}`,
      };
    }
    if (!diagnosticText.includes(MISSING_PROVIDER_KEY_ERROR_MARKER) || !diagnosticText.includes(requiredEnvVar)) {
      return {
        status: 'fail',
        passed: false,
        reason: `Missing-provider-key smoke output did not include ${MISSING_PROVIDER_KEY_ERROR_MARKER} and ${requiredEnvVar}`,
      };
    }
    return {
      status: 'pass',
      passed: true,
      reason: `CLI missing-provider-key validation rejected missing ${requiredEnvVar} with exit code 2`,
    };
  }
  if (options.dryRun) {
    if (childResult.exitCode !== 0) {
      return { status: 'fail', passed: false, reason: `Dry-run CLI exited with ${childResult.exitCode}` };
    }
    if (parseError) {
      return { status: 'fail', passed: false, reason: `Dry-run CLI stdout was not JSON: ${parseError}` };
    }
    const summary = summarizeDryRun(parsed);
    if (!summary.estimationPresent) {
      return { status: 'fail', passed: false, reason: 'Dry-run JSON missing estimation.totalEstimatedCost' };
    }
    if (!summary.includedFiles.includes('src/math.ts')) {
      return { status: 'fail', passed: false, reason: `Dry-run JSON did not include src/math.ts ${options.fixture} fixture` };
    }
    return { status: 'pass', passed: true, reason: `Dry-run ${options.fixture} fixture passed` };
  }
  if (options.fixture === 'provider-failure') {
    const diagnosticText = [
      typeof parsed?.error === 'string' ? parsed.error : '',
      childResult.stderr,
      childResult.stdout,
    ].filter(Boolean).join('\n');
    if (childResult.exitCode !== 3) {
      return {
        status: 'fail',
        passed: false,
        reason: `Provider-failure smoke expected CLI exit 3, got ${childResult.exitCode}`,
      };
    }
    if (parseError || !parsed) {
      return {
        status: 'fail',
        passed: false,
        reason: `Provider-failure smoke stdout was not structured review JSON: ${parseError ?? 'empty stdout'}`,
      };
    }
    const review = summarizeReview(parsed);
    if (review.status !== 'error') {
      return {
        status: 'fail',
        passed: false,
        reason: `Provider-failure smoke expected review status error, got ${review.status ?? 'missing'}`,
      };
    }
    if (!PROVIDER_FAILURE_RUNTIME_ERROR_MARKER.test(diagnosticText)) {
      return {
        status: 'fail',
        passed: false,
        reason: 'Provider-failure smoke output did not include a provider/API runtime diagnostic',
      };
    }
    return {
      status: 'pass',
      passed: true,
      reason: 'CLI provider-failure runtime path returned structured error with exit code 3',
    };
  }
  if (options.fixture === 'timeout-runtime') {
    const diagnosticText = [
      typeof parsed?.error === 'string' ? parsed.error : '',
      childResult.stderr,
      childResult.stdout,
    ].filter(Boolean).join('\n');
    if (childResult.exitCode !== 3) {
      return {
        status: 'fail',
        passed: false,
        reason: `Timeout-runtime smoke expected CLI exit 3, got ${childResult.exitCode}`,
      };
    }
    if (parseError || !parsed) {
      return {
        status: 'fail',
        passed: false,
        reason: `Timeout-runtime smoke stdout was not structured review JSON: ${parseError ?? 'empty stdout'}`,
      };
    }
    const review = summarizeReview(parsed);
    if (review.status !== 'error') {
      return {
        status: 'fail',
        passed: false,
        reason: `Timeout-runtime smoke expected review status error, got ${review.status ?? 'missing'}`,
      };
    }
    if (!TIMEOUT_RUNTIME_ERROR_MARKER.test(diagnosticText)) {
      return {
        status: 'fail',
        passed: false,
        reason: 'Timeout-runtime smoke output did not include a timeout runtime diagnostic',
      };
    }
    return {
      status: 'pass',
      passed: true,
      reason: 'CLI timeout runtime path returned structured error with exit code 3',
    };
  }
  if (childResult.exitCode !== 0) {
    const errorText = typeof parsed?.error === 'string' ? parsed.error : '';
    const errorLines = errorText.split('\n').map((line) => line.trim());
    const diagnosticLine = errorLines.find((line) => /auth|user not found|quota|rate limit/i.test(line))
      ?? errorLines.find((line) => /api|provider|forfeit/i.test(line))
      ?? errorLines.find((line) => line);
    if (options.backend === 'api' && diagnosticLine && /auth|api|provider|quota|rate limit|user not found|forfeit/i.test(errorText)) {
      return {
        status: 'fail',
        passed: false,
        reason: `Live provider check failed with saved ${providerEnvVar(options.provider)} from ${defaultCredentialsPath()}: ${diagnosticLine}`,
      };
    }
    if (options.backend !== 'api' && diagnosticLine) {
      return {
        status: 'fail',
        passed: false,
        reason: `Live ${options.backend} CLI backend check failed: ${diagnosticLine}`,
      };
    }
    return { status: 'fail', passed: false, reason: `CLI exited with ${childResult.exitCode}` };
  }
  if (parseError) {
    return { status: 'fail', passed: false, reason: `CLI stdout was not JSON: ${parseError}` };
  }

  const review = summarizeReview(parsed);
  if (review.status !== 'success') {
    const errorText = typeof parsed?.error === 'string' ? parsed.error : '';
    const firstErrorLine = errorText.split('\n').find((line) => line.trim())?.trim();
    return {
      status: 'fail',
      passed: false,
      reason: firstErrorLine
        ? `Review status was ${review.status ?? 'missing'}: ${firstErrorLine}`
        : `Review status was ${review.status ?? 'missing'}`,
    };
  }
  if (review.decision !== 'ACCEPT') {
    return { status: 'fail', passed: false, reason: `${options.fixture} decision was ${review.decision ?? 'missing'}` };
  }
  if (review.evidenceCount !== 0) {
    return { status: 'fail', passed: false, reason: `${options.fixture} produced ${review.evidenceCount} finding(s)` };
  }
  return { status: 'pass', passed: true, reason: `Live ${options.fixture} review accepted with no findings` };
}

function buildCommandPreview(file, args) {
  return [file, ...args].join(' ');
}

function defaultTranscriptOutputPath(outputPath) {
  if (!outputPath) return '';
  const parsed = path.parse(outputPath);
  if (parsed.ext === '.json') {
    return path.join(parsed.dir, `${parsed.name}.transcript.txt`);
  }
  return `${outputPath}.transcript.txt`;
}

function resolveTranscriptOutputPath(options) {
  return options.transcriptOutput || defaultTranscriptOutputPath(options.output);
}

function sha256Text(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function displayPath(filePath) {
  if (!filePath) return null;
  const relative = path.relative(process.cwd(), path.resolve(filePath));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : path.resolve(filePath);
}

function buildTranscript({ result, childResult, command }) {
  const lines = [
    'schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1',
    `smokeSchemaVersion: ${result.schemaVersion}`,
    `surface: ${result.surface}`,
    `mode: ${result.mode}`,
    `backend: ${result.backend}`,
    `provider: ${result.provider}`,
    `model: ${result.model}`,
    `command: ${command}`,
    `exitCode: ${childResult.exitCode}`,
    `signal: ${childResult.signal ?? ''}`,
    `timedOut: ${childResult.timedOut}`,
    `startedAt: ${result.startedAt}`,
    `finishedAt: ${result.finishedAt}`,
    `durationMs: ${result.durationMs}`,
    `outcomeStatus: ${result.outcome.status}`,
    `outcomeReason: ${result.outcome.reason}`,
    '',
    '--- stdout ---',
    childResult.stdout ?? '',
    '',
    '--- stderr ---',
    childResult.stderr ?? '',
  ];
  return `${lines.join('\n')}\n`;
}

function writeTranscript({ outputPath, result, childResult, command }) {
  if (!outputPath) return null;
  const resolved = path.resolve(outputPath);
  const content = buildTranscript({ result, childResult, command });
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return {
    path: displayPath(resolved),
    sizeBytes: Buffer.byteLength(content),
    sha256: sha256Text(content),
  };
}

async function prepareFixture(options) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-cli-clean-diff-'));
  if (options.patchFile) {
    const stat = fs.existsSync(options.patchFile) ? fs.statSync(options.patchFile) : null;
    if (!stat?.isFile()) {
      throw new Error(`Patch file not found: ${options.patchFile}`);
    }
  }
  fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.ca', 'personas'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'math.ts'),
    'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    'utf-8',
  );
  if (!options.patchFile) {
    fs.writeFileSync(path.join(fixtureDir, 'clean.patch'), CLEAN_FIXTURE_DIFF, 'utf-8');
  }
  const configText = options.fixture === 'invalid-config'
    ? '{ invalid json'
    : JSON.stringify(createSmokeConfig(options), null, 2);
  fs.writeFileSync(path.join(fixtureDir, '.ca', 'config.json'), configText);
  fs.writeFileSync(path.join(fixtureDir, '.ca', 'personas', 'pragmatic.md'), 'Review for concrete production bugs only.\n', 'utf-8');
  if (options.fixture === 'staged-diff') {
    prepareStagedFixture(fixtureDir);
  }
  return fixtureDir;
}

function runFixtureGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`;
    throw new Error(`Failed to prepare staged-diff fixture: git ${args.join(' ')}: ${detail.trim()}`);
  }
}

function prepareStagedFixture(fixtureDir) {
  runFixtureGit(['init', '-q'], fixtureDir);
  runFixtureGit(['config', 'user.email', 'codeagora-smoke@example.invalid'], fixtureDir);
  runFixtureGit(['config', 'user.name', 'CodeAgora Smoke'], fixtureDir);
  runFixtureGit(['add', 'src/math.ts'], fixtureDir);
  runFixtureGit(['commit', '-q', '-m', 'base fixture'], fixtureDir);
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'math.ts'),
    'export function add(a: number, b: number): number {\n  // Keep this harmless change as the staged-diff smoke fixture.\n  return a + b;\n}\n',
    'utf-8',
  );
  runFixtureGit(['add', 'src/math.ts'], fixtureDir);
}

function buildReviewArgs(cliArgs, options) {
  const inputArgs = options.fixture === 'staged-diff' ? ['--staged'] : [options.patchFile || 'clean.patch'];
  const timeoutSeconds = reviewTimeoutSeconds(options);
  return [
    ...cliArgs,
    'review',
    ...inputArgs,
    '--output',
    'json',
    '--quiet',
    '--no-cache',
    '--context-lines',
    '0',
    '--timeout',
    String(timeoutSeconds),
    '--reviewer-timeout',
    String(timeoutSeconds),
    ...(options.dryRun ? ['--dry-run'] : []),
  ];
}

async function runSmoke(options) {
  const startedAt = new Date().toISOString();
  const requiredEnvVar = providerEnvVar(options.provider);
  const providerCredentialsRequired = fixtureRequiresProviderCredentials(options);
  if (providerCredentialsRequired) {
    loadCredentialStoreIntoEnv();
  }
  const missingEnvVar = providerCredentialsRequired && !process.env[requiredEnvVar] ? requiredEnvVar : null;
  let fixtureDir = '';

  try {
    fixtureDir = await prepareFixture(options);
    const cli = resolveCliCommand(options);
    const reviewArgs = buildReviewArgs(cli.args, options);
    const command = buildCommandPreview(cli.file, reviewArgs);
    const env = {
      ...process.env,
      TMPDIR: fixtureDir,
      NODE_ENV: 'production',
      CODEAGORA_LANG: 'en',
      LANG: 'en_US.UTF-8',
      CI: '1',
    };
    if (fixtureIsolatesUserHome(options)) {
      env.HOME = fixtureDir;
      env.USERPROFILE = fixtureDir;
      env.XDG_CONFIG_HOME = fixtureDir;
    }
    if (options.fixture === 'missing-provider-key') {
      delete env[requiredEnvVar];
    } else if (options.fixture === 'provider-failure') {
      env[requiredEnvVar] = process.env.CODEAGORA_SMOKE_PROVIDER_FAILURE_KEY || PROVIDER_FAILURE_INVALID_KEY;
    }
    const childResult = missingEnvVar
      ? { stdout: '', stderr: '', exitCode: 1, signal: null, timedOut: false, durationMs: 0 }
      : await spawnCapture({
          file: cli.file,
          args: reviewArgs,
          cwd: fixtureDir,
          env,
          timeoutMs: options.timeoutMs,
        });
    const { value: parsed, error: parseError } = childResult.stdout
      ? parseJsonOutput(childResult.stdout)
      : { value: null, error: childResult.exitCode === 0 ? 'empty stdout' : null };
    const outcome = evaluateOutcome({ options, childResult, parsed, parseError, missingEnvVar });
    const finishedAt = new Date().toISOString();
    const transcriptOutputPath = resolveTranscriptOutputPath(options);
    const result = {
      schemaVersion: SCHEMA_VERSION,
      surface: 'cli',
      passed: outcome.passed,
      exitCode: childResult.exitCode,
      fixture: {
        kind: options.fixture,
        expectedDecision: hasNoExpectedReviewDecision(options.fixture) ? null : 'ACCEPT',
        expectedFindings: hasNoExpectedReviewDecision(options.fixture) ? null : 0,
        expectedExitCode: options.dryRun
          ? 0
          : options.fixture === 'invalid-config' || options.fixture === 'missing-provider-key'
            ? 2
            : RUNTIME_ERROR_FIXTURES.has(options.fixture)
              ? 3
              : 0,
        files: options.fixture === 'invalid-config' || options.fixture === 'missing-provider-key'
          ? ['.ca/config.json', 'clean.patch']
          : ['src/math.ts'],
      },
      mode: options.dryRun ? 'dry-run' : 'live',
      backend: options.backend,
      provider: options.provider,
      model: options.model,
      requiredEnvVar: fixtureRecordsRequiredEnvVar(options) ? requiredEnvVar : null,
      outcome,
      command,
      startedAt,
      finishedAt,
      durationMs: childResult.durationMs,
      cli: {
        exitCode: childResult.exitCode,
        signal: childResult.signal,
        timedOut: childResult.timedOut,
        stdoutBytes: Buffer.byteLength(childResult.stdout ?? ''),
        stderrBytes: Buffer.byteLength(childResult.stderr ?? ''),
      },
      transcript: {
        path: transcriptOutputPath ? displayPath(transcriptOutputPath) : null,
        schemaVersion: transcriptOutputPath ? 'codeagora.cli-clean-diff-smoke.transcript.v1' : null,
        stdoutCaptured: Boolean(transcriptOutputPath),
        stderrCaptured: Boolean(transcriptOutputPath),
        sha256: null,
        sizeBytes: 0,
      },
      sessionArtifact: buildSessionArtifactReference({
        parsed,
        fixtureDir,
        keepTemp: options.keepTemp,
        dryRun: options.dryRun,
        unavailableReason: options.fixture === 'invalid-config'
          ? 'invalid-config-rejected-before-session-artifact'
          : options.fixture === 'missing-provider-key'
            ? 'missing-provider-key-rejected-before-session-artifact'
          : null,
      }),
      parsed: options.dryRun ? summarizeDryRun(parsed) : summarizeReview(parsed),
      diagnostics: {
        stdoutJsonParsed: Boolean(parsed) && !parseError,
        parseError,
        stderr: childResult.stderr,
        tempDir: options.keepTemp ? fixtureDir : null,
      },
    };

    const transcript = writeTranscript({
      outputPath: transcriptOutputPath,
      result,
      childResult,
      command,
    });
    if (transcript) {
      result.transcript = {
        ...result.transcript,
        ...transcript,
      };
    }

    if (options.output) {
      fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
      fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
    }

    return result;
  } finally {
    if (fixtureDir && !options.keepTemp) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSmoke(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.outcome.status === 'pass') {
    return;
  }
  process.exit(result.outcome.status === 'blocked' ? 2 : 1);
}

export {
  CLEAN_FIXTURE_DIFF,
  createSmokeConfig,
  evaluateOutcome,
  buildSessionArtifactReference,
  buildReviewArgs,
  loadCredentialStoreIntoEnv,
  parseArgs,
  runSmoke,
  resolveTranscriptOutputPath,
  summarizeDryRun,
  summarizeReview,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const result = {
      schemaVersion: SCHEMA_VERSION,
      surface: 'cli',
      mode: 'unknown',
      outcome: {
        status: 'fail',
        passed: false,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

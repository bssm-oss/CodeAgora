/**
 * Doctor Command
 * Check environment and configuration health.
 */

import fs from 'fs/promises';
import path from 'path';
import { getSupportedProviders, getModel } from '@codeagora/core/l1/provider-registry.js';
import { loadConfigFrom } from '@codeagora/core/config/loader.js';
import { strictValidateConfig } from '@codeagora/core/config/validator.js';
import { getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';
import { detectCliBackends, type DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import { statusColor, dim } from '../utils/colors.js';
import { generateText } from 'ai';
import type { Config, AgentConfig } from '@codeagora/core/types/config.js';

// ============================================================================
// Types
// ============================================================================

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  summary: { pass: number; fail: number; warn: number };
  liveChecks?: LiveCheckResult[];
  cliBackends?: DetectedCli[];
}

export interface LiveCheckResult {
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'timeout';
  latencyMs?: number;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function checkNodeVersion(): DoctorCheck {
  const version = process.version; // e.g. "v22.0.0"
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major >= 20) {
    return { name: 'Node.js version', status: 'pass', message: `Node.js ${version}` };
  }
  return {
    name: 'Node.js version',
    status: 'fail',
    message: `Node.js ${version} — v20+ required`,
  };
}

interface ProviderKeyStatus {
  envVar: string;
  providers: string[];
  isSet: boolean;
}

interface RuntimeRequirements {
  apiProviders: Set<string>;
  cliBackends: Set<string>;
}

function getProviderKeyStatuses(): ProviderKeyStatus[] {
  const byEnvVar = new Map<string, ProviderKeyStatus>();

  for (const provider of getSupportedProviders()) {
    const envVar = getProviderEnvVar(provider);
    const status = byEnvVar.get(envVar);
    if (status) {
      status.providers.push(provider);
    } else {
      byEnvVar.set(envVar, {
        envVar,
        providers: [provider],
        isSet: Boolean(process.env[envVar]),
      });
    }
  }

  return [...byEnvVar.values()].sort((a, b) => a.envVar.localeCompare(b.envVar));
}

function formatProviderNames(providers: string[]): string {
  return providers.sort((a, b) => a.localeCompare(b)).join(', ');
}

function formatEnvVars(envVars: string[]): string {
  return envVars.sort((a, b) => a.localeCompare(b)).join(', ');
}

function addRuntimeRequirement(
  requirements: RuntimeRequirements,
  agent: { backend: string; provider?: string; enabled?: boolean },
): void {
  if (agent.enabled === false) return;
  if (agent.backend === 'api') {
    if (agent.provider) requirements.apiProviders.add(agent.provider);
    return;
  }
  requirements.cliBackends.add(agent.backend);
}

function collectRuntimeRequirements(config: Config): RuntimeRequirements {
  const requirements: RuntimeRequirements = {
    apiProviders: new Set<string>(),
    cliBackends: new Set<string>(),
  };

  if (Array.isArray(config.reviewers)) {
    for (const reviewer of config.reviewers) {
      if (!('backend' in reviewer)) continue;
      addRuntimeRequirement(requirements, reviewer);
    }
  } else {
    for (const reviewer of config.reviewers.static ?? []) {
      addRuntimeRequirement(requirements, reviewer);
    }
  }

  for (const supporter of config.supporters.pool) {
    addRuntimeRequirement(requirements, supporter);
  }
  addRuntimeRequirement(requirements, config.supporters.devilsAdvocate);
  addRuntimeRequirement(requirements, config.moderator);
  if (config.head) {
    addRuntimeRequirement(requirements, config.head);
  }

  return requirements;
}

function checkConfiguredApiCredentials(config: Config): DoctorCheck | null {
  const requirements = collectRuntimeRequirements(config);
  if (requirements.apiProviders.size === 0) return null;

  const missing = [...requirements.apiProviders]
    .map((provider) => ({ provider, envVar: getProviderEnvVar(provider) }))
    .filter(({ envVar }) => !process.env[envVar]);

  if (missing.length === 0) {
    const envVars = [...new Set([...requirements.apiProviders].map((provider) => getProviderEnvVar(provider)))];
    return {
      name: 'Configured API credentials',
      status: 'pass',
      message: `Config API credentials ready: ${formatEnvVars(envVars)}`,
    };
  }

  const details = missing
    .map(({ provider, envVar }) => `${envVar} for ${provider}`)
    .sort((a, b) => a.localeCompare(b))
    .join('; ');

  return {
    name: 'Configured API credentials',
    status: 'fail',
    message: `Missing API keys required by config: ${details}`,
  };
}

function checkConfiguredCliBackends(config: Config, cliBackends: DetectedCli[] | undefined): DoctorCheck | null {
  const requirements = collectRuntimeRequirements(config);
  if (requirements.cliBackends.size === 0) return null;

  const detectedByBackend = new Map((cliBackends ?? []).map((cli) => [cli.backend, cli]));
  const missing = [...requirements.cliBackends]
    .map((backend) => ({ backend, detected: detectedByBackend.get(backend) }))
    .filter(({ detected }) => !detected?.available)
    .map(({ backend, detected }) => (detected ? `${backend} (${detected.bin})` : backend));

  if (missing.length === 0) {
    return {
      name: 'Configured CLI backends',
      status: 'pass',
      message: `Config CLI backends ready: ${formatProviderNames([...requirements.cliBackends])}`,
    };
  }

  return {
    name: 'Configured CLI backends',
    status: 'fail',
    message: `Missing CLI backends required by config: ${missing.sort((a, b) => a.localeCompare(b)).join(', ')}`,
  };
}

function checkAvailableApiKeys(statuses: ProviderKeyStatus[], hasAvailableCli: boolean): DoctorCheck {
  const configured = statuses.filter((status) => status.isSet);
  if (configured.length > 0) {
    const providerNames = configured.flatMap((status) => status.providers);
    const envVars = configured.map((status) => status.envVar);
    return {
      name: 'Available API keys',
      status: 'pass',
      message: `API keys found for ${formatProviderNames(providerNames)} (${formatEnvVars(envVars)})`,
    };
  }

  const message = `No API keys found. Set one of: ${formatEnvVars(statuses.map((status) => status.envVar))}`;
  return {
    name: 'Available API keys',
    status: hasAvailableCli ? 'pass' : 'warn',
    message: hasAvailableCli ? `${message}. CLI backends can still run reviews.` : message,
  };
}

function checkAvailableCliBackends(cliBackends: DetectedCli[] | undefined, hasApiKey: boolean): DoctorCheck {
  const detected = cliBackends ?? [];
  const available = detected.filter((cli) => cli.available);
  if (available.length > 0) {
    const labels = available.map((cli) => `${cli.backend} (${cli.bin})`).sort((a, b) => a.localeCompare(b));
    return {
      name: 'Available CLI backends',
      status: 'pass',
      message: `CLI backends found: ${labels.join(', ')}`,
    };
  }

  const expected = detected.length > 0
    ? detected.map((cli) => `${cli.backend} (${cli.bin})`).sort((a, b) => a.localeCompare(b)).join(', ')
    : 'claude, codex, gemini, agy, copilot, agent, opencode, pi';
  return {
    name: 'Available CLI backends',
    status: hasApiKey ? 'pass' : 'warn',
    message: hasApiKey ? `No CLI backends found. API providers can still run reviews.` : `No CLI backends found. Install/auth one of: ${expected}`,
  };
}

function checkReviewBackend(hasApiKey: boolean, hasAvailableCli: boolean): DoctorCheck {
  if (hasApiKey || hasAvailableCli) {
    const mode = hasApiKey && hasAvailableCli ? 'API and CLI' : hasApiKey ? 'API' : 'CLI';
    return {
      name: 'Review backend',
      status: 'pass',
      message: `Review backend ready via ${mode}`,
    };
  }

  return {
    name: 'Review backend',
    status: 'fail',
    message: 'No review backend ready. Set an API key or install/auth a supported CLI backend.',
  };
}

// ============================================================================
// Public API
// ============================================================================

export async function runDoctor(baseDir: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  let loadedConfig: Config | null = null;
  let cliBackends: DetectedCli[] | undefined;

  // 1. Node.js version
  checks.push(checkNodeVersion());

  // 2. .ca/ directory existence
  const caDir = path.join(baseDir, '.ca');
  const caExists = await dirExists(caDir);
  checks.push({
    name: '.ca/ directory',
    status: caExists ? 'pass' : 'fail',
    message: caExists ? `.ca/ directory found` : `.ca/ directory missing — run 'agora init' to set up`,
  });

  // 3. Config file existence
  const jsonPath = path.join(caDir, 'config.json');
  const yamlPath = path.join(caDir, 'config.yaml');
  const ymlPath = path.join(caDir, 'config.yml');

  const [jsonExists, yamlExists, ymlExists] = await Promise.all([
    fileExists(jsonPath),
    fileExists(yamlPath),
    fileExists(ymlPath),
  ]);

  const configExists = jsonExists || yamlExists || ymlExists;
  const configFile = jsonExists
    ? '.ca/config.json'
    : yamlExists
    ? '.ca/config.yaml'
    : ymlExists
    ? '.ca/config.yml'
    : null;

  checks.push({
    name: 'Config file',
    status: configExists ? 'pass' : 'fail',
    message: configExists
      ? `Config: ${configFile}`
      : `Config file not found in .ca/ — run 'init' to create one`,
  });

  // 4. Config validity (only if config exists)
  if (configExists) {
    try {
      loadedConfig = await loadConfigFrom(baseDir);
      const validation = strictValidateConfig(loadedConfig);
      if (validation.valid && validation.warnings.length === 0) {
        checks.push({ name: 'Config validity', status: 'pass', message: 'Config is valid' });
      } else if (!validation.valid) {
        checks.push({
          name: 'Config validity',
          status: 'fail',
          message: `Config errors: ${validation.errors.join('; ')}`,
        });
      } else {
        checks.push({
          name: 'Config validity',
          status: 'warn',
          message: `Config warnings: ${validation.warnings.join('; ')}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({ name: 'Config validity', status: 'fail', message: `Config load failed: ${msg}` });
    }
  }

  // 5. CLI backend detection
  try {
    cliBackends = await detectCliBackends();
  } catch {
    // CLI detection is optional — skip on failure
  }

  // 6. Runtime readiness
  const providerKeyStatuses = getProviderKeyStatuses();
  const hasApiKey = providerKeyStatuses.some((status) => status.isSet);
  const hasAvailableCli = Boolean(cliBackends?.some((cli) => cli.available));

  if (loadedConfig) {
    const configuredApiCheck = checkConfiguredApiCredentials(loadedConfig);
    if (configuredApiCheck) checks.push(configuredApiCheck);

    const configuredCliCheck = checkConfiguredCliBackends(loadedConfig, cliBackends);
    if (configuredCliCheck) checks.push(configuredCliCheck);
  }

  checks.push(checkAvailableApiKeys(providerKeyStatuses, hasAvailableCli));
  checks.push(checkAvailableCliBackends(cliBackends, hasApiKey));
  checks.push(checkReviewBackend(hasApiKey, hasAvailableCli));

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
  };

  return { checks, summary, cliBackends };
}

// getProviderEnvVar is re-exported for backward compatibility
export { getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

// ============================================================================
// Live Health Check
// ============================================================================

const LIVE_CHECK_TIMEOUT_MS = 10_000;

/**
 * Collect unique provider+model pairs from all enabled agents in config.
 */
function collectAgentPairs(config: Config): Array<{ provider: string; model: string }> {
  const seen = new Set<string>();
  const pairs: Array<{ provider: string; model: string }> = [];

  function addAgent(agent: AgentConfig): void {
    if (!agent.enabled) return;
    if (agent.backend !== 'api') return;
    if (!agent.provider) return;
    const key = `${agent.provider}/${agent.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ provider: agent.provider, model: agent.model });
  }

  // reviewers
  if (Array.isArray(config.reviewers)) {
    for (const r of config.reviewers) {
      if ('auto' in r && r.auto) continue;
      addAgent(r as AgentConfig);
    }
  } else if ('static' in config.reviewers && config.reviewers.static) {
    for (const r of config.reviewers.static) {
      addAgent(r);
    }
  }

  // supporters pool
  for (const s of config.supporters.pool) {
    addAgent(s);
  }
  addAgent(config.supporters.devilsAdvocate);

  // moderator
  if (config.moderator.backend === 'api' && config.moderator.provider) {
    const key = `${config.moderator.provider}/${config.moderator.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ provider: config.moderator.provider, model: config.moderator.model });
    }
  }

  if (config.head?.enabled !== false && config.head?.backend === 'api' && config.head.provider) {
    const key = `${config.head.provider}/${config.head.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ provider: config.head.provider, model: config.head.model });
    }
  }

  return pairs;
}

async function pingModel(provider: string, model: string): Promise<LiveCheckResult> {
  const start = performance.now();
  try {
    const languageModel = getModel(provider, model);
    const abortSignal = AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS);
    await generateText({ model: languageModel, prompt: 'Say OK', abortSignal });
    const latencyMs = Math.round(performance.now() - start);
    return { provider, model, status: 'ok', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError or TimeoutError from AbortSignal.timeout
    if (
      (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
      msg.toLowerCase().includes('timeout') ||
      latencyMs >= LIVE_CHECK_TIMEOUT_MS - 100
    ) {
      return { provider, model, status: 'timeout', latencyMs, error: `timeout (${LIVE_CHECK_TIMEOUT_MS / 1000}s)` };
    }
    return { provider, model, status: 'error', latencyMs, error: msg };
  }
}

export async function runLiveHealthCheck(config: Config): Promise<LiveCheckResult[]> {
  const pairs = collectAgentPairs(config);
  if (pairs.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    pairs.map(({ provider, model }) => pingModel(provider, model))
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    // Promise itself rejected (shouldn't happen since pingModel catches internally)
    return {
      provider: pairs[i].provider,
      model: pairs[i].model,
      status: 'error' as const,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export function formatLiveCheckReport(liveChecks: LiveCheckResult[]): string {
  const lines: string[] = [];
  lines.push('Live API Check');
  lines.push('\u2500'.repeat(14));

  for (const check of liveChecks) {
    const label = `${check.provider}/${check.model}`;
    if (check.status === 'ok') {
      const latency = check.latencyMs !== undefined ? dim(`${check.latencyMs}ms`) : '';
      lines.push(`${statusColor.pass('✓')} ${label}  ${latency}`);
    } else if (check.status === 'timeout') {
      lines.push(`${statusColor.fail('✗')} ${label}  ${statusColor.fail('timeout (10s)')}`);
    } else {
      const errMsg = check.error ? statusColor.fail(check.error) : statusColor.fail('error');
      lines.push(`${statusColor.fail('✗')} ${label}  ${errMsg}`);
    }
  }

  const ok = liveChecks.filter((c) => c.status === 'ok').length;
  const failed = liveChecks.filter((c) => c.status !== 'ok').length;
  lines.push('');
  lines.push(`Live: ${statusColor.pass(String(ok))} passed, ${statusColor.fail(String(failed))} failed`);
  return lines.join('\n');
}

export function formatDoctorReport(result: DoctorResult): string {
  const lines: string[] = [];

  const blocking = result.checks.filter((check) => check.status === 'fail');
  const warnings = result.checks.filter((check) => check.status === 'warn');
  const ready = result.checks.filter((check) => check.status === 'pass');

  lines.push('Doctor Report');
  lines.push('=============');
  lines.push('');
  lines.push(
    `Summary: ${statusColor.pass(String(result.summary.pass))} passed, ${statusColor.fail(String(result.summary.fail))} failed, ${statusColor.warn(String(result.summary.warn))} warnings`
  );
  lines.push('');

  const renderSection = (title: string, checks: DoctorCheck[], iconFn: (text: string) => string): void => {
    if (checks.length === 0) return;
    lines.push(`${title} (${checks.length})`);
    for (const check of checks) {
      lines.push(`  ${iconFn(check.message)}${check.name ? ` — ${dim(check.name)}` : ''}`);
    }
    lines.push('');
  };

  renderSection('Blocking issues', blocking, (message) => statusColor.fail(`✗ ${message}`));
  renderSection('Warnings', warnings, (message) => statusColor.warn(`! ${message}`));
  renderSection('Ready checks', ready, (message) => statusColor.pass(`✓ ${message}`));

  if (result.liveChecks && result.liveChecks.length > 0) {
    lines.push('Live API check');
    lines.push('');
    lines.push(formatLiveCheckReport(result.liveChecks));
  }

  const nextSteps: string[] = [];
  const hasConfigFailure = blocking.some((check) => check.name === 'Config file' || check.name === 'Config validity');
  const hasWorkspaceFailure = blocking.some((check) => check.name === '.ca/ directory');
  const hasConfiguredApiFailure = blocking.some((check) => check.name === 'Configured API credentials');
  const hasConfiguredCliFailure = blocking.some((check) => check.name === 'Configured CLI backends');
  const hasReviewBackendFailure = blocking.some((check) => check.name === 'Review backend');
  const hasApiWarnings = warnings.some((check) => check.name === 'Available API keys');
  const hasCliWarnings = warnings.some((check) => check.name === 'Available CLI backends');

  if (hasWorkspaceFailure) {
    nextSteps.push('Run `agora init` in the workspace to create the missing project files.');
  }
  if (hasConfigFailure && !hasWorkspaceFailure) {
    nextSteps.push('Fix the config errors, then rerun `agora doctor`.');
  }
  if (hasConfiguredApiFailure) {
    nextSteps.push('Set the API keys required by `.ca/config`, then rerun `agora doctor --live`.');
  }
  if (hasConfiguredCliFailure) {
    nextSteps.push('Install or authenticate the CLI backends named in `.ca/config`, then rerun `agora doctor`.');
  }
  if (hasReviewBackendFailure) {
    nextSteps.push('Set one API key or install/auth one supported CLI backend, then rerun `agora doctor`.');
  } else if (hasApiWarnings) {
    nextSteps.push('Set an API key if you want API-backed reviews, then rerun `agora doctor --live`.');
  } else if (hasCliWarnings) {
    nextSteps.push('Install/auth a CLI backend if you want CLI-backed reviews, then rerun `agora doctor`.');
  }
  if (blocking.length === 0 && warnings.length === 0) {
    nextSteps.push('Run `agora review --dry-run` or `agora review --staged` next.');
  } else if (blocking.length === 0) {
    nextSteps.push('Rerun `agora review --dry-run` after the warnings above are resolved.');
  }

  if (nextSteps.length > 0) {
    lines.push('Next steps');
    for (const step of nextSteps) {
      lines.push(`  - ${step}`);
    }
  }

  return lines.join('\n');
}

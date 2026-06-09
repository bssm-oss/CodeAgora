/**
 * Doctor Command
 * Check environment and configuration health.
 */

import fs from 'fs/promises';
import path from 'path';
import { getSupportedProviders, getModel } from '@codeagora/core/l1/provider-registry.js';
import { loadConfigFrom } from '@codeagora/core/config/loader.js';
import { strictValidateConfig } from '@codeagora/core/config/validator.js';
import { getCredentialsPath } from '@codeagora/core/config/credentials.js';
import { getTopModels, loadModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import { getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';
import { detectCliBackends, type DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import { redactSecrets } from '@codeagora/shared/utils/redaction.js';
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
  details?: Record<string, unknown>;
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
  configuredModel?: string;
  envVar: string;
  agents: string[];
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
  autoReviewers: string[];
  agentRefs: RuntimeAgentRef[];
}

interface RuntimeAgentRef {
  id: string;
  role: string;
  backend: string;
  model: string;
  provider?: string;
  envVar?: string;
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
  role: string,
  id: string,
  model?: string,
): void {
  if (agent.enabled === false) return;
  const envVar = agent.provider ? getProviderEnvVar(agent.provider) : undefined;
  requirements.agentRefs.push({
    id,
    role,
    backend: agent.backend,
    model: model ?? 'auto',
    ...(agent.provider ? { provider: agent.provider } : {}),
    ...(envVar ? { envVar } : {}),
  });
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
    autoReviewers: [],
    agentRefs: [],
  };

  if (Array.isArray(config.reviewers)) {
    for (const reviewer of config.reviewers) {
      if (!('backend' in reviewer)) {
        if (reviewer.enabled !== false) requirements.autoReviewers.push(reviewer.id);
        continue;
      }
      addRuntimeRequirement(requirements, reviewer, 'reviewer', reviewer.id, reviewer.model);
    }
  } else {
    for (let i = 0; i < config.reviewers.count; i += 1) {
      requirements.autoReviewers.push(`auto-${i + 1}`);
    }
    for (const reviewer of config.reviewers.static ?? []) {
      addRuntimeRequirement(requirements, reviewer, 'reviewer', reviewer.id, reviewer.model);
    }
  }

  for (const supporter of config.supporters.pool) {
    addRuntimeRequirement(requirements, supporter, 'supporter', supporter.id, supporter.model);
  }
  addRuntimeRequirement(
    requirements,
    config.supporters.devilsAdvocate,
    'devilsAdvocate',
    config.supporters.devilsAdvocate.id,
    config.supporters.devilsAdvocate.model,
  );
  addRuntimeRequirement(requirements, config.moderator, 'moderator', 'moderator', config.moderator.model);
  if (config.head) {
    addRuntimeRequirement(requirements, config.head, 'head', 'head', config.head.model);
  }

  return requirements;
}

function checkConfigRuntimeMap(config: Config): DoctorCheck {
  const requirements = collectRuntimeRequirements(config);
  const apiProviders = [...requirements.apiProviders];
  const cliBackends = [...requirements.cliBackends];
  const parts = [
    `API: ${apiProviders.length > 0 ? formatProviderNames(apiProviders) : 'none'}`,
    `CLI: ${cliBackends.length > 0 ? formatProviderNames(cliBackends) : 'none'}`,
  ];
  if (requirements.autoReviewers.length > 0) {
    parts.push(`auto reviewers: ${requirements.autoReviewers.length}`);
  }
  return {
    name: 'Config runtime map',
    status: 'pass',
    message: parts.join('; '),
    details: {
      agents: requirements.agentRefs,
      autoReviewers: requirements.autoReviewers,
    },
  };
}

function looksLikeApiKey(value: string): boolean {
  if (value.length < 10) return false;
  if (/\s/.test(value)) return false;
  return true;
}

function checkConfiguredApiKeyFormats(config: Config): DoctorCheck | null {
  const requirements = collectRuntimeRequirements(config);
  const envVars = [...new Set([...requirements.apiProviders].map((provider) => getProviderEnvVar(provider)))];
  const unusual = envVars.filter((envVar) => process.env[envVar] && !looksLikeApiKey(process.env[envVar] ?? ''));
  if (envVars.length === 0 || unusual.length === 0) return null;

  return {
    name: 'Configured API key formats',
    status: 'warn',
    message: `Configured API keys look unusual: ${formatEnvVars(unusual)}`,
    details: { unusualEnvVars: unusual },
  };
}

async function checkCredentialStore(hasApiKey: boolean): Promise<DoctorCheck> {
  const credentialsPath = getCredentialsPath();
  try {
    const stat = await fs.stat(credentialsPath);
    const mode = stat.mode & 0o777;
    if (process.platform !== 'win32' && mode !== 0o600) {
      return {
        name: 'Credential store',
        status: 'warn',
        message: `Credential file permissions are 0o${mode.toString(8)}; expected 0o600`,
        details: { path: credentialsPath, mode: `0o${mode.toString(8)}`, expectedMode: '0o600' },
      };
    }
    return {
      name: 'Credential store',
      status: 'pass',
      message: `Credential file present (${credentialsPath})`,
      details: { path: credentialsPath, mode: process.platform === 'win32' ? 'n/a' : `0o${mode.toString(8)}` },
    };
  } catch {
    return {
      name: 'Credential store',
      status: hasApiKey ? 'pass' : 'warn',
      message: hasApiKey
        ? 'Credential file not found; using API keys from environment'
        : 'Credential file not found; run first-run setup or export an API key',
      details: { path: credentialsPath, exists: false },
    };
  }
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
      details: {
        providers: [...requirements.apiProviders].map((provider) => ({
          provider,
          envVar: getProviderEnvVar(provider),
          set: true,
        })),
      },
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
    details: { missing },
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
      details: {
        backends: [...requirements.cliBackends].map((backend) => detectedByBackend.get(backend)).filter(Boolean),
      },
    };
  }

  return {
    name: 'Configured CLI backends',
    status: 'fail',
    message: `Missing CLI backends required by config: ${missing.sort((a, b) => a.localeCompare(b)).join(', ')}`,
    details: { missing },
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
      details: {
        keys: configured.map((status) => ({
          envVar: status.envVar,
          providers: status.providers,
        })),
      },
    };
  }

  const message = `No API keys found. Set one of: ${formatEnvVars(statuses.map((status) => status.envVar))}`;
  return {
    name: 'Available API keys',
    status: hasAvailableCli ? 'pass' : 'warn',
    message: hasAvailableCli ? `${message}. CLI backends can still run reviews.` : message,
    details: { expectedEnvVars: statuses.map((status) => status.envVar) },
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
      details: { backends: available },
    };
  }

  const expected = detected.length > 0
    ? detected.map((cli) => `${cli.backend} (${cli.bin})`).sort((a, b) => a.localeCompare(b)).join(', ')
    : 'claude, codex, gemini, agy, copilot, agent, opencode, pi';
  return {
    name: 'Available CLI backends',
    status: hasApiKey ? 'pass' : 'warn',
    message: hasApiKey ? `No CLI backends found. API providers can still run reviews.` : `No CLI backends found. Install/auth one of: ${expected}`,
    details: { checked: detected },
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

function summarizeChecks(checks: DoctorCheck[]): DoctorResult['summary'] {
  return {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
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
    checks.push(checkConfigRuntimeMap(loadedConfig));

    const configuredApiCheck = checkConfiguredApiCredentials(loadedConfig);
    if (configuredApiCheck) checks.push(configuredApiCheck);

    const apiKeyFormatCheck = checkConfiguredApiKeyFormats(loadedConfig);
    if (apiKeyFormatCheck) checks.push(apiKeyFormatCheck);

    const configuredCliCheck = checkConfiguredCliBackends(loadedConfig, cliBackends);
    if (configuredCliCheck) checks.push(configuredCliCheck);
  }

  checks.push(await checkCredentialStore(hasApiKey));
  checks.push(checkAvailableApiKeys(providerKeyStatuses, hasAvailableCli));
  checks.push(checkAvailableCliBackends(cliBackends, hasApiKey));
  checks.push(checkReviewBackend(hasApiKey, hasAvailableCli));

  return { checks, summary: summarizeChecks(checks), cliBackends };
}

function summarizeLiveHealth(liveChecks: LiveCheckResult[]): DoctorCheck {
  if (liveChecks.length === 0) {
    return {
      name: 'Live API health',
      status: 'pass',
      message: 'No enabled API agents to ping; live API check skipped',
    };
  }

  const ok = liveChecks.filter((check) => check.status === 'ok').length;
  const failed = liveChecks.length - ok;
  if (failed === 0) {
    return {
      name: 'Live API health',
      status: 'pass',
      message: `Live API check passed for ${ok}/${liveChecks.length} provider/model pairs`,
    };
  }

  const failedLabels = liveChecks
    .filter((check) => check.status !== 'ok')
    .map((check) => `${check.provider}/${check.model}`)
    .join(', ');
  return {
    name: 'Live API health',
    status: 'fail',
    message: `Live API check failed for ${failed}/${liveChecks.length}: ${failedLabels}`,
  };
}

export async function runDoctorWithLive(baseDir: string): Promise<DoctorResult> {
  const result = await runDoctor(baseDir);

  try {
    const config = await loadConfigFrom(baseDir);
    result.liveChecks = await runLiveHealthCheck(config);
    result.checks.push(summarizeLiveHealth(result.liveChecks));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.checks.push({
      name: 'Live API health',
      status: 'fail',
      message: `Live check setup failed: ${redactSecrets(msg)}`,
    });
  }

  result.summary = summarizeChecks(result.checks);
  return result;
}

// getProviderEnvVar is re-exported for backward compatibility
export { getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

// ============================================================================
// Live Health Check
// ============================================================================

const LIVE_CHECK_TIMEOUT_MS = 30_000;

const HEALTH_CHECK_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.3-codex',
  openrouter: 'xiaomi/mimo-v2.5',
  'opencode-go': 'deepseek-v4-flash',
  'opencode-zen': 'gpt-5.4-mini',
  groq: 'llama-3.3-70b-versatile',
};

interface LiveAgentPair {
  provider: string;
  model: string;
  configuredModel?: string;
  envVar: string;
  agents: string[];
}

function resolveHealthCheckModel(provider: string, model: string, fallbackModels: Map<string, string>): { model: string; configuredModel?: string } {
  if (model !== 'auto') return { model };
  const resolved = fallbackModels.get(provider);
  if (resolved) {
    return { model: resolved, configuredModel: model };
  }
  return { model, configuredModel: model };
}

function pickFallbackHealthCheckModel(provider: string, catalog: Awaited<ReturnType<typeof loadModelsCatalog>>): string | undefined {
  const configuredDefault = HEALTH_CHECK_DEFAULT_MODELS[provider];
  if (configuredDefault) return configuredDefault;

  const ranked = getTopModels(catalog, provider, 20);
  const paid = ranked.find((model) => ((model.cost?.input ?? 0) + (model.cost?.output ?? 0)) > 0);
  return paid?.id ?? ranked[0]?.id;
}

/**
 * Collect unique provider+model pairs from all enabled agents in config.
 */
function collectAgentPairs(config: Config, fallbackModels: Map<string, string>): LiveAgentPair[] {
  const pairsByKey = new Map<string, LiveAgentPair>();

  function addPair(provider: string, configuredModel: string, agentLabel: string): void {
    const resolved = resolveHealthCheckModel(provider, configuredModel, fallbackModels);
    const key = `${provider}/${resolved.model}`;
    const existing = pairsByKey.get(key);
    if (existing) {
      existing.agents.push(agentLabel);
      return;
    }
    pairsByKey.set(key, {
      provider,
      model: resolved.model,
      ...(resolved.configuredModel ? { configuredModel: resolved.configuredModel } : {}),
      envVar: getProviderEnvVar(provider),
      agents: [agentLabel],
    });
  }

  function addAgent(agent: AgentConfig, role: string): void {
    if (!agent.enabled) return;
    if (agent.backend !== 'api') return;
    if (!agent.provider) return;
    addPair(agent.provider, agent.model, `${role}:${agent.id}`);
  }

  // reviewers
  if (Array.isArray(config.reviewers)) {
    for (const r of config.reviewers) {
      if ('auto' in r && r.auto) continue;
      addAgent(r as AgentConfig, 'reviewer');
    }
  } else if ('static' in config.reviewers && config.reviewers.static) {
    for (const r of config.reviewers.static) {
      addAgent(r, 'reviewer');
    }
  }

  // supporters pool
  for (const s of config.supporters.pool) {
    addAgent(s, 'supporter');
  }
  addAgent(config.supporters.devilsAdvocate, 'devilsAdvocate');

  // moderator
  if (config.moderator.backend === 'api' && config.moderator.provider) {
    addPair(config.moderator.provider, config.moderator.model, 'moderator');
  }

  if (config.head?.enabled !== false && config.head?.backend === 'api' && config.head.provider) {
    addPair(config.head.provider, config.head.model, 'head');
  }

  return [...pairsByKey.values()];
}

async function pingModel(pair: LiveAgentPair): Promise<LiveCheckResult> {
  const { provider, model, configuredModel, envVar, agents } = pair;
  const start = performance.now();
  try {
    const languageModel = getModel(provider, model);
    const abortSignal = AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS);
    await generateText({ model: languageModel, prompt: 'Say OK', abortSignal });
    const latencyMs = Math.round(performance.now() - start);
    return { provider, model, ...(configuredModel ? { configuredModel } : {}), envVar, agents, status: 'ok', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError or TimeoutError from AbortSignal.timeout
    if (
      (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
      msg.toLowerCase().includes('timeout') ||
      latencyMs >= LIVE_CHECK_TIMEOUT_MS - 100
    ) {
      return { provider, model, ...(configuredModel ? { configuredModel } : {}), envVar, agents, status: 'timeout', latencyMs, error: `timeout (${LIVE_CHECK_TIMEOUT_MS / 1000}s)` };
    }
    return { provider, model, ...(configuredModel ? { configuredModel } : {}), envVar, agents, status: 'error', latencyMs, error: redactSecrets(msg) };
  }
}

export async function runLiveHealthCheck(config: Config): Promise<LiveCheckResult[]> {
  const fallbackModels = new Map<string, string>();
  const providers = collectRuntimeRequirements(config).apiProviders;
  for (const provider of providers) {
    const configuredDefault = HEALTH_CHECK_DEFAULT_MODELS[provider];
    if (configuredDefault) fallbackModels.set(provider, configuredDefault);
  }

  try {
    const catalog = await loadModelsCatalog();
    for (const provider of providers) {
      if (fallbackModels.has(provider)) continue;
      const model = pickFallbackHealthCheckModel(provider, catalog);
      if (model) fallbackModels.set(provider, model);
    }
  } catch {
    // Catalog lookup is a best-effort improvement for model:auto health checks.
  }

  const pairs = collectAgentPairs(config, fallbackModels);
  if (pairs.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    pairs.map((pair) => pingModel(pair))
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    // Promise itself rejected (shouldn't happen since pingModel catches internally)
    return {
      provider: pairs[i].provider,
      model: pairs[i].model,
      ...(pairs[i].configuredModel ? { configuredModel: pairs[i].configuredModel } : {}),
      envVar: pairs[i].envVar,
      agents: pairs[i].agents,
      status: 'error' as const,
      error: redactSecrets(result.reason instanceof Error ? result.reason.message : String(result.reason)),
    };
  });
}

export function formatLiveCheckReport(liveChecks: LiveCheckResult[]): string {
  const lines: string[] = [];
  lines.push('Live API Check');
  lines.push('\u2500'.repeat(14));

  for (const check of liveChecks) {
    const configured = check.configuredModel ? dim(`configured=${check.configuredModel}`) : '';
    const label = `${check.provider}/${check.model}`;
    const agents = check.agents.length > 0 ? dim(`used by ${check.agents.join(', ')}`) : '';
    const envVar = dim(check.envVar);
    if (check.status === 'ok') {
      const latency = check.latencyMs !== undefined ? dim(`${check.latencyMs}ms`) : '';
      lines.push(`${statusColor.pass('✓')} ${label}  ${latency}  ${envVar}  ${configured}  ${agents}`);
    } else if (check.status === 'timeout') {
      lines.push(`${statusColor.fail('✗')} ${label}  ${statusColor.fail(`timeout (${LIVE_CHECK_TIMEOUT_MS / 1000}s)`)}  ${envVar}  ${configured}  ${agents}`);
    } else {
      const errMsg = check.error ? statusColor.fail(check.error) : statusColor.fail('error');
      lines.push(`${statusColor.fail('✗')} ${label}  ${errMsg}  ${envVar}  ${configured}  ${agents}`);
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

  const renderDetails = (check: DoctorCheck): void => {
    if (!check.details) return;
    if (check.name === 'Config runtime map' && Array.isArray(check.details.agents)) {
      const agents = check.details.agents as RuntimeAgentRef[];
      for (const agent of agents.slice(0, 10)) {
        const provider = agent.provider ? ` provider=${agent.provider}` : '';
        const envVar = agent.envVar ? ` env=${agent.envVar}` : '';
        lines.push(`      ${agent.role}:${agent.id} backend=${agent.backend}${provider} model=${agent.model}${envVar}`);
      }
      if (agents.length > 10) {
        lines.push(`      ... and ${agents.length - 10} more configured agents`);
      }
    }
    if (check.name === 'Credential store' && typeof check.details.path === 'string') {
      lines.push(`      path: ${check.details.path}`);
    }
  };

  const renderSection = (title: string, checks: DoctorCheck[], iconFn: (text: string) => string): void => {
    if (checks.length === 0) return;
    lines.push(`${title} (${checks.length})`);
    for (const check of checks) {
      lines.push(`  ${iconFn(check.message)}${check.name ? ` — ${dim(check.name)}` : ''}`);
      renderDetails(check);
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
  const hasLiveHealthFailure = blocking.some((check) => check.name === 'Live API health');
  const hasApiWarnings = warnings.some((check) => check.name === 'Available API keys');
  const hasCliWarnings = warnings.some((check) => check.name === 'Available CLI backends');

  if (hasWorkspaceFailure) {
    nextSteps.push('Run `agora init` in the workspace to create the missing project files.');
  }
  if (hasConfigFailure && !hasWorkspaceFailure) {
    nextSteps.push('Fix the config errors, then rerun `agora doctor`.');
  }
  if (hasConfiguredApiFailure) {
    nextSteps.push('Run `agora env set <provider> <api-key>` for the missing provider, then rerun `agora doctor --live`.');
  }
  if (hasConfiguredCliFailure) {
    nextSteps.push('Install or authenticate the CLI backends named in `.ca/config`, then rerun `agora doctor`.');
  }
  if (hasReviewBackendFailure) {
    nextSteps.push('Run `agora env set openrouter <api-key>` or install/auth one supported CLI backend, then rerun `agora doctor`.');
  }
  if (hasLiveHealthFailure && !hasConfiguredApiFailure) {
    nextSteps.push('Fix the live provider errors above, then rerun `agora doctor --live`.');
  } else if (hasApiWarnings) {
    nextSteps.push('Run `agora env set openrouter <api-key>` if you want API-backed reviews, then rerun `agora doctor --live`.');
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

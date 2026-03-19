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

// ============================================================================
// Public API
// ============================================================================

export async function runDoctor(baseDir: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  // 1. Node.js version
  checks.push(checkNodeVersion());

  // 2. .ca/ directory existence
  const caDir = path.join(baseDir, '.ca');
  const caExists = await dirExists(caDir);
  checks.push({
    name: '.ca/ directory',
    status: caExists ? 'pass' : 'warn',
    message: caExists ? `.ca/ directory found` : `.ca/ directory missing — run 'init' first`,
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
      const config = await loadConfigFrom(baseDir);
      const validation = strictValidateConfig(config);
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

  // 5. Provider API keys
  const providers = getSupportedProviders();
  for (const provider of providers) {
    // Derive the env var name from PROVIDER_FACTORIES indirectly via provider name convention
    // We'll read the env var by looking up what the registry exposes
    const envVarName = getProviderEnvVar(provider);
    const isSet = Boolean(process.env[envVarName]);
    checks.push({
      name: `${envVarName}`,
      status: isSet ? 'pass' : 'warn',
      message: isSet ? `${envVarName}: set` : `${envVarName}: missing`,
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
  };

  return { checks, summary };
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
  for (const check of result.checks) {
    const icon =
      check.status === 'pass'
        ? statusColor.pass('✓')
        : check.status === 'fail'
        ? statusColor.fail('✗')
        : statusColor.warn('!');
    lines.push(`${icon} ${check.message}`);
  }
  lines.push('');
  lines.push(
    `Summary: ${statusColor.pass(String(result.summary.pass))} passed, ${statusColor.fail(String(result.summary.fail))} failed, ${statusColor.warn(String(result.summary.warn))} warnings`
  );

  if (result.liveChecks && result.liveChecks.length > 0) {
    lines.push('');
    lines.push(formatLiveCheckReport(result.liveChecks));
  }

  return lines.join('\n');
}

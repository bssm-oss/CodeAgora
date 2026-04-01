/**
 * Unified Environment Detection
 * Combines API provider key detection and CLI backend availability
 * into a single EnvironmentReport.
 */
import { PROVIDER_ENV_VARS } from '../providers/env-vars.js';
import { detectCliBackends } from './cli-detect.js';
/**
 * Detect the full environment: API provider keys + CLI backends.
 *
 * - Iterates PROVIDER_ENV_VARS and checks process.env for each.
 * - Runs detectCliBackends() in parallel with the env-var scan.
 * - Never throws — always returns a complete report.
 */
export async function detectEnvironment() {
    const [cliBackends] = await Promise.all([detectCliBackends()]);
    const apiProviders = Object.entries(PROVIDER_ENV_VARS)
        .map(([provider, envVar]) => ({
        provider,
        envVar,
        available: Boolean(process.env[envVar]),
    }))
        .sort((a, b) => a.provider.localeCompare(b.provider));
    return { apiProviders, cliBackends };
}

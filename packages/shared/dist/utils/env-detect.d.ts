/**
 * Unified Environment Detection
 * Combines API provider key detection and CLI backend availability
 * into a single EnvironmentReport.
 */
import { type DetectedCli } from './cli-detect.js';
export interface ApiProviderStatus {
    provider: string;
    envVar: string;
    available: boolean;
}
export interface EnvironmentReport {
    apiProviders: ApiProviderStatus[];
    cliBackends: DetectedCli[];
}
/**
 * Detect the full environment: API provider keys + CLI backends.
 *
 * - Iterates PROVIDER_ENV_VARS and checks process.env for each.
 * - Runs detectCliBackends() in parallel with the env-var scan.
 * - Never throws — always returns a complete report.
 */
export declare function detectEnvironment(): Promise<EnvironmentReport>;
//# sourceMappingURL=env-detect.d.ts.map
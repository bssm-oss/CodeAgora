/**
 * Provider Environment Variable Mapping
 * Single source of truth for provider name → API key env var mapping.
 */
export declare const PROVIDER_ENV_VARS: Record<string, string>;
/**
 * Get the env var name for a provider. Falls back to PROVIDER_API_KEY convention.
 */
export declare function getProviderEnvVar(provider: string): string;
//# sourceMappingURL=env-vars.d.ts.map
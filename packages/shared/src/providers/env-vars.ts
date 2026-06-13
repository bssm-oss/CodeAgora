/**
 * Provider Environment Variable Mapping
 * Single source of truth for provider name → API key env var mapping.
 */

export const PROVIDER_ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
  'opencode-zen': 'OPENCODE_API_KEY',
  groq: 'GROQ_API_KEY',
} as const;

export type SupportedProviderName = keyof typeof PROVIDER_ENV_VARS;

export const SUPPORTED_PROVIDER_NAMES = Object.freeze(
  Object.keys(PROVIDER_ENV_VARS) as SupportedProviderName[]
);

/**
 * Get the env var name for a provider. Falls back to PROVIDER_API_KEY convention.
 */
export function getProviderEnvVar(provider: string): string {
  if (provider in PROVIDER_ENV_VARS) {
    return PROVIDER_ENV_VARS[provider as SupportedProviderName];
  }
  return `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

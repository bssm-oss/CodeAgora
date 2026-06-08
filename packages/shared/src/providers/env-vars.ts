/**
 * Provider Environment Variable Mapping
 * Single source of truth for provider name → API key env var mapping.
 */

export const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
  'opencode-zen': 'OPENCODE_API_KEY',
  groq: 'GROQ_API_KEY',
};

/**
 * Get the env var name for a provider. Falls back to PROVIDER_API_KEY convention.
 */
export function getProviderEnvVar(provider: string): string {
  return PROVIDER_ENV_VARS[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

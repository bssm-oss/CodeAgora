/**
 * Provider Environment Variable Mapping
 * Single source of truth for provider name → API key env var mapping.
 */
export const PROVIDER_ENV_VARS = {
    'nvidia-nim': 'NVIDIA_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    together: 'TOGETHER_API_KEY',
    xai: 'XAI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    qwen: 'QWEN_API_KEY',
    zai: 'ZAI_API_KEY',
    'github-models': 'GITHUB_TOKEN',
    'github-copilot': 'GITHUB_COPILOT_TOKEN',
    fireworks: 'FIREWORKS_API_KEY',
    cohere: 'COHERE_API_KEY',
    deepinfra: 'DEEPINFRA_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    huggingface: 'HUGGINGFACE_API_KEY',
    baseten: 'BASETEN_API_KEY',
    siliconflow: 'SILICONFLOW_API_KEY',
    novita: 'NOVITA_API_KEY',
};
/**
 * Get the env var name for a provider. Falls back to PROVIDER_API_KEY convention.
 */
export function getProviderEnvVar(provider) {
    return PROVIDER_ENV_VARS[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

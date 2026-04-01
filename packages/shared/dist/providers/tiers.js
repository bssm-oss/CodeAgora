/**
 * Provider Tier Definitions
 * Single source of truth for provider support tiers.
 *
 * Tier 1: Official — directly tested, issue response guaranteed
 * Tier 2: Verified — confirmed working, best-effort support
 * Tier 3: Experimental — community/experimental, no guarantee
 */
export const TIER_LABELS = {
    1: { label: 'Official', labelKo: '공식' },
    2: { label: 'Verified', labelKo: '검증됨' },
    3: { label: 'Experimental', labelKo: '실험적' },
};
// ============================================================================
// API Provider Tiers
// ============================================================================
export const API_PROVIDER_TIERS = {
    // Tier 1 — Official
    groq: 1,
    anthropic: 1,
    // Tier 2 — Verified
    openai: 2,
    google: 2,
    deepseek: 2,
    openrouter: 2,
    // Tier 3 — Experimental
    'nvidia-nim': 3,
    mistral: 3,
    cerebras: 3,
    together: 3,
    xai: 3,
    qwen: 3,
    zai: 3,
    'github-models': 3,
    'github-copilot': 3,
    fireworks: 3,
    cohere: 3,
    deepinfra: 3,
    moonshot: 3,
    perplexity: 3,
    huggingface: 3,
    baseten: 3,
    siliconflow: 3,
    novita: 3,
};
// ============================================================================
// CLI Backend Tiers
// ============================================================================
export const CLI_BACKEND_TIERS = {
    // Tier 1
    claude: 1,
    gemini: 1,
    codex: 1,
    // Tier 2
    copilot: 2,
    cursor: 2,
    // Tier 3
    aider: 3,
    cline: 3,
    opencode: 3,
    'qwen-code': 3,
    vibe: 3,
    goose: 3,
    kiro: 3,
};
// ============================================================================
// Helpers
// ============================================================================
export function getProviderTier(provider) {
    return API_PROVIDER_TIERS[provider] ?? 3;
}
export function getCliBackendTier(backend) {
    return CLI_BACKEND_TIERS[backend] ?? 3;
}
/**
 * Get all API providers for a given tier.
 */
export function getProvidersByTier(tier) {
    return Object.entries(API_PROVIDER_TIERS)
        .filter(([, t]) => t === tier)
        .map(([name]) => name);
}

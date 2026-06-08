/**
 * Provider Tier Definitions
 * Single source of truth for provider support tiers.
 *
 * Tier 1: Official — directly tested, issue response guaranteed
 * Tier 2: Verified — confirmed working, best-effort support
 * Tier 3: Experimental — community/experimental, no guarantee
 */

export type ProviderTier = 1 | 2 | 3;

export interface ProviderTierInfo {
  tier: ProviderTier;
  label: string;
  labelKo: string;
}

export const TIER_LABELS: Record<ProviderTier, { label: string; labelKo: string }> = {
  1: { label: 'Official', labelKo: '공식' },
  2: { label: 'Verified', labelKo: '검증됨' },
  3: { label: 'Experimental', labelKo: '실험적' },
};

// ============================================================================
// API Provider Tiers
// ============================================================================

export const API_PROVIDER_TIERS: Record<string, ProviderTier> = {
  // Tier 1 — Official
  anthropic: 1,
  openai: 1,
  openrouter: 1,
  groq: 1,

  // Tier 2 — Verified
  'opencode-go': 2,
  'opencode-zen': 2,
};

// ============================================================================
// CLI Backend Tiers
// ============================================================================

export const CLI_BACKEND_TIERS: Record<string, ProviderTier> = {
  // Tier 1
  claude: 1,
  codex: 1,
  gemini: 1,
  opencode: 1,

  // Tier 2
  antigravity: 2,
  copilot: 2,
  cursor: 2,
  pi: 2,
};

// ============================================================================
// Helpers
// ============================================================================

export function getProviderTier(provider: string): ProviderTier {
  return API_PROVIDER_TIERS[provider] ?? 3;
}

export function getCliBackendTier(backend: string): ProviderTier {
  return CLI_BACKEND_TIERS[backend] ?? 3;
}

/**
 * Get all API providers for a given tier.
 */
export function getProvidersByTier(tier: ProviderTier): string[] {
  return Object.entries(API_PROVIDER_TIERS)
    .filter(([, t]) => t === tier)
    .map(([name]) => name);
}

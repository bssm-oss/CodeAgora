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
export declare const TIER_LABELS: Record<ProviderTier, {
    label: string;
    labelKo: string;
}>;
export declare const API_PROVIDER_TIERS: Record<string, ProviderTier>;
export declare const CLI_BACKEND_TIERS: Record<string, ProviderTier>;
export declare function getProviderTier(provider: string): ProviderTier;
export declare function getCliBackendTier(backend: string): ProviderTier;
/**
 * Get all API providers for a given tier.
 */
export declare function getProvidersByTier(tier: ProviderTier): string[];
//# sourceMappingURL=tiers.d.ts.map
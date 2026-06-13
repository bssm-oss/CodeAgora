import { getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';
import type { ProviderStatus } from './api/desktop-bridge.types.js';

export interface ConfigPolicyReadiness {
  activeReviewers: number | undefined;
  complete: boolean;
  validJson: boolean;
}

export interface ProviderCredentialRequirement {
  provider: string;
  envVar: string;
  configured: boolean;
  sourceCount: number;
}

export function isEnabledConfigEntry(value: unknown): boolean {
  return typeof value !== 'object' || value === null || Array.isArray(value)
    ? true
    : (value as { enabled?: unknown }).enabled !== false;
}

export function activeReviewerCount(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.filter((entry) => isEnabledConfigEntry(entry)).length;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const reviewers = value as { count?: unknown; static?: unknown };
  if (typeof reviewers.count === 'number' && Number.isFinite(reviewers.count)) {
    return Math.max(0, Math.trunc(reviewers.count));
  }

  if (Array.isArray(reviewers.static)) {
    return reviewers.static.filter((entry) => isEnabledConfigEntry(entry)).length;
  }

  return undefined;
}

export function evaluateConfigPolicy(raw: string): ConfigPolicyReadiness {
  try {
    const parsed = JSON.parse(raw) as { reviewers?: unknown };
    const activeReviewers = activeReviewerCount(parsed.reviewers);
    return {
      activeReviewers,
      complete: (activeReviewers ?? 0) > 0,
      validJson: true,
    };
  } catch {
    return {
      activeReviewers: undefined,
      complete: false,
      validJson: false,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function addAgentProvider(
  value: unknown,
  providers: Map<string, { provider: string; sourceCount: number }>,
): void {
  const agent = asRecord(value);
  if (!agent || agent.enabled === false) return;
  const backend = typeof agent.backend === 'string' ? agent.backend : 'api';
  const provider = typeof agent.provider === 'string' ? agent.provider.trim() : '';
  if (backend !== 'api' || !provider) return;

  const key = provider.toLowerCase();
  const existing = providers.get(key);
  providers.set(key, {
    provider: existing?.provider ?? provider,
    sourceCount: (existing?.sourceCount ?? 0) + 1,
  });
}

function addAgentListProviders(
  value: unknown,
  providers: Map<string, { provider: string; sourceCount: number }>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) addAgentProvider(entry, providers);
    return;
  }

  const declarative = asRecord(value);
  if (Array.isArray(declarative?.static)) {
    for (const entry of declarative.static) addAgentProvider(entry, providers);
  }
}

export function configuredApiProviders(raw: string): string[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!asRecord(parsed)) return [];

  const providers = new Map<string, { provider: string; sourceCount: number }>();
  addAgentListProviders(parsed.reviewers, providers);

  const supporters = asRecord(parsed.supporters);
  if (supporters) {
    addAgentListProviders(supporters.pool, providers);
    addAgentProvider(supporters.devilsAdvocate, providers);
  }

  addAgentProvider(parsed.moderator, providers);
  addAgentProvider(parsed.head, providers);

  return [...providers.values()].map((entry) => entry.provider);
}

function providerStatusMatchesProvider(status: ProviderStatus, provider: string, envVar: string): boolean {
  const statusName = status.name.toLowerCase();
  const normalizedProvider = provider.toLowerCase();
  return status.envVar === envVar ||
    statusName === normalizedProvider ||
    statusName.includes(normalizedProvider);
}

export function providerCredentialRequirements(
  raw: string,
  statuses: ProviderStatus[],
): ProviderCredentialRequirement[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!asRecord(parsed)) return [];

  const providers = new Map<string, { provider: string; sourceCount: number }>();
  addAgentListProviders(parsed.reviewers, providers);

  const supporters = asRecord(parsed.supporters);
  if (supporters) {
    addAgentListProviders(supporters.pool, providers);
    addAgentProvider(supporters.devilsAdvocate, providers);
  }

  addAgentProvider(parsed.moderator, providers);
  addAgentProvider(parsed.head, providers);

  return [...providers.values()].map(({ provider, sourceCount }) => {
    const envVar = getProviderEnvVar(provider);
    return {
      provider,
      envVar,
      sourceCount,
      configured: statuses.some((status) =>
        status.kind === 'api' &&
        status.configured &&
        providerStatusMatchesProvider(status, provider, envVar),
      ),
    };
  });
}

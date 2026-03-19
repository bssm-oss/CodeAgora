/**
 * Config Migrator
 * Migrates CLI backends (opencode/codex/gemini/claude) to API backend.
 */

import type { Config, AgentConfig, ReviewerEntry } from '../types/config.js';

// ============================================================================
// Types
// ============================================================================

export interface MigrationChange {
  reviewerId: string;
  from: { backend: string; provider?: string };
  to: { backend: 'api'; provider: string };
}

export interface MigrationResult {
  migrated: boolean;
  changes: MigrationChange[];
  warnings: string[];
}

// ============================================================================
// CLI Backend → API Provider Mapping
// ============================================================================

const BACKEND_TO_PROVIDER: Record<string, string> = {
  opencode: 'openrouter', // OpenCode uses OpenRouter
  codex: 'openrouter',    // Default mapping
  gemini: 'google',
  claude: 'openrouter',   // Via OpenRouter
};

const CLI_BACKENDS = new Set(Object.keys(BACKEND_TO_PROVIDER));

// ============================================================================
// Pure helpers
// ============================================================================

function isCliBackend(backend: string): boolean {
  return CLI_BACKENDS.has(backend);
}

function isAgentConfig(entry: ReviewerEntry): entry is AgentConfig {
  return !('auto' in entry && entry.auto === true);
}

function migrateAgentConfig(
  agent: AgentConfig,
  changes: MigrationChange[],
  warnings: string[]
): AgentConfig {
  if (!isCliBackend(agent.backend)) {
    return agent;
  }

  const mappedProvider = BACKEND_TO_PROVIDER[agent.backend];
  if (!mappedProvider) {
    warnings.push(
      `Reviewer '${agent.id}': unknown backend '${agent.backend}', skipping migration`
    );
    return agent;
  }

  // Use explicitly set provider if present, otherwise use mapped provider
  const targetProvider = agent.provider ?? mappedProvider;

  changes.push({
    reviewerId: agent.id,
    from: { backend: agent.backend, provider: agent.provider },
    to: { backend: 'api', provider: targetProvider },
  });

  const migrated: AgentConfig = {
    ...agent,
    backend: 'api',
    provider: targetProvider,
  };

  // Migrate fallback if present
  if (agent.fallback && isCliBackend(agent.fallback.backend)) {
    const fallbackProvider =
      agent.fallback.provider ?? BACKEND_TO_PROVIDER[agent.fallback.backend] ?? mappedProvider;
    migrated.fallback = {
      ...agent.fallback,
      backend: 'api',
      provider: fallbackProvider,
    };
  }

  return migrated;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns true if the config contains any CLI-backed agents.
 */
export function needsMigration(config: Config): boolean {
  // Check reviewers
  if (Array.isArray(config.reviewers)) {
    for (const entry of config.reviewers) {
      if (isAgentConfig(entry) && isCliBackend(entry.backend)) {
        return true;
      }
    }
  } else {
    // Declarative reviewers: check static entries
    for (const entry of config.reviewers.static ?? []) {
      if (isCliBackend(entry.backend)) {
        return true;
      }
    }
  }

  // Check supporter pool
  for (const s of config.supporters.pool) {
    if (isCliBackend(s.backend)) return true;
  }

  // Check devil's advocate
  if (isCliBackend(config.supporters.devilsAdvocate.backend)) {
    return true;
  }

  // Check moderator
  if (isCliBackend(config.moderator.backend)) {
    return true;
  }

  return false;
}

/**
 * Analyzes the config and returns a description of required changes.
 * Pure function — does not modify the config.
 */
export function migrateConfig(config: Config): MigrationResult {
  const changes: MigrationChange[] = [];
  const warnings: string[] = [];

  // Migrate reviewers
  if (Array.isArray(config.reviewers)) {
    for (const entry of config.reviewers) {
      if (isAgentConfig(entry)) {
        migrateAgentConfig(entry, changes, warnings);
      }
    }
  } else {
    // Declarative reviewers: migrate static entries
    for (const entry of config.reviewers.static ?? []) {
      migrateAgentConfig(entry, changes, warnings);
    }
  }

  // Migrate supporter pool
  for (const s of config.supporters.pool) {
    migrateAgentConfig(s, changes, warnings);
  }

  // Migrate devil's advocate
  migrateAgentConfig(config.supporters.devilsAdvocate, changes, warnings);

  // Migrate moderator (treated as an agent for consistency)
  if (isCliBackend(config.moderator.backend)) {
    const mappedProvider = BACKEND_TO_PROVIDER[config.moderator.backend];
    if (mappedProvider) {
      const targetProvider = config.moderator.provider ?? mappedProvider;
      changes.push({
        reviewerId: 'moderator',
        from: { backend: config.moderator.backend, provider: config.moderator.provider },
        to: { backend: 'api', provider: targetProvider },
      });
    } else {
      warnings.push(
        `Moderator: unknown backend '${config.moderator.backend}', skipping migration`
      );
    }
  }

  return {
    migrated: changes.length > 0,
    changes,
    warnings,
  };
}

/**
 * Applies a MigrationResult to a config and returns the updated config.
 * Pure function — does not modify the original config.
 */
export function applyMigration(config: Config, result: MigrationResult): Config {
  if (!result.migrated) {
    return config;
  }

  // Build lookup from reviewerId → target provider (excluding 'moderator')
  const changeMap = new Map<string, MigrationChange>(
    result.changes.map((c) => [c.reviewerId, c])
  );

  // Migrate a single AgentConfig if it has a change entry
  function applyToAgent(agent: AgentConfig): AgentConfig {
    const change = changeMap.get(agent.id);
    if (!change) return agent;

    const updated: AgentConfig = {
      ...agent,
      backend: 'api',
      provider: change.to.provider,
    };

    if (agent.fallback && isCliBackend(agent.fallback.backend)) {
      const fallbackProvider =
        agent.fallback.provider ?? BACKEND_TO_PROVIDER[agent.fallback.backend] ?? change.to.provider;
      updated.fallback = {
        ...agent.fallback,
        backend: 'api',
        provider: fallbackProvider,
      };
    }

    return updated;
  }

  // Migrate reviewers
  let newReviewers = config.reviewers;
  if (Array.isArray(config.reviewers)) {
    newReviewers = config.reviewers.map((entry) =>
      isAgentConfig(entry) ? applyToAgent(entry) : entry
    );
  } else {
    newReviewers = {
      ...config.reviewers,
      static: (config.reviewers.static ?? []).map(applyToAgent),
    };
  }

  // Migrate supporters
  const newPool = config.supporters.pool.map(applyToAgent);
  const newDevilsAdvocate = applyToAgent(config.supporters.devilsAdvocate);

  // Migrate moderator
  let newModerator = config.moderator;
  const modChange = changeMap.get('moderator');
  if (modChange) {
    newModerator = {
      ...config.moderator,
      backend: 'api',
      provider: modChange.to.provider,
    };
  }

  // Add head field from moderator config if missing
  const newHead = config.head ?? {
    backend: 'api' as const,
    model: newModerator.model,
    provider: newModerator.provider,
    enabled: true,
  };

  return {
    ...config,
    reviewers: newReviewers,
    supporters: {
      ...config.supporters,
      pool: newPool,
      devilsAdvocate: newDevilsAdvocate,
    },
    moderator: newModerator,
    head: newHead,
  };
}

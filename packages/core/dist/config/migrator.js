const BACKEND_TO_PROVIDER = {
  opencode: "openrouter",
  // OpenCode uses OpenRouter
  codex: "openrouter",
  // Default mapping
  gemini: "google",
  claude: "openrouter"
  // Via OpenRouter
};
const CLI_BACKENDS = new Set(Object.keys(BACKEND_TO_PROVIDER));
function isCliBackend(backend) {
  return CLI_BACKENDS.has(backend);
}
function isAgentConfig(entry) {
  return !("auto" in entry && entry.auto === true);
}
function migrateAgentConfig(agent, changes, warnings) {
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
  const targetProvider = agent.provider ?? mappedProvider;
  changes.push({
    reviewerId: agent.id,
    from: { backend: agent.backend, provider: agent.provider },
    to: { backend: "api", provider: targetProvider }
  });
  const migrated = {
    ...agent,
    backend: "api",
    provider: targetProvider
  };
  if (agent.fallback) {
    const fallbackArray = Array.isArray(agent.fallback) ? agent.fallback : [agent.fallback];
    const migratedFallbacks = fallbackArray.map((fb) => {
      if (isCliBackend(fb.backend)) {
        const fallbackProvider = fb.provider ?? BACKEND_TO_PROVIDER[fb.backend] ?? mappedProvider;
        return { ...fb, backend: "api", provider: fallbackProvider };
      }
      return fb;
    });
    migrated.fallback = Array.isArray(agent.fallback) ? migratedFallbacks : migratedFallbacks[0];
  }
  return migrated;
}
function needsMigration(config) {
  if (Array.isArray(config.reviewers)) {
    for (const entry of config.reviewers) {
      if (isAgentConfig(entry) && isCliBackend(entry.backend)) {
        return true;
      }
    }
  } else {
    for (const entry of config.reviewers.static ?? []) {
      if (isCliBackend(entry.backend)) {
        return true;
      }
    }
  }
  for (const s of config.supporters.pool) {
    if (isCliBackend(s.backend)) return true;
  }
  if (isCliBackend(config.supporters.devilsAdvocate.backend)) {
    return true;
  }
  if (isCliBackend(config.moderator.backend)) {
    return true;
  }
  return false;
}
function migrateConfig(config) {
  const changes = [];
  const warnings = [];
  if (Array.isArray(config.reviewers)) {
    for (const entry of config.reviewers) {
      if (isAgentConfig(entry)) {
        migrateAgentConfig(entry, changes, warnings);
      }
    }
  } else {
    for (const entry of config.reviewers.static ?? []) {
      migrateAgentConfig(entry, changes, warnings);
    }
  }
  for (const s of config.supporters.pool) {
    migrateAgentConfig(s, changes, warnings);
  }
  migrateAgentConfig(config.supporters.devilsAdvocate, changes, warnings);
  if (isCliBackend(config.moderator.backend)) {
    const mappedProvider = BACKEND_TO_PROVIDER[config.moderator.backend];
    if (mappedProvider) {
      const targetProvider = config.moderator.provider ?? mappedProvider;
      changes.push({
        reviewerId: "moderator",
        from: { backend: config.moderator.backend, provider: config.moderator.provider },
        to: { backend: "api", provider: targetProvider }
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
    warnings
  };
}
function applyMigration(config, result) {
  if (!result.migrated) {
    return config;
  }
  const changeMap = new Map(
    result.changes.map((c) => [c.reviewerId, c])
  );
  function applyToAgent(agent) {
    const change = changeMap.get(agent.id);
    if (!change) return agent;
    const updated = {
      ...agent,
      backend: "api",
      provider: change.to.provider
    };
    if (agent.fallback) {
      const fallbackArray = Array.isArray(agent.fallback) ? agent.fallback : [agent.fallback];
      const migratedFallbacks = fallbackArray.map((fb) => {
        if (isCliBackend(fb.backend)) {
          const fallbackProvider = fb.provider ?? BACKEND_TO_PROVIDER[fb.backend] ?? change.to.provider;
          return { ...fb, backend: "api", provider: fallbackProvider };
        }
        return fb;
      });
      updated.fallback = Array.isArray(agent.fallback) ? migratedFallbacks : migratedFallbacks[0];
    }
    return updated;
  }
  let newReviewers = config.reviewers;
  if (Array.isArray(config.reviewers)) {
    newReviewers = config.reviewers.map(
      (entry) => isAgentConfig(entry) ? applyToAgent(entry) : entry
    );
  } else {
    newReviewers = {
      ...config.reviewers,
      static: (config.reviewers.static ?? []).map(applyToAgent)
    };
  }
  const newPool = config.supporters.pool.map(applyToAgent);
  const newDevilsAdvocate = applyToAgent(config.supporters.devilsAdvocate);
  let newModerator = config.moderator;
  const modChange = changeMap.get("moderator");
  if (modChange) {
    newModerator = {
      ...config.moderator,
      backend: "api",
      provider: modChange.to.provider
    };
  }
  const newHead = config.head ?? {
    backend: "api",
    model: newModerator.model,
    provider: newModerator.provider,
    timeout: 120,
    enabled: true
  };
  return {
    ...config,
    reviewers: newReviewers,
    supporters: {
      ...config.supporters,
      pool: newPool,
      devilsAdvocate: newDevilsAdvocate
    },
    moderator: newModerator,
    head: newHead
  };
}
export {
  applyMigration,
  migrateConfig,
  needsMigration
};

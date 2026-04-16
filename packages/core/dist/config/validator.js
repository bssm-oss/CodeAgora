import { getSupportedProviders } from "../l1/provider-registry.js";
const SUPPORTED_BACKENDS = /* @__PURE__ */ new Set(["opencode", "codex", "gemini", "claude", "copilot", "api"]);
function strictValidateConfig(config) {
  const errors = [];
  const warnings = [];
  const supportedProviders = getSupportedProviders();
  const { reviewers } = config;
  if (Array.isArray(reviewers)) {
    const enabledReviewers = reviewers.filter((r) => r.enabled !== false);
    if (enabledReviewers.length > 10) {
      warnings.push(
        `${enabledReviewers.length} reviewers enabled \u2014 recommended max is 10. High counts increase API cost and latency.`
      );
    } else if (enabledReviewers.length < 3 && enabledReviewers.length > 0) {
      warnings.push(
        `Only ${enabledReviewers.length} reviewer(s) enabled \u2014 recommend at least 3 for diverse analysis.`
      );
    }
    for (const reviewer of reviewers) {
      if ("auto" in reviewer) continue;
      const label = reviewer.id ?? "reviewer";
      if (!SUPPORTED_BACKENDS.has(reviewer.backend)) {
        errors.push(
          `reviewer '${label}': unsupported backend '${reviewer.backend}'. Supported: ${[...SUPPORTED_BACKENDS].join(", ")}`
        );
      }
      if (reviewer.model === "") {
        errors.push(`reviewer '${label}': model must not be empty`);
      }
      if ((reviewer.backend === "api" || reviewer.backend === "opencode") && !reviewer.provider) {
        errors.push(
          `reviewer '${label}': provider is required when backend is '${reviewer.backend}'`
        );
      }
      if (reviewer.provider !== void 0 && reviewer.provider !== "") {
        if (!supportedProviders.includes(reviewer.provider)) {
          if (reviewer.backend === "api") {
            warnings.push(
              `reviewer '${label}': provider '${reviewer.provider}' is not in supported list. Supported: ${supportedProviders.join(", ")}`
            );
          } else {
            errors.push(
              `reviewer '${label}': unsupported provider '${reviewer.provider}'. Supported: ${supportedProviders.join(", ")}`
            );
          }
        }
      }
      if (reviewer.timeout !== void 0) {
        if (reviewer.timeout < 10) {
          warnings.push(
            `reviewer '${label}': timeout ${reviewer.timeout}s is very short (< 10s)`
          );
        } else if (reviewer.timeout > 600) {
          warnings.push(
            `reviewer '${label}': timeout ${reviewer.timeout}s is very long (> 600s)`
          );
        }
      }
    }
  }
  const { supporters } = config;
  if (supporters) {
    const enabledPool = supporters.pool.filter((s) => s.enabled !== false);
    if (enabledPool.length > 5) {
      warnings.push(
        `${enabledPool.length} supporters in pool \u2014 recommended max is 5. Only pickCount=${supporters.pickCount} are used per discussion.`
      );
    }
    if (supporters.pickCount > enabledPool.length) {
      warnings.push(
        `pickCount (${supporters.pickCount}) exceeds enabled pool size (${enabledPool.length}) \u2014 some discussion rounds may have fewer supporters.`
      );
    }
  }
  const { discussion } = config;
  if (discussion && discussion.maxRounds > 5) {
    warnings.push(
      `maxRounds=${discussion.maxRounds} \u2014 recommended max is 5. High round counts increase latency without significant quality improvement.`
    );
  }
  const { moderator } = config;
  if (moderator) {
    if (!SUPPORTED_BACKENDS.has(moderator.backend)) {
      errors.push(
        `moderator: unsupported backend '${moderator.backend}'. Supported: ${[...SUPPORTED_BACKENDS].join(", ")}`
      );
    }
    if (moderator.model === "") {
      errors.push(`moderator: model must not be empty`);
    }
    if ((moderator.backend === "api" || moderator.backend === "opencode") && !moderator.provider) {
      errors.push(
        `moderator: provider is required when backend is '${moderator.backend}'`
      );
    }
    if (moderator.provider !== void 0 && moderator.provider !== "") {
      if (!supportedProviders.includes(moderator.provider)) {
        if (moderator.backend === "api") {
          warnings.push(
            `moderator: provider '${moderator.provider}' is not in supported list. Supported: ${supportedProviders.join(", ")}`
          );
        } else {
          errors.push(
            `moderator: unsupported provider '${moderator.provider}'. Supported: ${supportedProviders.join(", ")}`
          );
        }
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
export {
  strictValidateConfig
};

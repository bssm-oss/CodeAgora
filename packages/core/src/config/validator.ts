/**
 * Strict Config Validator
 * Provides additional runtime validation beyond zod schema.
 */

import { getSupportedProviders } from '../l1/provider-registry.js';
import type { Config } from '../types/config.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Supported Backends
// ============================================================================

const SUPPORTED_BACKENDS = new Set(['opencode', 'codex', 'gemini', 'claude', 'copilot', 'api']);

// ============================================================================
// Validator
// ============================================================================

export function strictValidateConfig(config: Config): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const supportedProviders = getSupportedProviders();

  // Reviewer count recommendations
  const { reviewers } = config;
  if (Array.isArray(reviewers)) {
    const enabledReviewers = reviewers.filter(r => r.enabled !== false);
    if (enabledReviewers.length > 10) {
      warnings.push(
        `${enabledReviewers.length} reviewers enabled — recommended max is 10. High counts increase API cost and latency.`
      );
    } else if (enabledReviewers.length < 3 && enabledReviewers.length > 0) {
      warnings.push(
        `Only ${enabledReviewers.length} reviewer(s) enabled — recommend at least 3 for diverse analysis.`
      );
    }

    for (const reviewer of reviewers) {
      if ('auto' in reviewer) continue; // AutoReviewerConfig — skip

      const label = reviewer.id ?? 'reviewer';

      // backend validation
      if (!SUPPORTED_BACKENDS.has(reviewer.backend)) {
        errors.push(
          `reviewer '${label}': unsupported backend '${reviewer.backend}'. Supported: ${[...SUPPORTED_BACKENDS].join(', ')}`
        );
      }

      // model empty string
      if (reviewer.model === '') {
        errors.push(`reviewer '${label}': model must not be empty`);
      }

      // backend='api' or 'opencode' requires provider
      if ((reviewer.backend === 'api' || reviewer.backend === 'opencode') && !reviewer.provider) {
        errors.push(
          `reviewer '${label}': provider is required when backend is '${reviewer.backend}'`
        );
      }

      // provider validity when present
      if (reviewer.provider !== undefined && reviewer.provider !== '') {
        if (!supportedProviders.includes(reviewer.provider)) {
          if (reviewer.backend === 'api') {
            // For api backend, unsupported provider is a warning (non-fatal)
            warnings.push(
              `reviewer '${label}': provider '${reviewer.provider}' is not in supported list. Supported: ${supportedProviders.join(', ')}`
            );
          } else {
            errors.push(
              `reviewer '${label}': unsupported provider '${reviewer.provider}'. Supported: ${supportedProviders.join(', ')}`
            );
          }
        }
      }

      // timeout warnings
      if (reviewer.timeout !== undefined) {
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

  // Supporter pool recommendations
  const { supporters } = config;
  if (supporters) {
    const enabledPool = supporters.pool.filter(s => s.enabled !== false);
    if (enabledPool.length > 5) {
      warnings.push(
        `${enabledPool.length} supporters in pool — recommended max is 5. Only pickCount=${supporters.pickCount} are used per discussion.`
      );
    }
    if (supporters.pickCount > enabledPool.length) {
      warnings.push(
        `pickCount (${supporters.pickCount}) exceeds enabled pool size (${enabledPool.length}) — some discussion rounds may have fewer supporters.`
      );
    }
  }

  // Discussion round recommendations
  const { discussion } = config;
  if (discussion && discussion.maxRounds > 5) {
    warnings.push(
      `maxRounds=${discussion.maxRounds} — recommended max is 5. High round counts increase latency without significant quality improvement.`
    );
  }

  // Validate moderator
  const { moderator } = config;
  if (moderator) {
    // backend validation
    if (!SUPPORTED_BACKENDS.has(moderator.backend)) {
      errors.push(
        `moderator: unsupported backend '${moderator.backend}'. Supported: ${[...SUPPORTED_BACKENDS].join(', ')}`
      );
    }

    // model empty string
    if (moderator.model === '') {
      errors.push(`moderator: model must not be empty`);
    }

    // backend='api' or 'opencode' requires provider
    if ((moderator.backend === 'api' || moderator.backend === 'opencode') && !moderator.provider) {
      errors.push(
        `moderator: provider is required when backend is '${moderator.backend}'`
      );
    }

    // provider validity when present
    if (moderator.provider !== undefined && moderator.provider !== '') {
      if (!supportedProviders.includes(moderator.provider)) {
        if (moderator.backend === 'api') {
          warnings.push(
            `moderator: provider '${moderator.provider}' is not in supported list. Supported: ${supportedProviders.join(', ')}`
          );
        } else {
          errors.push(
            `moderator: unsupported provider '${moderator.provider}'. Supported: ${supportedProviders.join(', ')}`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

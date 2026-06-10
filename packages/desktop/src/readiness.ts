export interface ConfigPolicyReadiness {
  activeReviewers: number | undefined;
  complete: boolean;
  validJson: boolean;
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

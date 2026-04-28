export interface RateLimitSimulationInput {
  requests: number;
  concurrency: number;
  maxRetries: number;
  retryAfterMs: number;
  requestDurationMs: number;
  perMinuteLimit?: number;
  dailyLimit?: number;
}

export interface RateLimitSimulationResult {
  requestedJobs: number;
  completedJobs: number;
  failedJobs: number;
  primaryAttempts: number;
  retryAttempts: number;
  totalAttempts: number;
  rateLimitedAttempts: number;
  dailyLimitBlockedAttempts: number;
  durationMs: number;
  peakConcurrency: number;
  recommendations: string[];
}

interface QueuedAttempt {
  jobId: number;
  attempt: number;
  dueAt: number;
}

interface ActiveAttempt extends QueuedAttempt {
  finishesAt: number;
}

function positiveInt(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1 || Math.floor(value) !== value) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInt(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

export function simulateRateLimitRun(input: RateLimitSimulationInput): RateLimitSimulationResult {
  const requests = positiveInt(input.requests, 'requests');
  const concurrency = positiveInt(input.concurrency, 'concurrency');
  const maxRetries = nonNegativeInt(input.maxRetries, 'maxRetries');
  const retryAfterMs = positiveInt(input.retryAfterMs, 'retryAfterMs');
  const requestDurationMs = positiveInt(input.requestDurationMs, 'requestDurationMs');
  const perMinuteLimit = input.perMinuteLimit == null
    ? undefined
    : positiveInt(input.perMinuteLimit, 'perMinuteLimit');
  const dailyLimit = input.dailyLimit == null ? undefined : positiveInt(input.dailyLimit, 'dailyLimit');

  const queue: QueuedAttempt[] = Array.from({ length: requests }, (_, jobId) => ({
    jobId,
    attempt: 0,
    dueAt: 0,
  }));
  const active: ActiveAttempt[] = [];
  const completed = new Set<number>();
  const failed = new Set<number>();
  const attemptWindow: number[] = [];
  const recommendations = new Set<string>();

  let now = 0;
  let totalAttempts = 0;
  let rateLimitedAttempts = 0;
  let dailyLimitBlockedAttempts = 0;
  let peakConcurrency = 0;

  const enqueueRetry = (attempt: QueuedAttempt) => {
    if (attempt.attempt >= maxRetries) {
      failed.add(attempt.jobId);
      return;
    }
    queue.push({
      jobId: attempt.jobId,
      attempt: attempt.attempt + 1,
      dueAt: now + retryAfterMs,
    });
  };

  while (completed.size + failed.size < requests) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.finishesAt <= now) {
        completed.add(active[i]!.jobId);
        active.splice(i, 1);
      }
    }

    queue.sort((a, b) => a.dueAt - b.dueAt || a.jobId - b.jobId || a.attempt - b.attempt);
    while (active.length < concurrency) {
      const nextIndex = queue.findIndex(
        (item) => item.dueAt <= now && !completed.has(item.jobId) && !failed.has(item.jobId),
      );
      if (nextIndex === -1) break;
      const attempt = queue.splice(nextIndex, 1)[0]!;

      while (attemptWindow.length > 0 && attemptWindow[0]! <= now - 60_000) {
        attemptWindow.shift();
      }

      if (dailyLimit !== undefined && totalAttempts >= dailyLimit) {
        dailyLimitBlockedAttempts++;
        failed.add(attempt.jobId);
        continue;
      }

      totalAttempts++;
      attemptWindow.push(now);

      if (perMinuteLimit !== undefined && attemptWindow.length > perMinuteLimit) {
        rateLimitedAttempts++;
        enqueueRetry(attempt);
        continue;
      }

      active.push({ ...attempt, finishesAt: now + requestDurationMs });
      peakConcurrency = Math.max(peakConcurrency, active.length);
    }

    if (completed.size + failed.size >= requests) break;

    const nextActive = active.length > 0 ? Math.min(...active.map((a) => a.finishesAt)) : Infinity;
    const nextQueued = queue
      .filter((item) => !completed.has(item.jobId) && !failed.has(item.jobId))
      .reduce((min, item) => Math.min(min, item.dueAt), Infinity);
    const nextTime = Math.min(nextActive, nextQueued);
    if (!Number.isFinite(nextTime)) break;
    now = Math.max(now + 1, nextTime);
  }

  if (rateLimitedAttempts > 0) {
    recommendations.add('lower concurrency or increase retry-after for this provider cap');
  }
  if (dailyLimitBlockedAttempts > 0) {
    recommendations.add('reduce fixture count or split runs across days before live testing');
  }
  if (failed.size > 0 && maxRetries < 2) {
    recommendations.add('use at least two retries for free/budget presets under 429 pressure');
  }
  if (recommendations.size === 0) {
    recommendations.add('current settings complete without simulated rate-limit loss');
  }

  return {
    requestedJobs: requests,
    completedJobs: completed.size,
    failedJobs: failed.size,
    primaryAttempts: Math.min(requests, totalAttempts),
    retryAttempts: Math.max(0, totalAttempts - requests),
    totalAttempts,
    rateLimitedAttempts,
    dailyLimitBlockedAttempts,
    durationMs: now,
    peakConcurrency,
    recommendations: Array.from(recommendations),
  };
}

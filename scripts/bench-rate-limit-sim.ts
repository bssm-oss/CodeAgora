#!/usr/bin/env -S tsx
// Synthetic rate-limit simulator for Phase 2 #476.

import process from 'node:process';
import { simulateRateLimitRun } from '../packages/core/src/l1/rate-limit-sim.js';

interface Args {
  requests: number;
  concurrency: number;
  maxRetries: number;
  retryAfterMs: number;
  requestDurationMs: number;
  perMinuteLimit?: number;
  dailyLimit?: number;
  json: boolean;
}

function readNumber(argv: string[], index: number, flag: string): number {
  const raw = argv[index + 1];
  if (!raw) throw new Error(`${flag} requires a value`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number`);
  return parsed;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    requests: 20,
    concurrency: 5,
    maxRetries: 2,
    retryAfterMs: 5_000,
    requestDurationMs: 8_000,
    perMinuteLimit: 20,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--requests') args.requests = readNumber(argv, i++, arg);
    else if (arg === '--concurrency') args.concurrency = readNumber(argv, i++, arg);
    else if (arg === '--max-retries') args.maxRetries = readNumber(argv, i++, arg);
    else if (arg === '--retry-after-ms') args.retryAfterMs = readNumber(argv, i++, arg);
    else if (arg === '--request-ms') args.requestDurationMs = readNumber(argv, i++, arg);
    else if (arg === '--per-minute') args.perMinuteLimit = readNumber(argv, i++, arg);
    else if (arg === '--daily-cap') args.dailyLimit = readNumber(argv, i++, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm bench:rate-limit -- [--requests n] [--concurrency n] [--max-retries n] [--per-minute n] [--daily-cap n] [--json]');
      process.exit(0);
    }
  }

  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const result = simulateRateLimitRun(args);

  if (args.json) {
    process.stdout.write(JSON.stringify({ input: args, result }, null, 2) + '\n');
    return;
  }

  console.log('\n== Rate-limit simulation ==\n');
  console.log(`requests: ${result.requestedJobs} | completed: ${result.completedJobs} | failed: ${result.failedJobs}`);
  console.log(`attempts: ${result.totalAttempts} | retries: ${result.retryAttempts} | 429s: ${result.rateLimitedAttempts}`);
  console.log(`daily-cap blocks: ${result.dailyLimitBlockedAttempts} | peak concurrency: ${result.peakConcurrency} | duration: ${result.durationMs}ms`);
  console.log('\nrecommendations:');
  for (const recommendation of result.recommendations) {
    console.log(`  - ${recommendation}`);
  }
  console.log();

  if (result.failedJobs > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bench-rate-limit-sim: ${msg}`);
  process.exit(1);
}

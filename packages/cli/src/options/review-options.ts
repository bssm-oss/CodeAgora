/**
 * Review CLI Options
 * Parses and validates CLI options for the review command.
 */

import type { OutputFormat } from '../formatters/review-output.js';

// ============================================================================
// Types
// ============================================================================

export interface ReviewCliOptions {
  dryRun: boolean;
  output: OutputFormat;
  provider?: string;
  model?: string;
  verbose: boolean;
  reviewers?: string;
  timeout?: number;
  reviewerTimeout?: number;
  noDiscussion: boolean;
}

export interface ReviewerSelection {
  count?: number;
  names?: string[];
}

// ============================================================================
// parseReviewerOption
// ============================================================================

/**
 * Parse the --reviewers option value.
 *
 * "3"                     -> { count: 3 }
 * "r1-kimi,r2-deepseek"   -> { names: ['r1-kimi', 'r2-deepseek'] }
 *
 * Throws for invalid input.
 */
export function parseReviewerOption(value: string): ReviewerSelection {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('--reviewers value cannot be empty');
  }

  // Pure numeric → count
  if (/^\d+$/.test(trimmed)) {
    const count = parseInt(trimmed, 10);
    if (count < 1) {
      throw new Error(`--reviewers count must be >= 1, got ${count}`);
    }
    return { count };
  }

  // Comma-separated names
  if (trimmed.includes(',') || /^[a-zA-Z]/.test(trimmed)) {
    const names = trimmed
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      throw new Error('--reviewers names list is empty after parsing');
    }

    // Validate: names must not be purely numeric
    for (const name of names) {
      if (/^\d+$/.test(name)) {
        throw new Error(
          `--reviewers contains numeric entry "${name}" in a names list — use a plain number for count`
        );
      }
    }

    return { names };
  }

  throw new Error(
    `--reviewers value "${value}" is not a valid reviewer count or comma-separated name list`
  );
}

// ============================================================================
// stdin helpers
// ============================================================================

/**
 * Returns true when stdin is being piped (not an interactive TTY).
 */
export function isStdinPiped(): boolean {
  return process.stdin.isTTY === undefined || process.stdin.isTTY === false;
}

/**
 * Read all data from process.stdin (supports pipe).
 * Times out after `timeoutMs` (default 30s) to avoid hanging indefinitely.
 */
export async function readStdin(timeoutMs: number = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const dataHandler = (chunk: Buffer) => {
      chunks.push(chunk);
    };

    const endHandler = () => {
      clearTimeout(timer);
      process.stdin.removeListener('data', dataHandler);
      process.stdin.removeListener('end', endHandler);
      process.stdin.removeListener('error', errorHandler);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    };

    const errorHandler = (err: Error) => {
      clearTimeout(timer);
      process.stdin.removeListener('data', dataHandler);
      process.stdin.removeListener('end', endHandler);
      process.stdin.removeListener('error', errorHandler);
      reject(err);
    };

    const timer = setTimeout(() => {
      process.stdin.removeListener('data', dataHandler);
      process.stdin.removeListener('end', endHandler);
      process.stdin.removeListener('error', errorHandler);
      process.stdin.pause();
      reject(new Error(`stdin read timed out after ${timeoutMs}ms. Did you forget to pipe input?`));
    }, timeoutMs);

    process.stdin.on('data', dataHandler);
    process.stdin.on('end', endHandler);
    process.stdin.on('error', errorHandler);
  });
}

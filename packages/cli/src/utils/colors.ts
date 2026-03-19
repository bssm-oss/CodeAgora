/**
 * Color utilities for CLI output.
 * Wraps picocolors with domain-specific formatters.
 */

import pc from 'picocolors';

export const dim = pc.dim;
export const bold = pc.bold;
export const cyan = pc.cyan;

// ============================================================================
// Status colors — pass/fail/warn
// ============================================================================

export const statusColor = {
  pass: (s: string) => pc.green(s),
  fail: (s: string) => pc.red(s),
  warn: (s: string) => pc.yellow(s),
} as const;

// ============================================================================
// Severity colors
// ============================================================================

export const severityColor = {
  HARSHLY_CRITICAL: (s: string) => pc.bold(pc.red(s)),
  CRITICAL: (s: string) => pc.red(s),
  WARNING: (s: string) => pc.yellow(s),
  SUGGESTION: (s: string) => pc.cyan(s),
} as const;

// ============================================================================
// Decision colors
// ============================================================================

export const decisionColor = {
  ACCEPT: (s: string) => pc.bold(pc.green(s)),
  REJECT: (s: string) => pc.bold(pc.red(s)),
  NEEDS_HUMAN: (s: string) => pc.bold(pc.yellow(s)),
} as const;

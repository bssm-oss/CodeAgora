/**
 * Shared constants for notification modules.
 */

/** Discord embed colors keyed by review decision. */
export const DECISION_COLORS: Record<string, number> = {
  ACCEPT: 0x00ff00,
  REJECT: 0xff0000,
  NEEDS_HUMAN: 0xffff00,
};

/** Severity levels ordered from most to least critical. */
export const SEVERITY_ORDER = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const;

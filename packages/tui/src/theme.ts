/**
 * TUI Theme System
 * Centralized colors, icons, borders, and semantic helpers.
 */

// ============================================================================
// Color Palette
// ============================================================================

export const colors = {
  primary: 'cyan',
  secondary: 'gray',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  muted: 'gray',
  accent: 'magenta',
  selection: { bg: 'cyan', fg: 'black' },
} as const;

// ============================================================================
// Unicode Icons
// ============================================================================

export const icons = {
  enabled: '\u25cf',      // ●
  disabled: '\u25cb',     // ○
  partial: '\u25d0',      // ◐
  check: '\u2713',        // ✓
  cross: '\u2717',        // ✗
  arrow: '\u25b8',        // ▸
  arrowDown: '\u25be',    // ▾
  bullet: '\u2022',       // •
  ellipsis: '\u2026',     // …
  separator: '\u2502',    // │
  dot: '\u00b7',          // ·
} as const;

// ============================================================================
// Border Styles
// ============================================================================

export const borders = {
  panel: 'round' as const,
  section: 'single' as const,
} as const;

// ============================================================================
// Severity Mapping
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  HARSHLY_CRITICAL: 'red',
  CRITICAL: 'red',
  WARNING: 'yellow',
  SUGGESTION: 'cyan',
};

const SEVERITY_ICONS: Record<string, string> = {
  HARSHLY_CRITICAL: '\u2718',  // ✘
  CRITICAL: '\u2716',          // ✖
  WARNING: '\u26a0',           // ⚠
  SUGGESTION: '\u2192',        // →
};

export function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] ?? 'white';
}

export function severityIcon(severity: string): string {
  return SEVERITY_ICONS[severity] ?? icons.bullet;
}

// ============================================================================
// Status Mapping
// ============================================================================

export function statusColor(enabled: boolean): string {
  return enabled ? colors.success : colors.error;
}

export function statusIcon(enabled: boolean): string {
  return enabled ? icons.enabled : icons.disabled;
}

// ============================================================================
// Decision Mapping
// ============================================================================

const DECISION_COLORS: Record<string, string> = {
  ACCEPT: 'green',
  REJECT: 'red',
  NEEDS_HUMAN: 'yellow',
};

export function decisionColor(decision: string): string {
  return DECISION_COLORS[decision] ?? 'white';
}

// ============================================================================
// Layout Helpers
// ============================================================================

export function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

export const MIN_COLS = 80;
export const LIST_WIDTH_RATIO = 0.38;
export const DETAIL_WIDTH_RATIO = 0.62;

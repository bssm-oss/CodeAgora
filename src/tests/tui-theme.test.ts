/**
 * Tests for src/tui/theme.ts pure functions.
 */

import { describe, it, expect } from 'vitest';
import {
  severityColor,
  severityIcon,
  statusColor,
  statusIcon,
  decisionColor,
  icons,
  colors,
} from '@codeagora/tui/theme.js';

// ============================================================================
// severityColor
// ============================================================================

describe('severityColor', () => {
  it('returns red for HARSHLY_CRITICAL', () => {
    expect(severityColor('HARSHLY_CRITICAL')).toBe('red');
  });

  it('returns red for CRITICAL', () => {
    expect(severityColor('CRITICAL')).toBe('red');
  });

  it('returns yellow for WARNING', () => {
    expect(severityColor('WARNING')).toBe('yellow');
  });

  it('returns cyan for SUGGESTION', () => {
    expect(severityColor('SUGGESTION')).toBe('cyan');
  });

  it('returns white for an unknown severity', () => {
    expect(severityColor('UNKNOWN_LEVEL')).toBe('white');
  });

  it('returns white for an empty string severity', () => {
    expect(severityColor('')).toBe('white');
  });
});

// ============================================================================
// severityIcon
// ============================================================================

describe('severityIcon', () => {
  it('returns ✘ (U+2718) for HARSHLY_CRITICAL', () => {
    expect(severityIcon('HARSHLY_CRITICAL')).toBe('\u2718');
  });

  it('returns ✖ (U+2716) for CRITICAL', () => {
    expect(severityIcon('CRITICAL')).toBe('\u2716');
  });

  it('returns ⚠ (U+26A0) for WARNING', () => {
    expect(severityIcon('WARNING')).toBe('\u26a0');
  });

  it('returns → (U+2192) for SUGGESTION', () => {
    expect(severityIcon('SUGGESTION')).toBe('\u2192');
  });

  it('returns the bullet icon for an unknown severity', () => {
    expect(severityIcon('NOPE')).toBe(icons.bullet);
  });
});

// ============================================================================
// statusColor / statusIcon
// ============================================================================

describe('statusColor', () => {
  it('returns green when enabled is true', () => {
    expect(statusColor(true)).toBe(colors.success);
    expect(statusColor(true)).toBe('green');
  });

  it('returns red when enabled is false', () => {
    expect(statusColor(false)).toBe(colors.error);
    expect(statusColor(false)).toBe('red');
  });
});

describe('statusIcon', () => {
  it('returns ● (U+25CF) when enabled is true', () => {
    expect(statusIcon(true)).toBe(icons.enabled);
    expect(statusIcon(true)).toBe('\u25cf');
  });

  it('returns ○ (U+25CB) when enabled is false', () => {
    expect(statusIcon(false)).toBe(icons.disabled);
    expect(statusIcon(false)).toBe('\u25cb');
  });
});

// ============================================================================
// decisionColor
// ============================================================================

describe('decisionColor', () => {
  it('returns green for ACCEPT', () => {
    expect(decisionColor('ACCEPT')).toBe('green');
  });

  it('returns red for REJECT', () => {
    expect(decisionColor('REJECT')).toBe('red');
  });

  it('returns yellow for NEEDS_HUMAN', () => {
    expect(decisionColor('NEEDS_HUMAN')).toBe('yellow');
  });

  it('returns white for an unknown decision', () => {
    expect(decisionColor('PENDING')).toBe('white');
  });

  it('returns white for an empty string decision', () => {
    expect(decisionColor('')).toBe('white');
  });
});

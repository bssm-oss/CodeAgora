/**
 * Mode Presets — strict vs pragmatic review configuration
 */

import type { ReviewMode } from '../types/config.js';

export interface ModePreset {
  registrationThreshold: {
    HARSHLY_CRITICAL: number;
    CRITICAL: number;
    WARNING: number;
    SUGGESTION: number | null;
  };
  personaPool: string[];
  maxRounds: number;
}

const STRICT_PRESET: ModePreset = {
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 1,
    SUGGESTION: 2,
  },
  personaPool: [
    '.ca/personas/strict.md',
    '.ca/personas/security-focused.md',
  ],
  maxRounds: 5,
};

const PRAGMATIC_PRESET: ModePreset = {
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 2,
    SUGGESTION: null,
  },
  personaPool: [
    '.ca/personas/strict.md',
    '.ca/personas/pragmatic.md',
  ],
  maxRounds: 4,
};

export function getModePreset(mode: ReviewMode): ModePreset {
  return mode === 'strict' ? STRICT_PRESET : PRAGMATIC_PRESET;
}

const STRICT_PRESET = {
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 1,
    SUGGESTION: 2
  },
  personaPool: [
    ".ca/personas/strict.md",
    ".ca/personas/security-focused.md"
  ],
  maxRounds: 5
};
const PRAGMATIC_PRESET = {
  registrationThreshold: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 1,
    WARNING: 2,
    SUGGESTION: null
  },
  personaPool: [
    ".ca/personas/strict.md",
    ".ca/personas/pragmatic.md"
  ],
  maxRounds: 4
};
function getModePreset(mode) {
  return mode === "strict" ? STRICT_PRESET : PRAGMATIC_PRESET;
}
export {
  getModePreset
};

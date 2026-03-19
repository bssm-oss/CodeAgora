/**
 * Pure utility functions for the config management UI.
 * Separated from React components so they can be unit-tested in Node environment.
 */

// ============================================================================
// Types
// ============================================================================

type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'array' | 'object';

interface FieldValidationError {
  field: string;
  message: string;
}

interface ConfigDiff {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

interface AgentConfig {
  id: string;
  label?: string;
  model: string;
  backend: 'opencode' | 'codex' | 'gemini' | 'claude' | 'copilot' | 'api';
  provider?: string;
  persona?: string;
  timeout: number;
  enabled: boolean;
}

interface DefaultConfig {
  mode: 'pragmatic';
  language: 'en';
  reviewers: AgentConfig[];
  supporters: {
    pool: AgentConfig[];
    pickCount: number;
    pickStrategy: 'random';
    devilsAdvocate: AgentConfig;
    personaPool: string[];
    personaAssignment: 'random';
  };
  moderator: { backend: string; model: string };
  head: { backend: string; model: string; enabled: boolean };
  discussion: {
    maxRounds: number;
    registrationThreshold: {
      HARSHLY_CRITICAL: number;
      CRITICAL: number;
      WARNING: number;
      SUGGESTION: null;
    };
    codeSnippetRange: number;
  };
  errorHandling: { maxRetries: number; forfeitThreshold: number };
  chunking: { maxTokens: number };
  notifications: { autoNotify: boolean };
  github: {
    humanReviewers: string[];
    humanTeams: string[];
    needsHumanLabel: string;
    postSuggestions: boolean;
    collapseDiscussions: boolean;
  };
  autoApprove: { enabled: boolean; maxLines: number; allowedFilePatterns: string[] };
}

// ============================================================================
// Field type inference
// ============================================================================

/**
 * Infer the field type from a runtime value.
 */
function getFieldType(value: unknown): FieldType {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'text';
}

// ============================================================================
// Field validation
// ============================================================================

/**
 * Validate a single config field value.
 * Returns an error message string, or null if valid.
 */
function validateConfigField(field: string, value: unknown): string | null {
  // Required field check — empty strings are invalid for most fields
  if (value === '' || value === undefined || value === null) {
    // Some fields are optional
    const optionalFields = ['provider', 'label', 'persona', 'sarifOutputPath'];
    if (optionalFields.includes(field)) return null;
    return `${field} is required`;
  }

  // Number fields must be positive
  const numberFields = [
    'timeout', 'maxRounds', 'maxRetries', 'forfeitThreshold',
    'codeSnippetRange', 'pickCount', 'maxTokens', 'maxLines',
  ];
  if (numberFields.includes(field)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (isNaN(num)) return `${field} must be a number`;
    if (num < 0) return `${field} must be non-negative`;
    // Integer check for certain fields
    const integerFields = ['maxRounds', 'maxRetries', 'pickCount', 'maxLines', 'codeSnippetRange'];
    if (integerFields.includes(field) && !Number.isInteger(num)) {
      return `${field} must be an integer`;
    }
  }

  // Threshold fields allow specific number values or null
  const thresholdFields = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING'];
  if (thresholdFields.includes(field)) {
    if (typeof value === 'number') {
      if (value < 0 || value > 1) return `${field} must be between 0 and 1`;
    }
  }

  // Backend must be one of the allowed values
  if (field === 'backend') {
    const allowed = ['opencode', 'codex', 'gemini', 'claude', 'copilot', 'api'];
    if (typeof value === 'string' && !allowed.includes(value)) {
      return `${field} must be one of: ${allowed.join(', ')}`;
    }
  }

  // Mode must be strict or pragmatic
  if (field === 'mode') {
    if (typeof value === 'string' && !['strict', 'pragmatic'].includes(value)) {
      return `${field} must be "strict" or "pragmatic"`;
    }
  }

  // Language must be en or ko
  if (field === 'language') {
    if (typeof value === 'string' && !['en', 'ko'].includes(value)) {
      return `${field} must be "en" or "ko"`;
    }
  }

  // Pick strategy
  if (field === 'pickStrategy') {
    if (typeof value === 'string' && !['random', 'round-robin'].includes(value)) {
      return `${field} must be "random" or "round-robin"`;
    }
  }

  // Persona assignment
  if (field === 'personaAssignment') {
    if (typeof value === 'string' && !['random', 'fixed'].includes(value)) {
      return `${field} must be "random" or "fixed"`;
    }
  }

  // URL validation for webhook URLs
  if (field === 'webhookUrl') {
    if (typeof value === 'string' && value.length > 0) {
      if (!value.startsWith('https://')) {
        return `${field} must start with https://`;
      }
    }
  }

  return null;
}

// ============================================================================
// Config flatten / unflatten
// ============================================================================

/**
 * Flatten a nested config object into dot-path keys.
 * Arrays are preserved as-is (not expanded into indexed keys).
 */
function flattenConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  function recurse(obj: Record<string, unknown>, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        // Preserve arrays as-is
        result[fullKey] = value;
      } else if (value !== null && typeof value === 'object') {
        recurse(value as Record<string, unknown>, fullKey);
      } else {
        result[fullKey] = value;
      }
    }
  }

  recurse(config, '');
  return result;
}

/**
 * Reconstruct a nested config object from dot-path keys.
 */
function unflattenConfig(flat: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  return result;
}

// ============================================================================
// Default config
// ============================================================================

/**
 * Return sensible defaults for a new config.
 */
function getDefaultConfig(): DefaultConfig {
  return {
    mode: 'pragmatic',
    language: 'en',
    reviewers: [
      {
        id: 'reviewer-1',
        model: 'gpt-4',
        backend: 'api',
        timeout: 120,
        enabled: true,
      },
    ],
    supporters: {
      pool: [],
      pickCount: 2,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 'devils-advocate',
        model: 'gpt-4',
        backend: 'api',
        timeout: 120,
        enabled: true,
      },
      personaPool: [],
      personaAssignment: 'random',
    },
    moderator: { backend: 'api', model: 'gpt-4' },
    head: { backend: 'api', model: 'gpt-4', enabled: true },
    discussion: {
      maxRounds: 3,
      registrationThreshold: {
        HARSHLY_CRITICAL: 0.3,
        CRITICAL: 0.5,
        WARNING: 0.7,
        SUGGESTION: null,
      },
      codeSnippetRange: 5,
    },
    errorHandling: { maxRetries: 3, forfeitThreshold: 2 },
    chunking: { maxTokens: 8000 },
    notifications: { autoNotify: false },
    github: {
      humanReviewers: [],
      humanTeams: [],
      needsHumanLabel: 'needs-human-review',
      postSuggestions: true,
      collapseDiscussions: true,
    },
    autoApprove: { enabled: false, maxLines: 50, allowedFilePatterns: [] },
  };
}

// ============================================================================
// Config diff
// ============================================================================

/**
 * Find which fields changed between two config objects.
 * Compares flattened representations for simple scalar diffs.
 */
function diffConfigs(
  original: Record<string, unknown>,
  modified: Record<string, unknown>,
): ConfigDiff[] {
  const flatOriginal = flattenConfig(original);
  const flatModified = flattenConfig(modified);

  const diffs: ConfigDiff[] = [];
  const allKeys = new Set([...Object.keys(flatOriginal), ...Object.keys(flatModified)]);

  for (const key of allKeys) {
    const oldVal = flatOriginal[key];
    const newVal = flatModified[key];

    // Deep compare for arrays and objects
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);

    if (oldStr !== newStr) {
      diffs.push({ path: key, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

// ============================================================================
// Exports
// ============================================================================

export {
  getFieldType,
  validateConfigField,
  flattenConfig,
  unflattenConfig,
  getDefaultConfig,
  diffConfigs,
};

export type {
  FieldType,
  FieldValidationError,
  ConfigDiff,
  AgentConfig,
  DefaultConfig,
};

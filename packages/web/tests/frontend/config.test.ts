/**
 * Config Management — Utility Function Tests
 * Tests validateConfigField, getFieldType, flattenConfig, unflattenConfig,
 * getDefaultConfig, diffConfigs, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  validateConfigField,
  getFieldType,
  flattenConfig,
  unflattenConfig,
  getDefaultConfig,
  diffConfigs,
} from '../../src/frontend/utils/config-helpers.js';

// ============================================================================
// getFieldType Tests
// ============================================================================

describe('getFieldType', () => {
  it('should return "boolean" for boolean values', () => {
    expect(getFieldType(true)).toBe('boolean');
    expect(getFieldType(false)).toBe('boolean');
  });

  it('should return "number" for numeric values', () => {
    expect(getFieldType(42)).toBe('number');
    expect(getFieldType(0)).toBe('number');
    expect(getFieldType(3.14)).toBe('number');
  });

  it('should return "text" for string values', () => {
    expect(getFieldType('hello')).toBe('text');
    expect(getFieldType('')).toBe('text');
  });

  it('should return "array" for array values', () => {
    expect(getFieldType([])).toBe('array');
    expect(getFieldType([1, 2, 3])).toBe('array');
  });

  it('should return "object" for plain objects', () => {
    expect(getFieldType({ key: 'value' })).toBe('object');
    expect(getFieldType({})).toBe('object');
  });

  it('should return "text" for null and undefined', () => {
    expect(getFieldType(null)).toBe('text');
    expect(getFieldType(undefined)).toBe('text');
  });
});

// ============================================================================
// validateConfigField Tests
// ============================================================================

describe('validateConfigField', () => {
  it('should return null for valid text fields', () => {
    expect(validateConfigField('model', 'gpt-4')).toBeNull();
  });

  it('should return error for empty required fields', () => {
    expect(validateConfigField('model', '')).not.toBeNull();
    expect(validateConfigField('id', undefined)).not.toBeNull();
  });

  it('should allow empty optional fields', () => {
    expect(validateConfigField('provider', '')).toBeNull();
    expect(validateConfigField('label', null)).toBeNull();
    expect(validateConfigField('persona', undefined)).toBeNull();
  });

  it('should validate number fields are non-negative', () => {
    expect(validateConfigField('timeout', 120)).toBeNull();
    expect(validateConfigField('timeout', -1)).not.toBeNull();
    expect(validateConfigField('maxRounds', 'abc')).not.toBeNull();
  });

  it('should validate integer fields', () => {
    expect(validateConfigField('maxRounds', 3)).toBeNull();
    expect(validateConfigField('maxRounds', 3.5)).not.toBeNull();
    expect(validateConfigField('pickCount', 2.1)).not.toBeNull();
  });

  it('should validate backend field against allowed values', () => {
    expect(validateConfigField('backend', 'api')).toBeNull();
    expect(validateConfigField('backend', 'claude')).toBeNull();
    expect(validateConfigField('backend', 'invalid')).not.toBeNull();
  });

  it('should validate mode field', () => {
    expect(validateConfigField('mode', 'strict')).toBeNull();
    expect(validateConfigField('mode', 'pragmatic')).toBeNull();
    expect(validateConfigField('mode', 'other')).not.toBeNull();
  });

  it('should validate language field', () => {
    expect(validateConfigField('language', 'en')).toBeNull();
    expect(validateConfigField('language', 'ko')).toBeNull();
    expect(validateConfigField('language', 'fr')).not.toBeNull();
  });

  it('should validate webhook URLs must use https', () => {
    expect(validateConfigField('webhookUrl', 'https://example.com/webhook')).toBeNull();
    expect(validateConfigField('webhookUrl', 'http://example.com/webhook')).not.toBeNull();
  });

  it('should validate pickStrategy field', () => {
    expect(validateConfigField('pickStrategy', 'random')).toBeNull();
    expect(validateConfigField('pickStrategy', 'round-robin')).toBeNull();
    expect(validateConfigField('pickStrategy', 'invalid')).not.toBeNull();
  });

  it('should validate threshold fields are between 0 and 1', () => {
    expect(validateConfigField('CRITICAL', 0.5)).toBeNull();
    expect(validateConfigField('CRITICAL', 1.5)).not.toBeNull();
    expect(validateConfigField('WARNING', -0.1)).not.toBeNull();
  });
});

// ============================================================================
// flattenConfig Tests
// ============================================================================

describe('flattenConfig', () => {
  it('should flatten nested objects to dot-path keys', () => {
    const config = {
      discussion: {
        maxRounds: 3,
        codeSnippetRange: 5,
      },
    };
    const flat = flattenConfig(config);
    expect(flat['discussion.maxRounds']).toBe(3);
    expect(flat['discussion.codeSnippetRange']).toBe(5);
  });

  it('should preserve arrays as-is', () => {
    const config = {
      reviewers: [{ id: 'r1', model: 'gpt-4' }],
    };
    const flat = flattenConfig(config);
    expect(Array.isArray(flat['reviewers'])).toBe(true);
  });

  it('should handle deeply nested objects', () => {
    const config = {
      discussion: {
        registrationThreshold: {
          CRITICAL: 0.5,
        },
      },
    };
    const flat = flattenConfig(config);
    expect(flat['discussion.registrationThreshold.CRITICAL']).toBe(0.5);
  });

  it('should handle empty objects', () => {
    expect(flattenConfig({})).toEqual({});
  });

  it('should handle top-level scalar values', () => {
    const config = { mode: 'strict', language: 'en' };
    const flat = flattenConfig(config);
    expect(flat['mode']).toBe('strict');
    expect(flat['language']).toBe('en');
  });
});

// ============================================================================
// unflattenConfig Tests
// ============================================================================

describe('unflattenConfig', () => {
  it('should reconstruct nested objects from dot-path keys', () => {
    const flat = {
      'discussion.maxRounds': 3,
      'discussion.codeSnippetRange': 5,
    };
    const config = unflattenConfig(flat);
    expect((config['discussion'] as Record<string, unknown>)['maxRounds']).toBe(3);
    expect((config['discussion'] as Record<string, unknown>)['codeSnippetRange']).toBe(5);
  });

  it('should handle top-level keys', () => {
    const flat = { mode: 'strict' };
    const config = unflattenConfig(flat);
    expect(config['mode']).toBe('strict');
  });

  it('should handle empty input', () => {
    expect(unflattenConfig({})).toEqual({});
  });
});

// ============================================================================
// flattenConfig / unflattenConfig roundtrip
// ============================================================================

describe('flattenConfig / unflattenConfig roundtrip', () => {
  it('should roundtrip a config without arrays', () => {
    const original: Record<string, unknown> = {
      mode: 'pragmatic',
      discussion: {
        maxRounds: 3,
        registrationThreshold: {
          CRITICAL: 0.5,
          WARNING: 0.7,
        },
      },
      errorHandling: {
        maxRetries: 3,
      },
    };
    const roundtripped = unflattenConfig(flattenConfig(original));
    expect(roundtripped).toEqual(original);
  });

  it('should preserve array values through roundtrip', () => {
    const original: Record<string, unknown> = {
      github: {
        humanReviewers: ['user1', 'user2'],
      },
    };
    const roundtripped = unflattenConfig(flattenConfig(original));
    expect(roundtripped).toEqual(original);
  });
});

// ============================================================================
// getDefaultConfig Tests
// ============================================================================

describe('getDefaultConfig', () => {
  it('should return a valid config structure', () => {
    const config = getDefaultConfig();
    expect(config).toBeDefined();
    expect(config.mode).toBe('pragmatic');
    expect(config.language).toBe('en');
  });

  it('should include required top-level sections', () => {
    const config = getDefaultConfig();
    expect(config.reviewers).toBeDefined();
    expect(Array.isArray(config.reviewers)).toBe(true);
    expect(config.reviewers.length).toBeGreaterThan(0);
    expect(config.supporters).toBeDefined();
    expect(config.moderator).toBeDefined();
    expect(config.discussion).toBeDefined();
    expect(config.errorHandling).toBeDefined();
  });

  it('should have valid default reviewer', () => {
    const config = getDefaultConfig();
    const reviewer = config.reviewers[0];
    expect(reviewer.id).toBeTruthy();
    expect(reviewer.model).toBeTruthy();
    expect(reviewer.backend).toBeTruthy();
    expect(reviewer.timeout).toBeGreaterThan(0);
    expect(reviewer.enabled).toBe(true);
  });

  it('should have valid discussion defaults', () => {
    const config = getDefaultConfig();
    expect(config.discussion.maxRounds).toBeGreaterThan(0);
    expect(config.discussion.codeSnippetRange).toBeGreaterThan(0);
    expect(config.discussion.registrationThreshold.SUGGESTION).toBeNull();
  });

  it('should return a fresh object each call', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ============================================================================
// diffConfigs Tests
// ============================================================================

describe('diffConfigs', () => {
  it('should detect changed scalar values', () => {
    const original = { mode: 'strict', language: 'en' };
    const modified = { mode: 'pragmatic', language: 'en' };
    const diffs = diffConfigs(original, modified);
    expect(diffs.length).toBe(1);
    expect(diffs[0].path).toBe('mode');
    expect(diffs[0].oldValue).toBe('strict');
    expect(diffs[0].newValue).toBe('pragmatic');
  });

  it('should detect added fields', () => {
    const original: Record<string, unknown> = { mode: 'strict' };
    const modified: Record<string, unknown> = { mode: 'strict', language: 'ko' };
    const diffs = diffConfigs(original, modified);
    expect(diffs.length).toBe(1);
    expect(diffs[0].path).toBe('language');
    expect(diffs[0].oldValue).toBeUndefined();
    expect(diffs[0].newValue).toBe('ko');
  });

  it('should detect removed fields', () => {
    const original: Record<string, unknown> = { mode: 'strict', language: 'en' };
    const modified: Record<string, unknown> = { mode: 'strict' };
    const diffs = diffConfigs(original, modified);
    expect(diffs.length).toBe(1);
    expect(diffs[0].path).toBe('language');
  });

  it('should detect nested changes', () => {
    const original = { discussion: { maxRounds: 3 } };
    const modified = { discussion: { maxRounds: 5 } };
    const diffs = diffConfigs(original, modified);
    expect(diffs.length).toBe(1);
    expect(diffs[0].path).toBe('discussion.maxRounds');
  });

  it('should return empty array for identical configs', () => {
    const config = { mode: 'strict', language: 'en' };
    expect(diffConfigs(config, config)).toEqual([]);
  });

  it('should sort diffs by path', () => {
    const original: Record<string, unknown> = { b: 1, a: 1 };
    const modified: Record<string, unknown> = { b: 2, a: 2 };
    const diffs = diffConfigs(original, modified);
    expect(diffs[0].path).toBe('a');
    expect(diffs[1].path).toBe('b');
  });
});

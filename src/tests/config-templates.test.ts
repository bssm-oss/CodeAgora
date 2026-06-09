/**
 * Tests for src/config/templates.ts
 */

import { describe, it, expect } from 'vitest';
import {
  generateFullTemplate,
  generateMinimalTemplate,
  generateDeclarativeTemplate,
  generateMultiProviderTemplate,
} from '@codeagora/core/config/templates.js';

describe('generateFullTemplate', () => {
  it('should return valid parseable JSON', () => {
    const output = generateFullTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should contain 5 reviewers in JSON output', () => {
    const output = generateFullTemplate('json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.reviewers)).toBe(true);
    expect(parsed.reviewers).toHaveLength(5);
  });

  it('should start with the full config YAML header', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toMatch(/^# CodeAgora Configuration \(full\)/);
  });

  it('should contain expected top-level keys in JSON', () => {
    const output = generateFullTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('reviewers');
    expect(parsed).toHaveProperty('supporters');
    expect(parsed).toHaveProperty('moderator');
    expect(parsed).toHaveProperty('discussion');
    expect(parsed).toHaveProperty('errorHandling');
  });

  it('should contain expected top-level keys in YAML', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toContain('reviewers');
    expect(output).toContain('supporters');
    expect(output).toContain('moderator');
    expect(output).toContain('discussion');
    expect(output).toContain('errorHandling');
  });
});

describe('generateMinimalTemplate', () => {
  it('should return valid parseable JSON', () => {
    const output = generateMinimalTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should contain exactly 1 reviewer in JSON output', () => {
    const output = generateMinimalTemplate('json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.reviewers)).toBe(true);
    expect(parsed.reviewers).toHaveLength(1);
  });

  it('should start with the minimal config YAML header', () => {
    const output = generateMinimalTemplate('yaml');
    expect(output).toMatch(/^# CodeAgora Configuration \(minimal\)/);
  });

  it('should contain expected top-level keys in JSON', () => {
    const output = generateMinimalTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('reviewers');
    expect(parsed).toHaveProperty('supporters');
    expect(parsed).toHaveProperty('moderator');
    expect(parsed).toHaveProperty('discussion');
    expect(parsed).toHaveProperty('errorHandling');
  });
});

describe('generateDeclarativeTemplate', () => {
  it('should return valid parseable JSON', () => {
    const output = generateDeclarativeTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should have reviewers with a count field (not an array) in JSON', () => {
    const output = generateDeclarativeTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed.reviewers).toBeDefined();
    expect(Array.isArray(parsed.reviewers)).toBe(false);
    expect(typeof parsed.reviewers.count).toBe('number');
  });

  it('should start with the declarative config YAML header', () => {
    const output = generateDeclarativeTemplate('yaml');
    expect(output).toMatch(/^# CodeAgora Configuration \(declarative\)/);
  });

  it('should contain expected top-level keys in JSON', () => {
    const output = generateDeclarativeTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('reviewers');
    expect(parsed).toHaveProperty('supporters');
    expect(parsed).toHaveProperty('moderator');
    expect(parsed).toHaveProperty('discussion');
    expect(parsed).toHaveProperty('errorHandling');
  });
});

describe('generateMultiProviderTemplate', () => {
  it('should return valid parseable JSON', () => {
    const output = generateMultiProviderTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should contain 5 OpenRouter reviewers from diverse models (L1)', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.reviewers)).toBe(true);
    expect(parsed.reviewers).toHaveLength(5);
    const providers = parsed.reviewers.map((r: any) => r.provider);
    const models = parsed.reviewers.map((r: any) => r.model);
    expect(new Set(providers)).toEqual(new Set(['openrouter']));
    expect(new Set(models).size).toBe(5);
  });

  it('should have L2 supporters from OpenRouter reasoning-capable models', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed.supporters.pool).toHaveLength(2);
    const models = parsed.supporters.pool.map((s: any) => s.model);
    expect(models).toEqual(['openai/gpt-oss-120b', 'z-ai/glm-4.7-flash']);
    expect(parsed.supporters.pool.every((s: any) => s.provider === 'openrouter')).toBe(true);
  });

  it('should have L3 head using OpenRouter head model', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed.head.provider).toBe('openrouter');
    expect(parsed.head.model).toBe('qwen/qwen3-235b-a22b-2507');
  });

  it('should start with the multi-provider YAML header', () => {
    const output = generateMultiProviderTemplate('yaml');
    expect(output).toMatch(/^# CodeAgora Configuration \(multi-provider\)/);
  });

  it('should contain expected top-level keys in JSON', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('reviewers');
    expect(parsed).toHaveProperty('supporters');
    expect(parsed).toHaveProperty('moderator');
    expect(parsed).toHaveProperty('discussion');
    expect(parsed).toHaveProperty('head');
    expect(parsed).toHaveProperty('errorHandling');
  });

  it('should use review-grade timeouts for L2 supporters and L1 reviewers', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    const reviewerTimeout = parsed.reviewers[0].timeout;
    const supporterTimeout = parsed.supporters.pool[0].timeout;
    expect(reviewerTimeout).toBeGreaterThanOrEqual(120);
    expect(supporterTimeout).toBeGreaterThanOrEqual(reviewerTimeout);
  });
});

describe('round-trip JSON parsing', () => {
  it('generateFullTemplate json round-trips through JSON.parse', () => {
    const output = generateFullTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it('generateMinimalTemplate json round-trips through JSON.parse', () => {
    const output = generateMinimalTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it('generateDeclarativeTemplate json round-trips through JSON.parse', () => {
    const output = generateDeclarativeTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it('generateMultiProviderTemplate json round-trips through JSON.parse', () => {
    const output = generateMultiProviderTemplate('json');
    const parsed = JSON.parse(output);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });
});

describe('YAML structure', () => {
  it('generateFullTemplate yaml contains supporters key', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toContain('supporters');
  });

  it('generateFullTemplate yaml contains moderator key', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toContain('moderator');
  });

  it('generateFullTemplate yaml contains discussion key', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toContain('discussion');
  });

  it('generateFullTemplate yaml contains errorHandling key', () => {
    const output = generateFullTemplate('yaml');
    expect(output).toContain('errorHandling');
  });

  it('generateDeclarativeTemplate yaml contains count key', () => {
    const output = generateDeclarativeTemplate('yaml');
    expect(output).toContain('count:');
  });
});

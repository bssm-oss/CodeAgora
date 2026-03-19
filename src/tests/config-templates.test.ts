/**
 * Tests for src/config/templates.ts
 */

import { describe, it, expect } from 'vitest';
import {
  generateFullTemplate,
  generateMinimalTemplate,
  generateDeclarativeTemplate,
} from '@codeagora/core/config/templates.js';

describe('generateFullTemplate', () => {
  it('should return valid parseable JSON', () => {
    const output = generateFullTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should contain 3 reviewers in JSON output', () => {
    const output = generateFullTemplate('json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.reviewers)).toBe(true);
    expect(parsed.reviewers).toHaveLength(3);
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

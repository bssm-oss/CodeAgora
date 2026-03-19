/**
 * Config Converter & Template Tests
 */

import { describe, it, expect } from 'vitest';
import { parse as yamlParse } from 'yaml';
import { jsonToYaml, yamlToJson, configToYaml } from '@codeagora/core/config/converter.js';
import {
  generateFullTemplate,
  generateMinimalTemplate,
  generateDeclarativeTemplate,
} from '@codeagora/core/config/templates.js';
import { validateConfig } from '@codeagora/core/types/config.js';

// ============================================================================
// Shared fixture
// ============================================================================

const SAMPLE_JSON = JSON.stringify({
  reviewers: [
    { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [
      { id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: { model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
});

// ============================================================================
// jsonToYaml
// ============================================================================

describe('jsonToYaml', () => {
  it('returns format: yaml', () => {
    const result = jsonToYaml(SAMPLE_JSON);
    expect(result.format).toBe('yaml');
  });

  it('produces parseable YAML', () => {
    const result = jsonToYaml(SAMPLE_JSON);
    const parsed = yamlParse(result.content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('preserves data values', () => {
    const result = jsonToYaml(SAMPLE_JSON);
    const parsed = yamlParse(result.content) as Record<string, unknown>;
    const reviewers = parsed.reviewers as Array<Record<string, unknown>>;
    expect(reviewers[0].id).toBe('r1');
    expect(reviewers[0].provider).toBe('groq');
  });

  it('throws on invalid JSON input', () => {
    expect(() => jsonToYaml('{ not valid json')).toThrow(/JSON parse error/i);
  });

  it('returns no warnings for valid input', () => {
    const result = jsonToYaml(SAMPLE_JSON);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// yamlToJson
// ============================================================================

describe('yamlToJson', () => {
  it('returns format: json', () => {
    const { content: yaml } = jsonToYaml(SAMPLE_JSON);
    const result = yamlToJson(yaml);
    expect(result.format).toBe('json');
  });

  it('produces parseable JSON', () => {
    const { content: yaml } = jsonToYaml(SAMPLE_JSON);
    const result = yamlToJson(yaml);
    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('preserves data values', () => {
    const { content: yaml } = jsonToYaml(SAMPLE_JSON);
    const result = yamlToJson(yaml);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    const reviewers = parsed.reviewers as Array<Record<string, unknown>>;
    expect(reviewers[0].id).toBe('r1');
  });

  it('throws on invalid YAML input', () => {
    expect(() => yamlToJson('key: [unclosed bracket')).toThrow(/YAML parse error/i);
  });

  it('returns no warnings for valid input', () => {
    const { content: yaml } = jsonToYaml(SAMPLE_JSON);
    const result = yamlToJson(yaml);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// Round-trip: JSON → YAML → JSON
// ============================================================================

describe('round-trip conversion', () => {
  it('json → yaml → json preserves data deeply', () => {
    const yamlResult = jsonToYaml(SAMPLE_JSON);
    const jsonResult = yamlToJson(yamlResult.content);

    const original = JSON.parse(SAMPLE_JSON) as unknown;
    const roundTripped = JSON.parse(jsonResult.content) as unknown;

    expect(roundTripped).toEqual(original);
  });

  it('json → yaml → json preserves nested nulls (SUGGESTION threshold)', () => {
    const yamlResult = jsonToYaml(SAMPLE_JSON);
    const jsonResult = yamlToJson(yamlResult.content);
    const parsed = JSON.parse(jsonResult.content) as {
      discussion: { registrationThreshold: { SUGGESTION: unknown } };
    };
    expect(parsed.discussion.registrationThreshold.SUGGESTION).toBeNull();
  });
});

// ============================================================================
// configToYaml
// ============================================================================

describe('configToYaml', () => {
  it('returns a non-empty string', () => {
    const yaml = configToYaml({ key: 'value' });
    expect(yaml.length).toBeGreaterThan(0);
  });

  it('includes a comment header', () => {
    const yaml = configToYaml({ key: 'value' });
    expect(yaml).toMatch(/^#/);
  });

  it('produces parseable YAML', () => {
    const yaml = configToYaml(JSON.parse(SAMPLE_JSON) as object);
    expect(() => yamlParse(yaml)).not.toThrow();
  });
});

// ============================================================================
// generateFullTemplate
// ============================================================================

describe('generateFullTemplate', () => {
  it('json format produces valid JSON', () => {
    const output = generateFullTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('json template passes validateConfig', () => {
    const data = JSON.parse(generateFullTemplate('json')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('yaml format produces parseable YAML', () => {
    const output = generateFullTemplate('yaml');
    expect(() => yamlParse(output)).not.toThrow();
  });

  it('yaml template passes validateConfig', () => {
    const data = yamlParse(generateFullTemplate('yaml')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('json and yaml templates contain same data', () => {
    const jsonData = JSON.parse(generateFullTemplate('json')) as unknown;
    const yamlData = yamlParse(generateFullTemplate('yaml')) as unknown;
    expect(yamlData).toEqual(jsonData);
  });
});

// ============================================================================
// generateMinimalTemplate
// ============================================================================

describe('generateMinimalTemplate', () => {
  it('json format produces valid JSON', () => {
    const output = generateMinimalTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('json template passes validateConfig', () => {
    const data = JSON.parse(generateMinimalTemplate('json')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('yaml format produces parseable YAML', () => {
    const output = generateMinimalTemplate('yaml');
    expect(() => yamlParse(output)).not.toThrow();
  });

  it('yaml template passes validateConfig', () => {
    const data = yamlParse(generateMinimalTemplate('yaml')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('yaml output starts with a comment header', () => {
    const output = generateMinimalTemplate('yaml');
    expect(output.trimStart()).toMatch(/^#/);
  });

  it('json and yaml templates contain same data', () => {
    const jsonData = JSON.parse(generateMinimalTemplate('json')) as unknown;
    const yamlData = yamlParse(generateMinimalTemplate('yaml')) as unknown;
    expect(yamlData).toEqual(jsonData);
  });
});

// ============================================================================
// generateDeclarativeTemplate
// ============================================================================

describe('generateDeclarativeTemplate', () => {
  it('json format produces valid JSON', () => {
    const output = generateDeclarativeTemplate('json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('json template passes validateConfig', () => {
    const data = JSON.parse(generateDeclarativeTemplate('json')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('yaml format produces parseable YAML', () => {
    const output = generateDeclarativeTemplate('yaml');
    expect(() => yamlParse(output)).not.toThrow();
  });

  it('yaml template passes validateConfig', () => {
    const data = yamlParse(generateDeclarativeTemplate('yaml')) as unknown;
    expect(() => validateConfig(data)).not.toThrow();
  });

  it('uses declarative reviewers format (count field present)', () => {
    const data = JSON.parse(generateDeclarativeTemplate('json')) as {
      reviewers: { count: number };
    };
    expect(typeof data.reviewers.count).toBe('number');
    expect(data.reviewers.count).toBeGreaterThan(0);
  });

  it('json and yaml templates contain same data', () => {
    const jsonData = JSON.parse(generateDeclarativeTemplate('json')) as unknown;
    const yamlData = yamlParse(generateDeclarativeTemplate('yaml')) as unknown;
    expect(yamlData).toEqual(jsonData);
  });
});

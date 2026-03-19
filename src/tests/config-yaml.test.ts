/**
 * YAML Config Loader Tests (TDD)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Minimal valid YAML config content
const validYaml = `reviewers:
  - id: r1
    backend: codex
    model: o4-mini
    enabled: true
    timeout: 120
  - id: r2
    backend: gemini
    model: gemini-flash
    enabled: true
    timeout: 120
supporters:
  pool:
    - id: sp1
      backend: api
      provider: groq
      model: llama-3.3-70b
      enabled: true
      timeout: 60
  pickCount: 1
  pickStrategy: random
  devilsAdvocate:
    id: da
    backend: api
    provider: groq
    model: llama-3.3-70b
    enabled: true
    timeout: 60
  personaPool:
    - persona.md
  personaAssignment: random
moderator:
  backend: codex
  model: claude-sonnet
discussion:
  maxRounds: 3
  registrationThreshold:
    HARSHLY_CRITICAL: 1
    CRITICAL: 1
    WARNING: 2
    SUGGESTION: null
  codeSnippetRange: 10
errorHandling:
  maxRetries: 2
  forfeitThreshold: 0.7
`;

const validConfigJson = {
  reviewers: [
    { id: 'r1', backend: 'codex', model: 'o4-mini', enabled: true, timeout: 120 },
    { id: 'r2', backend: 'gemini', model: 'gemini-flash', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [{ id: 'sp1', backend: 'api', provider: 'groq', model: 'llama-3.3-70b', enabled: true, timeout: 60 }],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da', backend: 'api', provider: 'groq', model: 'llama-3.3-70b', enabled: true, timeout: 60 },
    personaPool: ['persona.md'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'codex', model: 'claude-sonnet' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

// Broken YAML — unclosed flow sequence
const invalidYaml = `reviewers:
  - id: r1
    backend: [unclosed
    model: o4-mini
`;

// YAML with an invalid backend value (fails zod)
const invalidSchemaYaml = `reviewers:
  - id: r1
    backend: NOT_A_VALID_BACKEND
    model: o4-mini
    enabled: true
    timeout: 120
supporters:
  pool: []
  pickCount: 1
  pickStrategy: random
  devilsAdvocate:
    id: da
    backend: api
    provider: groq
    model: test
    enabled: true
    timeout: 60
  personaPool: []
  personaAssignment: random
moderator:
  backend: codex
  model: test
discussion:
  maxRounds: 3
  registrationThreshold:
    HARSHLY_CRITICAL: 1
    CRITICAL: 1
    WARNING: 2
    SUGGESTION: null
  codeSnippetRange: 10
errorHandling:
  maxRetries: 2
  forfeitThreshold: 0.7
`;

// ============================================================================
// Helpers
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-yaml-test-'));
  await fs.mkdir(path.join(tmpDir, '.ca'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Import the testable loader function (explicit base dir — no chdir needed)
import { loadConfigFrom } from '@codeagora/core/config/loader.js';

// ============================================================================
// Tests
// ============================================================================

describe('YAML Config Loading', () => {
  it('should load .ca/config.yaml when present', async () => {
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yaml'), validYaml, 'utf-8');

    const config = await loadConfigFrom(tmpDir);

    expect(config.reviewers).toHaveLength(2);
    expect((config.reviewers as Array<{ id: string }>)[0].id).toBe('r1');
  });

  it('should load .ca/config.yml when present', async () => {
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yml'), validYaml, 'utf-8');

    const config = await loadConfigFrom(tmpDir);

    expect(config.reviewers).toHaveLength(2);
    expect((config.reviewers as Array<{ id: string }>)[1].id).toBe('r2');
  });

  it('should prefer .ca/config.json over .ca/config.yaml and emit a warning', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.ca', 'config.json'),
      JSON.stringify(validConfigJson, null, 2),
      'utf-8'
    );
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yaml'), validYaml, 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = await loadConfigFrom(tmpDir);

    expect(config.reviewers).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/config\.json.*config\.yaml|both.*json.*yaml/i);

    warnSpy.mockRestore();
  });

  it('should throw a descriptive error on YAML syntax errors', async () => {
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yaml'), invalidYaml, 'utf-8');

    await expect(loadConfigFrom(tmpDir)).rejects.toThrow(/YAML.*parse|parse.*YAML|invalid yaml/i);
  });

  it('should validate YAML content against zod schema (valid)', async () => {
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yaml'), validYaml, 'utf-8');

    await expect(loadConfigFrom(tmpDir)).resolves.toBeDefined();
  });

  it('should throw on YAML content that fails zod schema validation', async () => {
    await fs.writeFile(path.join(tmpDir, '.ca', 'config.yaml'), invalidSchemaYaml, 'utf-8');

    await expect(loadConfigFrom(tmpDir)).rejects.toThrow();
  });

  it('should preserve original error message when neither JSON nor YAML exists', async () => {
    await expect(loadConfigFrom(tmpDir)).rejects.toThrow(/config file not found|run setup/i);
  });
});

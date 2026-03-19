/**
 * CLI Init Wizard Tests — buildCustomConfig and non-interactive runInit
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import { buildCustomConfig, runInit, type CustomConfigParams } from '@codeagora/cli/commands/init.js';

// ============================================================================
// buildCustomConfig
// ============================================================================

describe('buildCustomConfig()', () => {
  it('creates config with 3 reviewers when reviewerCount is 3', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as unknown[];
    expect(reviewers).toHaveLength(3);
  });

  it('assigns groq provider to all reviewers', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as Array<Record<string, unknown>>;
    for (const reviewer of reviewers) {
      expect(reviewer['provider']).toBe('groq');
    }
  });

  it('gives reviewers sequential IDs r1, r2, r3', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as Array<Record<string, unknown>>;
    expect(reviewers[0]!['id']).toBe('r1');
    expect(reviewers[1]!['id']).toBe('r2');
    expect(reviewers[2]!['id']).toBe('r3');
  });

  it('assigns the chosen model to all reviewers', () => {
    const config = buildCustomConfig({
      provider: 'mistral',
      model: 'mistral-large-latest',
      reviewerCount: 1,
      discussion: false,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as Array<Record<string, unknown>>;
    expect(reviewers[0]!['model']).toBe('mistral-large-latest');
    expect(reviewers[0]!['provider']).toBe('mistral');
  });

  it('includes a supporter and devil\'s advocate', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const supporters = config['supporters'] as Record<string, unknown>;
    const pool = supporters['pool'] as unknown[];
    expect(pool).toHaveLength(1);
    expect(supporters['devilsAdvocate']).toBeDefined();
    const da = supporters['devilsAdvocate'] as Record<string, unknown>;
    expect(da['id']).toBe('da');
  });

  it('includes moderator with same provider/model', () => {
    const config = buildCustomConfig({
      provider: 'google',
      model: 'gemini-2.0-flash',
      reviewerCount: 1,
      discussion: true,
    }) as Record<string, unknown>;

    const moderator = config['moderator'] as Record<string, unknown>;
    expect(moderator['provider']).toBe('google');
    expect(moderator['model']).toBe('gemini-2.0-flash');
  });

  it('sets discussion maxRounds to 4 when discussion is enabled', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const discussion = config['discussion'] as Record<string, unknown>;
    expect(discussion['maxRounds']).toBe(4);
  });

  it('sets discussion maxRounds to 0 when discussion is disabled', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: false,
    }) as Record<string, unknown>;

    const discussion = config['discussion'] as Record<string, unknown>;
    expect(discussion['maxRounds']).toBe(0);
  });

  it('includes registrationThreshold defaults regardless of discussion flag', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 1,
      discussion: false,
    }) as Record<string, unknown>;

    const discussion = config['discussion'] as Record<string, unknown>;
    const threshold = discussion['registrationThreshold'] as Record<string, unknown>;
    expect(threshold['HARSHLY_CRITICAL']).toBe(1);
    expect(threshold['CRITICAL']).toBe(1);
    expect(threshold['WARNING']).toBe(2);
  });

  it('sets errorHandling defaults: maxRetries 2, forfeitThreshold 0.7', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    }) as Record<string, unknown>;

    const errorHandling = config['errorHandling'] as Record<string, unknown>;
    expect(errorHandling['maxRetries']).toBe(2);
    expect(errorHandling['forfeitThreshold']).toBe(0.7);
  });

  it('creates config with 5 reviewers', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 5,
      discussion: true,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as unknown[];
    expect(reviewers).toHaveLength(5);
  });

  it('creates config with 1 reviewer', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 1,
      discussion: false,
    }) as Record<string, unknown>;

    const reviewers = config['reviewers'] as unknown[];
    expect(reviewers).toHaveLength(1);
  });
});

// ============================================================================
// runInit with --yes / non-interactive path
// ============================================================================

describe('runInit() non-interactive (--yes equivalent)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-wizard-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates config.json with minimal template', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.ca', 'config.json'));
    const content = await fs.readFile(path.join(tmpDir, '.ca', 'config.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('reviewers');
    expect(parsed).toHaveProperty('supporters');
    expect(parsed).toHaveProperty('discussion');
  });

  it('creates .reviewignore', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.created).toContain(path.join(tmpDir, '.reviewignore'));
  });

  it('returns no warnings on normal init', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });
    expect(result.warnings).toHaveLength(0);
  });
});

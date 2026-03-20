/**
 * Tests for enhanced providers command (Phase 4)
 * - listProviders with/without catalog enrichment
 * - formatProviderList with/without model counts
 * - CLI backends section rendering
 */

import { describe, it, expect } from 'vitest';
import type { DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import type { ProviderInfo } from '@codeagora/cli/commands/providers.js';
import { formatProviderList, formatCliBackends } from '@codeagora/cli/commands/providers.js';

// ============================================================================
// listProviders with catalog — unit tests on ProviderInfo shape
// ============================================================================

describe('listProviders with catalog enrichment', () => {
  it('ProviderInfo with catalog data has modelCount and freeModelCount', () => {
    const info: ProviderInfo = {
      name: 'groq',
      apiKeyEnvVar: 'GROQ_API_KEY',
      apiKeySet: true,
      modelCount: 15,
      freeModelCount: 15,
    };
    expect(info.modelCount).toBe(15);
    expect(info.freeModelCount).toBe(15);
  });

  it('ProviderInfo without catalog has undefined counts', () => {
    const info: ProviderInfo = {
      name: 'groq',
      apiKeyEnvVar: 'GROQ_API_KEY',
      apiKeySet: false,
    };
    expect(info.modelCount).toBeUndefined();
    expect(info.freeModelCount).toBeUndefined();
  });
});

// ============================================================================
// formatProviderList Tests
// ============================================================================

describe('formatProviderList', () => {
  it('should render basic table without model columns when no catalog data', () => {
    const providers: ProviderInfo[] = [
      { name: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', apiKeySet: true },
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: false },
    ];

    const output = formatProviderList(providers);

    expect(output).toContain('Provider');
    expect(output).toContain('API Key');
    expect(output).toContain('Status');
    expect(output).toContain('openai');
    expect(output).toContain('groq');
    expect(output).toContain('available');
    expect(output).toContain('no key');
    // Should NOT contain model columns
    expect(output).not.toContain('Models');
    expect(output).not.toContain('Free');
  });

  it('should show Models and Free columns when catalog data present', () => {
    const providers: ProviderInfo[] = [
      { name: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', apiKeySet: true, modelCount: 48, freeModelCount: 0 },
      { name: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', apiKeySet: true, modelCount: 15, freeModelCount: 15 },
    ];

    const output = formatProviderList(providers);

    expect(output).toContain('Models');
    expect(output).toContain('Free');
    expect(output).toContain('48');
    expect(output).toContain('15');
  });

  it('should show dashes for providers without catalog data in mixed list', () => {
    const providers: ProviderInfo[] = [
      { name: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', apiKeySet: true, modelCount: 48, freeModelCount: 0 },
      { name: 'custom', apiKeyEnvVar: 'CUSTOM_API_KEY', apiKeySet: false },
    ];

    const output = formatProviderList(providers);

    // One provider has catalog data, so Models/Free columns should exist
    expect(output).toContain('Models');
    expect(output).toContain('-');
  });

  it('should append CLI backends section when provided', () => {
    const providers: ProviderInfo[] = [
      { name: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', apiKeySet: true },
    ];
    const cliBackends: DetectedCli[] = [
      { backend: 'claude', bin: 'claude', available: true },
      { backend: 'codex', bin: 'codex', available: false },
    ];

    const output = formatProviderList(providers, cliBackends);

    expect(output).toContain('CLI Backends');
    expect(output).toContain('claude');
    expect(output).toContain('codex');
    expect(output).toContain('available');
    expect(output).toContain('not found');
  });

  it('should not append CLI section when no backends provided', () => {
    const providers: ProviderInfo[] = [
      { name: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', apiKeySet: true },
    ];

    const output = formatProviderList(providers);
    expect(output).not.toContain('CLI Backends');
  });
});

// ============================================================================
// formatCliBackends Tests
// ============================================================================

describe('formatCliBackends', () => {
  it('should render header and divider', () => {
    const backends: DetectedCli[] = [
      { backend: 'claude', bin: 'claude', available: true },
    ];

    const output = formatCliBackends(backends);

    expect(output).toContain('CLI Backends');
    expect(output).toContain('Binary');
    expect(output).toContain('Status');
    expect(output).toContain('\u2500'); // divider
  });

  it('should show checkmark for available backends', () => {
    const backends: DetectedCli[] = [
      { backend: 'claude', bin: 'claude', available: true },
    ];

    const output = formatCliBackends(backends);
    expect(output).toContain('\u2713');
    expect(output).toContain('available');
  });

  it('should show X for unavailable backends', () => {
    const backends: DetectedCli[] = [
      { backend: 'gemini', bin: 'gemini', available: false },
    ];

    const output = formatCliBackends(backends);
    expect(output).toContain('\u2717');
    expect(output).toContain('not found');
  });

  it('should render mix of found and not-found correctly', () => {
    const backends: DetectedCli[] = [
      { backend: 'claude', bin: 'claude', available: true },
      { backend: 'codex', bin: 'codex', available: true },
      { backend: 'gemini', bin: 'gemini', available: false },
      { backend: 'opencode', bin: 'opencode', available: false },
      { backend: 'copilot', bin: 'copilot', available: true },
    ];

    const output = formatCliBackends(backends);

    // Count available/not-found markers
    const lines = output.split('\n');
    // Header + divider + 5 backends = 7 lines
    expect(lines.length).toBe(7);

    // Check each backend is listed
    expect(output).toContain('claude');
    expect(output).toContain('codex');
    expect(output).toContain('gemini');
    expect(output).toContain('opencode');
    expect(output).toContain('copilot');
  });
});

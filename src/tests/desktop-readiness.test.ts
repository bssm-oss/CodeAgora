import { describe, expect, it } from 'vitest';
import {
  activeReviewerCount,
  configuredApiProviders,
  evaluateProviderCredentialGate,
  evaluateConfigPolicy,
  missingProviderCredentialRequirements,
  providerCredentialRequirements,
} from '../../packages/desktop/src/readiness.js';

describe('desktop readiness helpers', () => {
  it('treats empty reviewer arrays as incomplete policy', () => {
    expect(evaluateConfigPolicy('{"reviewers":[]}')).toEqual({
      activeReviewers: 0,
      complete: false,
      validJson: true,
    });
  });

  it('ignores disabled reviewer entries when counting active reviewers', () => {
    const raw = JSON.stringify({
      reviewers: [
        { id: 'off', enabled: false },
        { id: 'on', enabled: true },
      ],
    });

    expect(evaluateConfigPolicy(raw)).toMatchObject({
      activeReviewers: 1,
      complete: true,
      validJson: true,
    });
  });

  it('supports declarative reviewer count configs', () => {
    expect(activeReviewerCount({ count: 3 })).toBe(3);
    expect(evaluateConfigPolicy('{"reviewers":{"count":3}}')).toMatchObject({
      activeReviewers: 3,
      complete: true,
      validJson: true,
    });
  });

  it('marks invalid JSON as invalid and incomplete', () => {
    expect(evaluateConfigPolicy('{ invalid json')).toEqual({
      activeReviewers: undefined,
      complete: false,
      validJson: false,
    });
  });

  it('extracts API providers used by active desktop review agents', () => {
    const raw = JSON.stringify({
      reviewers: [
        { id: 'off', backend: 'api', provider: 'anthropic', enabled: false },
        { id: 'r1', backend: 'api', provider: 'openrouter' },
        { id: 'local', backend: 'cli', provider: 'codex' },
      ],
      supporters: {
        pool: [{ id: 's1', backend: 'api', provider: 'groq' }],
        devilsAdvocate: { id: 'da', backend: 'api', provider: 'openrouter' },
      },
      head: { backend: 'api', provider: 'openai' },
    });

    expect(configuredApiProviders(raw)).toEqual(['openrouter', 'groq', 'openai']);
  });

  it('does not require discussion-only providers when discussion is disabled', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
      discussion: { enabled: false },
      supporters: {
        pool: [{ id: 's1', backend: 'api', provider: 'groq' }],
        devilsAdvocate: { id: 'da', backend: 'api', provider: 'anthropic' },
      },
      moderator: { backend: 'api', provider: 'google', model: 'gemini' },
      head: { backend: 'api', provider: 'openai' },
    });

    expect(configuredApiProviders(raw)).toEqual(['openrouter', 'openai']);
    expect(providerCredentialRequirements(raw, [
      {
        name: 'OpenRouter API key',
        kind: 'api',
        configured: true,
      },
      {
        name: 'OpenAI API key',
        kind: 'api',
        configured: true,
      },
    ])).toEqual([
      {
        provider: 'openrouter',
        envVar: 'OPENROUTER_API_KEY',
        configured: true,
        sourceCount: 1,
      },
      {
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
        configured: true,
        sourceCount: 1,
      },
    ]);
  });

  it('maps configured API providers to env vars and detected credential status', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
      head: { backend: 'api', provider: 'openai' },
    });

    expect(providerCredentialRequirements(raw, [
      {
        name: 'OpenRouter API key',
        kind: 'api',
        configured: true,
      },
    ])).toEqual([
      {
        provider: 'openrouter',
        envVar: 'OPENROUTER_API_KEY',
        configured: true,
        sourceCount: 1,
      },
      {
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
        configured: false,
        sourceCount: 1,
      },
    ]);
  });

  it('reports partial provider credential gaps after provider status is known', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
      head: { backend: 'api', provider: 'openai' },
    });

    expect(missingProviderCredentialRequirements(raw, [
      {
        name: 'OpenRouter API key',
        kind: 'api',
        configured: true,
      },
    ])).toEqual([
      {
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
        configured: false,
        sourceCount: 1,
      },
    ]);
  });

  it('does not report credential gaps before provider status loads', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
    });

    expect(missingProviderCredentialRequirements(raw, [])).toEqual([]);
  });

  it('blocks API provider readiness until provider status is loaded', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
    });

    expect(evaluateProviderCredentialGate(raw, [], false)).toMatchObject({
      status: 'unknown',
      required: true,
      missing: [],
    });
  });

  it('blocks API provider readiness when provider status loading fails', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
    });

    expect(evaluateProviderCredentialGate(raw, [], false, 'doctor failed')).toMatchObject({
      status: 'failed',
      required: true,
      missing: [],
      error: 'doctor failed',
    });
  });

  it('reports missing and ready provider credential gate states after provider status loads', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'api', provider: 'openrouter' }],
    });

    expect(evaluateProviderCredentialGate(raw, [], true)).toMatchObject({
      status: 'missing',
      required: true,
      missing: [
        {
          provider: 'openrouter',
          envVar: 'OPENROUTER_API_KEY',
          configured: false,
          sourceCount: 1,
        },
      ],
    });
    expect(evaluateProviderCredentialGate(raw, [
      {
        name: 'OpenRouter API key',
        kind: 'api',
        configured: true,
      },
    ], true)).toMatchObject({
      status: 'ready',
      required: true,
      missing: [],
    });
  });

  it('does not gate local CLI-only provider configs on API credential status', () => {
    const raw = JSON.stringify({
      reviewers: [{ id: 'r1', backend: 'cli', provider: 'codex' }],
    });

    expect(evaluateProviderCredentialGate(raw, [], false)).toEqual({
      status: 'not-required',
      required: false,
      missing: [],
    });
  });
});

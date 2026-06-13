import { describe, expect, it } from 'vitest';
import {
  activeReviewerCount,
  configuredApiProviders,
  evaluateConfigPolicy,
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
});

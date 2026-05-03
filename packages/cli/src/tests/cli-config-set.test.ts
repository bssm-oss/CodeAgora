/**
 * Tests for commands/config-set.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setConfigValue, editConfig } from '../commands/config-set.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

// Mock i18n
vi.mock('@codeagora/shared/i18n/index.js', () => ({
  t: (key: string, args?: Record<string, unknown>) => `${key}(${JSON.stringify(args ?? {})})`,
}));

async function getFsMock() {
  const fs = await import('fs/promises');
  return fs.default as unknown as {
    access: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
  };
}

async function getSpawnSyncMock() {
  const { spawnSync } = await import('child_process');
  return spawnSync as ReturnType<typeof vi.fn>;
}

function validConfigJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reviewers: [
      { id: 'r1', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
    ],
    supporters: {
      pool: [
        { id: 's1', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: { id: 'da', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
      personaPool: ['.ca/personas/strict.md'],
      personaAssignment: 'random',
    },
    moderator: { backend: 'api', model: 'test', provider: 'groq' },
    discussion: {
      maxRounds: 3,
      registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
      codeSnippetRange: 10,
    },
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
    ...extra,
  });
}

describe('setConfigValue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no config file is found', async () => {
    const fs = await getFsMock();
    fs.access.mockRejectedValue(new Error('ENOENT'));

    await expect(setConfigValue('/base', 'key', 'val')).rejects.toThrow();
  });

  it('throws for YAML config (not yet supported)', async () => {
    const fs = await getFsMock();
    // JSON not found, YAML found
    fs.access
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);

    await expect(setConfigValue('/base', 'key', 'val')).rejects.toThrow(
      'YAML config editing is not yet supported',
    );
  });

  it('writes updated config with string value', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined); // JSON found
    fs.readFile.mockResolvedValue(validConfigJson({ existing: 'value' }));
    fs.writeFile.mockResolvedValue(undefined);

    await setConfigValue('/base', 'newKey', 'hello');

    expect(fs.writeFile).toHaveBeenCalledOnce();
    const written = JSON.parse((fs.writeFile.mock.calls[0] as any[])[1] as string);
    expect(written.newKey).toBe('hello');
    expect(written.existing).toBe('value');
  });

  it('coerces boolean string "true" to boolean true', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    fs.readFile.mockResolvedValue(validConfigJson());
    fs.writeFile.mockResolvedValue(undefined);

    await setConfigValue('/base', 'flag', 'true');

    const written = JSON.parse((fs.writeFile.mock.calls[0] as any[])[1] as string);
    expect(written.flag).toBe(true);
  });

  it('coerces boolean string "false" to boolean false', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    fs.readFile.mockResolvedValue(validConfigJson());
    fs.writeFile.mockResolvedValue(undefined);

    await setConfigValue('/base', 'flag', 'false');

    const written = JSON.parse((fs.writeFile.mock.calls[0] as any[])[1] as string);
    expect(written.flag).toBe(false);
  });

  it('coerces numeric string to number', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    fs.readFile.mockResolvedValue(validConfigJson());
    fs.writeFile.mockResolvedValue(undefined);

    await setConfigValue('/base', 'maxRounds', '5');

    const written = JSON.parse((fs.writeFile.mock.calls[0] as any[])[1] as string);
    expect(written.maxRounds).toBe(5);
  });

  it('sets nested key via dot notation', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    fs.readFile.mockResolvedValue(validConfigJson());
    fs.writeFile.mockResolvedValue(undefined);

    await setConfigValue('/base', 'discussion.maxRounds', '3');

    const written = JSON.parse((fs.writeFile.mock.calls[0] as any[])[1] as string);
    expect(written.discussion.maxRounds).toBe(3);
  });

  it('rejects invalid mutations without writing partial config', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    fs.readFile.mockResolvedValue(validConfigJson());
    fs.writeFile.mockResolvedValue(undefined);

    await expect(setConfigValue('/base', 'discussion.maxRounds', '0')).rejects.toThrow(/invalid|validation/i);

    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('editConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no config file is found', async () => {
    const fs = await getFsMock();
    fs.access.mockRejectedValue(new Error('ENOENT'));

    await expect(editConfig('/base')).rejects.toThrow();
  });

  it('opens editor when config file exists', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    const spawnSync = await getSpawnSyncMock();
    spawnSync.mockReturnValue({ error: null });

    await editConfig('/base');

    expect(spawnSync).toHaveBeenCalledOnce();
  });

  it('throws when editor fails to open', async () => {
    const fs = await getFsMock();
    fs.access.mockResolvedValueOnce(undefined);
    const spawnSync = await getSpawnSyncMock();
    spawnSync.mockReturnValue({ error: new Error('editor not found') });

    await expect(editConfig('/base')).rejects.toThrow('Failed to open editor');
  });
});

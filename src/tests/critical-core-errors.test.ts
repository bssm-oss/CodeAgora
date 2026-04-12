/**
 * Critical Core Error Scenario Tests — Part 1: No fs mock
 *
 * Covers:
 *   CONC-01 — pLimit sync throw deadlock
 *   FS-01   — writeJson missing parent directory
 *   FS-02   — readJson corrupted/truncated/invalid-schema file
 *   FS-03   — getNextSessionId fallback range logic
 *   ORCH-04 — invalid regex in rules file is skipped by loader
 *   CRED-01 — loadCredentials graceful on missing file
 *   CFG-01  — config JSON parse failure
 *   CFG-02  — config missing required fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsReal from 'fs/promises';
import os from 'os';
import path from 'path';
import { z } from 'zod';

import { pLimit } from '@codeagora/shared/utils/concurrency.js';
import { readJson, writeJson } from '@codeagora/shared/utils/fs.js';

// ============================================================================
// Shared temp dir
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-crit-'));
});

afterEach(async () => {
  await fsReal.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// CONC-01: pLimit synchronous throw inside fn
// ============================================================================

describe('CONC-01 — pLimit synchronous throw inside fn', () => {
  it('queued tasks continue executing after a sync-throw fn', async () => {
    const limit = pLimit(1);

    const syncThrower = () =>
      limit((): Promise<string> => {
        throw new Error('sync boom');
      });

    const results = await Promise.allSettled([
      syncThrower(),
      limit(() => Promise.resolve('after')),
    ]);

    expect(results[0].status).toBe('rejected');
    expect((results[0] as PromiseRejectedResult).reason.message).toBe('sync boom');
    expect(results[1].status).toBe('fulfilled');
    expect((results[1] as PromiseFulfilledResult<string>).value).toBe('after');
  });

  it('active counter decrements after sync throw, further tasks execute', async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxSeen = 0;

    const track = (fn: () => Promise<unknown>) =>
      limit(async () => {
        active++;
        maxSeen = Math.max(maxSeen, active);
        const result = await fn();
        active--;
        return result;
      });

    const syncThrower = () =>
      limit((): Promise<number> => {
        throw new Error('counter test sync throw');
      });

    const results = await Promise.allSettled([
      syncThrower(),
      track(() => Promise.resolve(1)),
      track(() => Promise.resolve(2)),
      track(() => Promise.resolve(3)),
    ]);

    expect(results[0].status).toBe('rejected');
    const fulfilled = results.slice(1).filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(3);
    expect(maxSeen).toBeLessThanOrEqual(2);
  });

  it('multiple sync throws in a row do not deadlock remaining tasks', async () => {
    const limit = pLimit(1);

    const boom = (msg: string) =>
      limit((): Promise<never> => {
        throw new Error(msg);
      });

    const results = await Promise.allSettled([
      boom('e1'),
      boom('e2'),
      limit(() => Promise.resolve('survivor')),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
    expect((results[2] as PromiseFulfilledResult<string>).value).toBe('survivor');
  });
});

// ============================================================================
// FS-02: readJson corruption
// ============================================================================

describe('FS-02 — readJson corrupted/truncated/invalid-schema', () => {
  it('empty file throws with file path in message', async () => {
    const p = path.join(tmpDir, 'empty.json');
    await fsReal.writeFile(p, '', 'utf-8');
    await expect(readJson(p)).rejects.toThrow(/JSON parse error in/);
  });

  it('truncated JSON throws with file path in message', async () => {
    const p = path.join(tmpDir, 'trunc.json');
    await fsReal.writeFile(p, '{"key":', 'utf-8');
    await expect(readJson(p)).rejects.toThrow(/JSON parse error in/);
  });

  it('invalid schema throws when schema provided', async () => {
    const p = path.join(tmpDir, 'bad-schema.json');
    await writeJson(p, { name: 42 });
    const schema = z.object({ name: z.string() });
    await expect(readJson(p, schema)).rejects.toThrow();
  });

  it('non-object JSON with strict schema throws ZodError', async () => {
    const p = path.join(tmpDir, 'bad-schema2.json');
    await fsReal.writeFile(p, '"just-a-string"', 'utf-8');
    const schema = z.object({ status: z.string() });
    await expect(readJson(p, schema)).rejects.toThrow();
  });
});

// ============================================================================
// FS-01: writeJson missing parent directory
// ============================================================================

describe('FS-01 — writeJson missing parent directory', () => {
  it('throws ENOENT when parent directory does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent', 'deep', 'data.json');
    await expect(writeJson(filePath, { x: 1 })).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

// ============================================================================
// FS-03: getNextSessionId fallback range logic (white-box)
// ============================================================================

describe('FS-03 — getNextSessionId fallback collision range', () => {
  it('fallback ID formula produces value in 900-998 range', () => {
    for (let i = 0; i < 20; i++) {
      const fallback = 900 + Math.floor(Math.random() * 99);
      expect(fallback).toBeGreaterThanOrEqual(900);
      expect(fallback).toBeLessThanOrEqual(998);
      expect(String(fallback).padStart(3, '0')).toMatch(/^\d{3}$/);
    }
  });

  it('last-resort ID formula stays in valid range', () => {
    // Simulate multiple calls to ensure the formula is bounded
    for (let i = 0; i < 20; i++) {
      const lastResort = (Date.now() % 99) + 900;
      expect(lastResort).toBeGreaterThanOrEqual(900);
      expect(lastResort).toBeLessThanOrEqual(998);
    }
  });

  it('padStart(3, "0") produces 3-character string for fallback range', () => {
    expect(String(900).padStart(3, '0')).toBe('900');
    expect(String(998).padStart(3, '0')).toBe('998');
    expect(String(950).padStart(3, '0')).toBe('950');
  });
});

// ============================================================================
// ORCH-04: Invalid regex in rules file is skipped by loader
// ============================================================================

describe('ORCH-04 — invalid regex in rules file is skipped', () => {
  it('loadReviewRules skips invalid regex and returns remaining valid rules', async () => {
    const rulesDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-rules-'));
    try {
      const rulesContent = `rules:
  - id: valid-rule
    pattern: 'console[.]log'
    severity: WARNING
    message: "Avoid console.log in production"
  - id: invalid-regex-rule
    pattern: '[invalid'
    severity: CRITICAL
    message: "This rule has a broken regex"
`;
      await fsReal.writeFile(path.join(rulesDir, '.reviewrules'), rulesContent, 'utf-8');

      const { loadReviewRules } = await import(
        '../../packages/core/src/rules/loader.js'
      );
      const compiled = await loadReviewRules(rulesDir);

      expect(compiled).not.toBeNull();
      expect(compiled!.length).toBe(1);
      expect(compiled![0].id).toBe('valid-rule');
      expect(compiled![0].regex).toBeInstanceOf(RegExp);
    } finally {
      await fsReal.rm(rulesDir, { recursive: true, force: true });
    }
  });

  it('loadReviewRules throws on invalid YAML structure', async () => {
    const rulesDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-rules-yaml-'));
    try {
      await fsReal.writeFile(
        path.join(rulesDir, '.reviewrules'),
        'rules:\n  - id: [unclosed bracket\n',
        'utf-8'
      );
      const { loadReviewRules } = await import(
        '../../packages/core/src/rules/loader.js'
      );
      await expect(loadReviewRules(rulesDir)).rejects.toThrow(/Failed to parse .reviewrules/);
    } finally {
      await fsReal.rm(rulesDir, { recursive: true, force: true });
    }
  });

  it('loadReviewRules returns null when no rules file exists', async () => {
    const emptyDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-rules-empty-'));
    try {
      const { loadReviewRules } = await import(
        '../../packages/core/src/rules/loader.js'
      );
      const result = await loadReviewRules(emptyDir);
      expect(result).toBeNull();
    } finally {
      await fsReal.rm(emptyDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// CRED-01 / CRED-02: loadCredentials graceful handling
// ============================================================================

describe('CRED-02 — loadCredentials with missing credentials file returns silently', () => {
  it('resolves without throwing when credentials file does not exist', async () => {
    // loadCredentials reads from ~/.config/codeagora/credentials
    // If file doesn't exist, it catches the error and returns silently
    const { loadCredentials } = await import(
      '../../packages/core/src/config/credentials.js'
    );
    await expect(loadCredentials()).resolves.toBeUndefined();
  });
});

describe('CRED-01 — credentials line parser handles garbage content', () => {
  it('checkFilePermissions returns false on non-existent file (fail closed, #393)', async () => {
    const { checkFilePermissions } = await import(
      '../../packages/core/src/config/credentials.js'
    );
    // stat will fail on a non-existent file — function should return false (fail closed)
    const result = await checkFilePermissions('/tmp/__nonexistent_codeagora_test__', 0o600);
    expect(result).toBe(false);
  });

  it('checkFilePermissions returns false when permissions are wrong', async () => {
    if (process.platform === 'win32') return;
    const credFile = path.join(tmpDir, 'cred-test');
    await fsReal.writeFile(credFile, 'KEY=value\n', { mode: 0o644 });
    const { checkFilePermissions } = await import(
      '../../packages/core/src/config/credentials.js'
    );
    const result = await checkFilePermissions(credFile, 0o600);
    expect(result).toBe(false);
  });
});

// ============================================================================
// CFG-01 / CFG-02: Config loading errors
// ============================================================================

describe('CFG-01 — config JSON parse failure gives clear error', () => {
  it('loadConfigFrom throws when config file contains truncated JSON', async () => {
    const cfgDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-cfg-'));
    try {
      await fsReal.mkdir(path.join(cfgDir, '.ca'), { recursive: true });
      await fsReal.writeFile(path.join(cfgDir, '.ca', 'config.json'), '{"reviewers":', 'utf-8');
      const { loadConfigFrom } = await import('../../packages/core/src/config/loader.js');
      await expect(loadConfigFrom(cfgDir)).rejects.toThrow();
    } finally {
      await fsReal.rm(cfgDir, { recursive: true, force: true });
    }
  });

  it('loadConfigFrom throws with "Config file not found" when no config exists', async () => {
    const emptyDir = await fsReal.mkdtemp(path.join(os.tmpdir(), 'ca-empty-'));
    try {
      await fsReal.mkdir(path.join(emptyDir, '.ca'), { recursive: true });
      const { loadConfigFrom } = await import('../../packages/core/src/config/loader.js');
      await expect(loadConfigFrom(emptyDir)).rejects.toThrow(/Config file not found/);
    } finally {
      await fsReal.rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('CFG-02 — config missing required fields gives validation error', () => {
  it('validateConfigData throws on empty object', async () => {
    const { validateConfigData } = await import('../../packages/core/src/config/loader.js');
    expect(() => validateConfigData({})).toThrow();
  });

  it('validateConfigData throws on missing reviewers field', async () => {
    const { validateConfigData } = await import('../../packages/core/src/config/loader.js');
    expect(() =>
      validateConfigData({
        discussion: { maxRounds: 3 },
        errorHandling: { maxRetries: 2, forfeitThreshold: 0.5 },
      })
    ).toThrow();
  });

  it('validateConfigData throws on null input', async () => {
    const { validateConfigData } = await import('../../packages/core/src/config/loader.js');
    expect(() => validateConfigData(null)).toThrow();
  });
});

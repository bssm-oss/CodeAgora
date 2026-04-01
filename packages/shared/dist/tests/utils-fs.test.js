/**
 * Tests for packages/shared/src/utils/fs.ts
 *
 * Covers: path helpers, JSON/Markdown I/O, ensureCaRoot, ensureDir.
 * Uses real filesystem operations in a per-test temp directory.
 * Does NOT use process.chdir() — all paths are absolute.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { CA_ROOT, getSessionDir, getReviewsDir, getDiscussionsDir, getUnconfirmedDir, getLogsDir, getConfigPath, getSuggestionsPath, getReportPath, getResultPath, getMetadataPath, ensureDir, ensureCaRoot, writeJson, readJson, writeMarkdown, readMarkdown, appendMarkdown, } from '@codeagora/shared/utils/fs.js';
// ---------------------------------------------------------------------------
// Per-test temp directory (absolute paths only — no process.chdir)
// ---------------------------------------------------------------------------
let tmpDir;
beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-fs-test-'));
});
afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});
// ---------------------------------------------------------------------------
// Path helpers — pure string functions, no I/O
// ---------------------------------------------------------------------------
describe('CA_ROOT', () => {
    it('is .ca', () => {
        expect(CA_ROOT).toBe('.ca');
    });
});
describe('getSessionDir', () => {
    it('returns .ca/sessions/{date}/{sessionId}', () => {
        expect(getSessionDir('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001'));
    });
});
describe('getReviewsDir', () => {
    it('is nested under session dir', () => {
        expect(getReviewsDir('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'reviews'));
    });
});
describe('getDiscussionsDir', () => {
    it('is nested under session dir', () => {
        expect(getDiscussionsDir('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'discussions'));
    });
});
describe('getUnconfirmedDir', () => {
    it('is nested under session dir', () => {
        expect(getUnconfirmedDir('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'unconfirmed'));
    });
});
describe('getLogsDir', () => {
    it('is .ca/logs/{date}/{sessionId}', () => {
        expect(getLogsDir('2026-03-21', '001')).toBe(path.join('.ca', 'logs', '2026-03-21', '001'));
    });
});
describe('getConfigPath', () => {
    it('is .ca/config.json', () => {
        expect(getConfigPath()).toBe(path.join('.ca', 'config.json'));
    });
});
describe('getSuggestionsPath', () => {
    it('is suggestions.md under session dir', () => {
        expect(getSuggestionsPath('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'suggestions.md'));
    });
});
describe('getReportPath', () => {
    it('is report.md under session dir', () => {
        expect(getReportPath('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'report.md'));
    });
});
describe('getResultPath', () => {
    it('is result.md under session dir', () => {
        expect(getResultPath('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'result.md'));
    });
});
describe('getMetadataPath', () => {
    it('is metadata.json under session dir', () => {
        expect(getMetadataPath('2026-03-21', '001')).toBe(path.join('.ca', 'sessions', '2026-03-21', '001', 'metadata.json'));
    });
});
// ---------------------------------------------------------------------------
// ensureDir — uses absolute paths inside tmpDir
// ---------------------------------------------------------------------------
describe('ensureDir', () => {
    it('creates a directory that does not exist', async () => {
        const target = path.join(tmpDir, 'new-dir', 'nested');
        await ensureDir(target);
        const stat = await fs.stat(target);
        expect(stat.isDirectory()).toBe(true);
    });
    it('does not throw when directory already exists', async () => {
        const target = path.join(tmpDir, 'already-exists');
        await fs.mkdir(target);
        await expect(ensureDir(target)).resolves.not.toThrow();
    });
    it('is idempotent on repeated calls', async () => {
        const target = path.join(tmpDir, 'idempotent');
        await ensureDir(target);
        await ensureDir(target);
        const stat = await fs.stat(target);
        expect(stat.isDirectory()).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// ensureCaRoot — uses absolute baseDir inside tmpDir
// ---------------------------------------------------------------------------
describe('ensureCaRoot', () => {
    it('creates .ca dir inside baseDir', async () => {
        const base = path.join(tmpDir, 'myproject');
        await fs.mkdir(base);
        await ensureCaRoot(base);
        const caPath = path.join(base, '.ca');
        const stat = await fs.stat(caPath);
        expect(stat.isDirectory()).toBe(true);
    });
    it('is idempotent — does not throw when .ca already exists', async () => {
        const base = path.join(tmpDir, 'existing');
        await fs.mkdir(base);
        await ensureCaRoot(base);
        await expect(ensureCaRoot(base)).resolves.not.toThrow();
    });
    it('sets 0o700 permissions on unix', async () => {
        if (process.platform === 'win32')
            return;
        const base = path.join(tmpDir, 'secure');
        await fs.mkdir(base);
        await ensureCaRoot(base);
        const caPath = path.join(base, '.ca');
        const stat = await fs.stat(caPath);
        expect(stat.mode & 0o777).toBe(0o700);
    });
    it('fixes wrong permissions on existing .ca dir', async () => {
        if (process.platform === 'win32')
            return;
        const base = path.join(tmpDir, 'fixperms');
        const caPath = path.join(base, '.ca');
        await fs.mkdir(caPath, { recursive: true });
        await fs.chmod(caPath, 0o755);
        await ensureCaRoot(base);
        const stat = await fs.stat(caPath);
        expect(stat.mode & 0o777).toBe(0o700);
    });
});
// ---------------------------------------------------------------------------
// writeJson / readJson
// ---------------------------------------------------------------------------
describe('writeJson / readJson', () => {
    it('round-trips a plain object', async () => {
        const filePath = path.join(tmpDir, 'data.json');
        const data = { name: 'test', count: 42, nested: { ok: true } };
        await writeJson(filePath, data);
        const result = await readJson(filePath);
        expect(result).toEqual(data);
    });
    it('writes valid pretty-printed JSON', async () => {
        const filePath = path.join(tmpDir, 'pretty.json');
        await writeJson(filePath, { key: 'value' });
        const raw = await fs.readFile(filePath, 'utf-8');
        expect(() => JSON.parse(raw)).not.toThrow();
        expect(raw).toContain('\n');
    });
    it('reads with zod schema validation', async () => {
        const { z } = await import('zod');
        const filePath = path.join(tmpDir, 'validated.json');
        await writeJson(filePath, { status: 'active', version: 3 });
        const schema = z.object({ status: z.string(), version: z.number() });
        const result = await readJson(filePath, schema);
        expect(result.status).toBe('active');
        expect(result.version).toBe(3);
    });
    it('readJson rejects when zod schema fails', async () => {
        const { z } = await import('zod');
        const filePath = path.join(tmpDir, 'bad.json');
        await writeJson(filePath, { status: 123 });
        const schema = z.object({ status: z.string() });
        await expect(readJson(filePath, schema)).rejects.toThrow();
    });
    it('readJson throws on missing file', async () => {
        await expect(readJson(path.join(tmpDir, 'nonexistent.json'))).rejects.toThrow();
    });
    it('round-trips arrays', async () => {
        const filePath = path.join(tmpDir, 'array.json');
        const arr = [1, 2, 3, 'hello'];
        await writeJson(filePath, arr);
        const result = await readJson(filePath);
        expect(result).toEqual(arr);
    });
});
// ---------------------------------------------------------------------------
// writeMarkdown / readMarkdown / appendMarkdown
// ---------------------------------------------------------------------------
describe('writeMarkdown', () => {
    it('writes string content to file', async () => {
        const filePath = path.join(tmpDir, 'doc.md');
        await writeMarkdown(filePath, '# Hello\n\nWorld');
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('# Hello\n\nWorld');
    });
    it('overwrites existing content', async () => {
        const filePath = path.join(tmpDir, 'overwrite.md');
        await writeMarkdown(filePath, 'first');
        await writeMarkdown(filePath, 'second');
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('second');
    });
});
describe('readMarkdown', () => {
    it('reads file content as string', async () => {
        const filePath = path.join(tmpDir, 'read.md');
        await fs.writeFile(filePath, '# Title\n', 'utf-8');
        const result = await readMarkdown(filePath);
        expect(result).toBe('# Title\n');
    });
    it('throws on missing file', async () => {
        await expect(readMarkdown(path.join(tmpDir, 'nope.md'))).rejects.toThrow();
    });
});
describe('appendMarkdown', () => {
    it('appends content to an existing file', async () => {
        const filePath = path.join(tmpDir, 'append.md');
        await writeMarkdown(filePath, 'line 1\n');
        await appendMarkdown(filePath, 'line 2\n');
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('line 1\nline 2\n');
    });
    it('creates the file if it does not exist', async () => {
        const filePath = path.join(tmpDir, 'new-append.md');
        await appendMarkdown(filePath, 'hello');
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('hello');
    });
    it('accumulates multiple appends in order', async () => {
        const filePath = path.join(tmpDir, 'multi-append.md');
        await appendMarkdown(filePath, 'a');
        await appendMarkdown(filePath, 'b');
        await appendMarkdown(filePath, 'c');
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('abc');
    });
});

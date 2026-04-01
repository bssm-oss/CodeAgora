/**
 * Package-level tests for packages/shared/src/utils/cli-detect.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLI_BACKENDS, detectCliBackends } from '@codeagora/shared/utils/cli-detect.js';
vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));
import { execFileSync } from 'child_process';
const mockExec = vi.mocked(execFileSync);
beforeEach(() => {
    vi.resetAllMocks();
});
describe('CLI_BACKENDS constant', () => {
    it('contains at least 10 backends', () => {
        expect(CLI_BACKENDS.length).toBeGreaterThanOrEqual(10);
    });
    it('every entry has non-empty backend and bin fields', () => {
        for (const entry of CLI_BACKENDS) {
            expect(entry.backend).toBeTruthy();
            expect(entry.bin).toBeTruthy();
        }
    });
    it('includes claude, codex, gemini', () => {
        const backends = CLI_BACKENDS.map((b) => b.backend);
        expect(backends).toContain('claude');
        expect(backends).toContain('codex');
        expect(backends).toContain('gemini');
    });
    it('cursor backend uses agent binary', () => {
        const cursor = CLI_BACKENDS.find((b) => b.backend === 'cursor');
        expect(cursor).toBeDefined();
        expect(cursor.bin).toBe('agent');
    });
    it('kiro backend uses kiro-cli binary', () => {
        const kiro = CLI_BACKENDS.find((b) => b.backend === 'kiro');
        expect(kiro).toBeDefined();
        expect(kiro.bin).toBe('kiro-cli');
    });
});
describe('detectCliBackends()', () => {
    it('returns same count as CLI_BACKENDS', async () => {
        mockExec.mockImplementation(() => { throw new Error('not found'); });
        const results = await detectCliBackends();
        expect(results).toHaveLength(CLI_BACKENDS.length);
    });
    it('marks all backends unavailable when nothing is installed', async () => {
        mockExec.mockImplementation(() => { throw new Error('not found'); });
        const results = await detectCliBackends();
        expect(results.every((r) => r.available === false)).toBe(true);
    });
    it('marks a backend available when execFileSync returns a path', async () => {
        mockExec.mockImplementation((_cmd, args) => {
            if (args[0] === 'gemini')
                return '/usr/bin/gemini\n';
            throw new Error('not found');
        });
        const results = await detectCliBackends();
        const gemini = results.find((r) => r.backend === 'gemini');
        expect(gemini.available).toBe(true);
        expect(gemini.path).toBe('/usr/bin/gemini');
    });
    it('trims trailing newline from path', async () => {
        mockExec.mockImplementation((_cmd, args) => {
            if (args[0] === 'claude')
                return '/usr/local/bin/claude\n';
            throw new Error('not found');
        });
        const results = await detectCliBackends();
        const claude = results.find((r) => r.backend === 'claude');
        expect(claude.path).toBe('/usr/local/bin/claude');
    });
    it('omits path property when binary is unavailable', async () => {
        mockExec.mockImplementation(() => { throw new Error('not found'); });
        const results = await detectCliBackends();
        for (const r of results) {
            expect(r).not.toHaveProperty('path');
        }
    });
    it('results are sorted alphabetically by backend name', async () => {
        mockExec.mockImplementation(() => { throw new Error('not found'); });
        const results = await detectCliBackends();
        const names = results.map((r) => r.backend);
        expect(names).toEqual([...names].sort());
    });
    it('never throws even when execFileSync throws ENOENT', async () => {
        mockExec.mockImplementation(() => {
            const err = new Error('spawn ENOENT');
            err.code = 'ENOENT';
            throw err;
        });
        await expect(detectCliBackends()).resolves.toBeDefined();
    });
});

/**
 * Package-level tests for packages/shared/src/utils/env-detect.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectEnvironment } from '@codeagora/shared/utils/env-detect.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));
import { execFileSync } from 'child_process';
const mockExec = vi.mocked(execFileSync);
const savedEnv = { ...process.env };
beforeEach(() => {
    vi.resetAllMocks();
    mockExec.mockImplementation(() => { throw new Error('not found'); });
    // Clear all provider keys
    for (const envVar of Object.values(PROVIDER_ENV_VARS)) {
        delete process.env[envVar];
    }
});
afterEach(() => {
    // Restore original process.env
    for (const key of Object.keys(process.env)) {
        if (!(key in savedEnv))
            delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
});
describe('detectEnvironment()', () => {
    it('returns an object with apiProviders and cliBackends arrays', async () => {
        const report = await detectEnvironment();
        expect(Array.isArray(report.apiProviders)).toBe(true);
        expect(Array.isArray(report.cliBackends)).toBe(true);
    });
    it('never throws', async () => {
        await expect(detectEnvironment()).resolves.toBeDefined();
    });
    it('apiProviders has one entry per PROVIDER_ENV_VARS entry', async () => {
        const report = await detectEnvironment();
        const providerCount = Object.keys(PROVIDER_ENV_VARS).length;
        expect(report.apiProviders).toHaveLength(providerCount);
    });
    it('each apiProvider entry has provider, envVar, available fields', async () => {
        const report = await detectEnvironment();
        for (const entry of report.apiProviders) {
            expect(typeof entry.provider).toBe('string');
            expect(typeof entry.envVar).toBe('string');
            expect(typeof entry.available).toBe('boolean');
        }
    });
    it('marks a provider available when its env var is set', async () => {
        process.env['OPENAI_API_KEY'] = 'sk-test';
        const report = await detectEnvironment();
        const openai = report.apiProviders.find((p) => p.provider === 'openai');
        expect(openai.available).toBe(true);
        expect(openai.envVar).toBe('OPENAI_API_KEY');
    });
    it('marks a provider unavailable when its env var is unset', async () => {
        delete process.env['GROQ_API_KEY'];
        const report = await detectEnvironment();
        const groq = report.apiProviders.find((p) => p.provider === 'groq');
        expect(groq.available).toBe(false);
    });
    it('apiProviders are sorted alphabetically', async () => {
        const report = await detectEnvironment();
        const names = report.apiProviders.map((p) => p.provider);
        expect(names).toEqual([...names].sort());
    });
    it('all providers unavailable when no env vars set', async () => {
        const report = await detectEnvironment();
        expect(report.apiProviders.every((p) => p.available === false)).toBe(true);
    });
    it('cliBackends length matches CLI_BACKENDS count', async () => {
        const { CLI_BACKENDS } = await import('@codeagora/shared/utils/cli-detect.js');
        const report = await detectEnvironment();
        expect(report.cliBackends).toHaveLength(CLI_BACKENDS.length);
    });
});

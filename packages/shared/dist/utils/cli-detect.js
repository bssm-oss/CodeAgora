/**
 * CLI Backend Detection
 * Detects which CLI code-review backends are available on the system.
 */
import { execFileSync } from 'child_process';
export const CLI_BACKENDS = [
    { backend: 'aider', bin: 'aider' },
    { backend: 'claude', bin: 'claude' },
    { backend: 'cline', bin: 'cline' },
    { backend: 'codex', bin: 'codex' },
    { backend: 'copilot', bin: 'copilot' },
    { backend: 'cursor', bin: 'agent' },
    { backend: 'gemini', bin: 'gemini' },
    { backend: 'goose', bin: 'goose' },
    { backend: 'kiro', bin: 'kiro-cli' },
    { backend: 'opencode', bin: 'opencode' },
    { backend: 'qwen-code', bin: 'qwen' },
    { backend: 'vibe', bin: 'vibe' },
];
/**
 * Resolve the absolute path for a binary using `which` (unix) or `where` (win32).
 * Returns the trimmed path on success, undefined on failure.
 */
function resolveBinPath(bin) {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = execFileSync(cmd, [bin], {
            encoding: 'utf8',
            timeout: 5_000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        // `where` on Windows may return multiple lines; take the first
        const firstLine = result.trim().split(/\r?\n/)[0];
        return firstLine || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Detect which CLI backends are available on the system.
 *
 * Runs all checks in parallel via Promise.allSettled.
 * Never throws — every backend returns a result regardless of errors.
 *
 * Results are sorted alphabetically by backend name.
 */
export async function detectCliBackends() {
    const results = await Promise.allSettled(CLI_BACKENDS.map(({ backend, bin }) => new Promise((resolve) => {
        const resolvedPath = resolveBinPath(bin);
        resolve({
            backend,
            bin,
            available: resolvedPath !== undefined,
            ...(resolvedPath !== undefined ? { path: resolvedPath } : {}),
        });
    })));
    return results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((v) => v !== null)
        .sort((a, b) => a.backend.localeCompare(b.backend));
}

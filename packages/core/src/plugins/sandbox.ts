/**
 * Plugin Sandbox — Isolates third-party plugin execution.
 *
 * Uses a timeout + try-catch wrapper for plugin execution.
 * Plugin crashes are caught and reported, never propagated to the pipeline.
 *
 * For hook plugins, each hook call is individually sandboxed.
 * For backend plugins, the execute() call is sandboxed with a timeout.
 */

import type { HookPlugin, HookName, BackendPlugin, BackendPluginInput } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

export interface SandboxResult<T> {
  success: boolean;
  value?: T;
  error?: string;
  durationMs: number;
}

/**
 * Execute a function within a timeout boundary.
 * Returns a SandboxResult with success/failure status.
 */
export async function sandboxExec<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SandboxResult<T>> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`)),
        );
      }),
    ]);
    return { success: true, value, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a hook plugin's specific hook within a sandbox.
 * Catches and returns errors instead of throwing.
 */
export async function sandboxHook(
  plugin: HookPlugin,
  hookName: HookName,
  context: unknown,
  timeoutMs?: number,
): Promise<SandboxResult<void>> {
  const hookFn = plugin.hooks[hookName];
  if (!hookFn) {
    return { success: true, durationMs: 0 };
  }
  return sandboxExec(() => hookFn(context), timeoutMs);
}

/**
 * Execute a backend plugin's execute() within a sandbox.
 */
export async function sandboxBackend(
  plugin: BackendPlugin,
  input: BackendPluginInput,
  timeoutMs?: number,
): Promise<SandboxResult<string>> {
  return sandboxExec(() => plugin.execute(input), timeoutMs ?? input.timeout);
}

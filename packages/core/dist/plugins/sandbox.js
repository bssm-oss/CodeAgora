const DEFAULT_TIMEOUT_MS = 3e4;
async function sandboxExec(fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`))
        );
      })
    ]);
    return { success: true, value, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start
    };
  } finally {
    clearTimeout(timer);
  }
}
async function sandboxHook(plugin, hookName, context, timeoutMs) {
  const hookFn = plugin.hooks[hookName];
  if (!hookFn) {
    return { success: true, durationMs: 0 };
  }
  return sandboxExec(() => hookFn(context), timeoutMs);
}
async function sandboxBackend(plugin, input, timeoutMs) {
  return sandboxExec(() => plugin.execute(input), timeoutMs ?? input.timeout);
}
export {
  sandboxBackend,
  sandboxExec,
  sandboxHook
};

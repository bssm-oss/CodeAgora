/**
 * Process-tree kill utilities (Unix-only).
 */

/**
 * Kill a process and its children (process group).
 * Unix-only: uses process.kill(-pid, signal).
 */
export async function killProcessTree(pid: number, signal?: NodeJS.Signals): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid PID: ${pid}. PID must be a positive integer.`);
  }
  try {
    process.kill(-pid, signal ?? 'SIGTERM');
  } catch (error) {
    if (isEsrch(error)) return;
    throw error;
  }
}

/**
 * Graceful kill: SIGTERM → wait → SIGKILL.
 */
export async function gracefulKill(pid: number, timeoutMs: number = 5000): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid PID: ${pid}. PID must be a positive integer.`);
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (isEsrch(error)) return;
    throw error;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(50);
  }

  // Still alive after timeout — force kill
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (isEsrch(error)) return;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isEsrch(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ESRCH'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

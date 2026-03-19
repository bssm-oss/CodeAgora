/**
 * Process-tree kill utility tests (Unix-only).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { killProcessTree, gracefulKill } from '@codeagora/shared/utils/process-kill.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const spawned: ChildProcess[] = [];

function spawnSleep(seconds = 60): ChildProcess {
  const child = spawn('sleep', [String(seconds)], { detached: true, stdio: 'ignore' });
  child.unref();
  spawned.push(child);
  return child;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Wait up to maxMs for the process to die, polling every 20ms. */
async function waitForDeath(pid: number, maxMs = 1000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return !isAlive(pid);
}

afterEach(() => {
  // Best-effort cleanup of any remaining spawned processes
  for (const child of spawned) {
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
  spawned.length = 0;
});

// ---------------------------------------------------------------------------
// killProcessTree
// ---------------------------------------------------------------------------

describe('killProcessTree', () => {
  it('kills a spawned child process (test 1)', async () => {
    const child = spawnSleep(60);
    const pid = child.pid!;

    await killProcessTree(pid);

    const dead = await waitForDeath(pid);
    expect(dead).toBe(true);
  });

  it('does not throw for an already-dead PID (test 2)', async () => {
    const child = spawnSleep(60);
    const pid = child.pid!;

    // Kill it manually first
    process.kill(-pid, 'SIGKILL');
    await waitForDeath(pid);

    // Should silently succeed (ESRCH ignored)
    await expect(killProcessTree(pid)).resolves.toBeUndefined();
  });

  it('sends SIGTERM when no signal is specified (test 3)', async () => {
    const child = spawnSleep(60);
    const pid = child.pid!;

    await killProcessTree(pid, 'SIGTERM');

    const dead = await waitForDeath(pid);
    expect(dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gracefulKill
// ---------------------------------------------------------------------------

describe('gracefulKill', () => {
  it('does not send SIGKILL when the process exits after SIGTERM (test 4)', async () => {
    const child = spawnSleep(60);
    const pid = child.pid!;

    // gracefulKill with a generous timeout — process should die on SIGTERM
    await gracefulKill(pid, 3000);

    const dead = await waitForDeath(pid, 200);
    expect(dead).toBe(true);
  });

  it('sends SIGKILL when the process ignores SIGTERM (test 5)', async () => {
    // Spawn a process that traps SIGTERM (bash trap '' TERM)
    const child = spawn(
      'bash',
      ['-c', 'trap "" TERM; sleep 60'],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    spawned.push(child);
    const pid = child.pid!;

    // Short timeout so the test stays fast
    await gracefulKill(pid, 200);

    const dead = await waitForDeath(pid, 1000);
    expect(dead).toBe(true);
  });

  it('silently succeeds for an already-dead PID (test 6)', async () => {
    // PID 99999 is almost certainly not a real process; ESRCH should be swallowed
    await expect(gracefulKill(99999, 100)).resolves.toBeUndefined();
  });
});

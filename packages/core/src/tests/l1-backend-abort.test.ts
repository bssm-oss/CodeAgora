import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gracefulKill: vi.fn(() => Promise.resolve()),
  spawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('@codeagora/shared/utils/process-kill.js', () => ({
  gracefulKill: mocks.gracefulKill,
}));

import { executeBackend } from '../l1/backend.js';

function makeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  return child;
}

describe('executeBackend abort handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kills on abort but waits for child close before rejecting', async () => {
    const child = makeChildProcess();
    mocks.spawn.mockReturnValueOnce(child);
    const controller = new AbortController();
    let settled = false;

    const result = executeBackend({
      backend: 'codex',
      model: 'test',
      prompt: 'review this',
      timeout: 60,
      signal: controller.signal,
    });
    result.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    controller.abort();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.gracefulKill).toHaveBeenCalledWith(12345, 5000);
    expect(settled).toBe(false);

    child.emit('close', null);

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(settled).toBe(true);
  });
});

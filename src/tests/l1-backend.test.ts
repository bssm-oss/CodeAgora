/**
 * L1 Backend Executor Tests
 * Tests for spawn-based CLI execution (no shell interpretation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { BackendInput } from '@codeagora/core/l1/backend.js';

// ============================================================================
// Mocks
// ============================================================================

// Create a mock child process factory
function createMockChild(stdout: string, stderr: string, exitCode: number) {
  const child = new EventEmitter() as any;
  child.stdout = new Readable({ read() { this.push(stdout); this.push(null); } });
  child.stderr = new Readable({ read() { this.push(stderr); this.push(null); } });
  child.stdin = new Writable({ write(_chunk: any, _enc: any, cb: any) { cb(); } });
  child.stdin.end = vi.fn();
  // Emit close on next tick
  setTimeout(() => child.emit('close', exitCode), 10);
  return child;
}

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('../../packages/core/src/l1/api-backend.js', () => ({
  executeViaAISDK: vi.fn(),
}));

import { executeBackend } from '@codeagora/core/l1/backend.js';
import { executeViaAISDK } from '@codeagora/core/l1/api-backend.js';

const mockExecuteViaAISDK = vi.mocked(executeViaAISDK);

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides: Partial<BackendInput> = {}): BackendInput {
  return {
    backend: 'opencode',
    model: 'gpt-4o',
    provider: 'openai',
    prompt: 'Review this code',
    timeout: 60,
    ...overrides,
  };
}

// ============================================================================
// 'api' backend dispatch
// ============================================================================

describe("executeBackend() with backend 'api'", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('delegates to executeViaAISDK and returns its result', async () => {
    mockExecuteViaAISDK.mockResolvedValue('api review output');
    const result = await executeBackend(makeInput({ backend: 'api' }));
    expect(mockExecuteViaAISDK).toHaveBeenCalledOnce();
    expect(result).toBe('api review output');
  });

  it('passes the full input object to executeViaAISDK', async () => {
    mockExecuteViaAISDK.mockResolvedValue('ok');
    const input = makeInput({ backend: 'api', model: 'deepseek-r1', provider: 'groq' });
    await executeBackend(input);
    expect(mockExecuteViaAISDK).toHaveBeenCalledWith(input);
  });

  it('does not spawn a child process for api backend', async () => {
    mockExecuteViaAISDK.mockResolvedValue('ok');
    await executeBackend(makeInput({ backend: 'api' }));
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// CLI backends – spawn-based execution
// ============================================================================

describe('executeBackend() CLI backends – successful execution', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns trimmed stdout from the subprocess', async () => {
    mockSpawn.mockReturnValue(createMockChild('  review output\n', '', 0));
    const result = await executeBackend(makeInput({ backend: 'opencode' }));
    expect(result).toBe('review output');
  });

  it('writes prompt to stdin of the child process', async () => {
    const child = createMockChild('ok', '', 0);
    const writeSpy = vi.spyOn(child.stdin, 'write');
    mockSpawn.mockReturnValue(child);
    await executeBackend(makeInput({ backend: 'codex', provider: undefined, prompt: 'test prompt' }));
    expect(writeSpy).toHaveBeenCalledWith('test prompt');
  });

  it('throws when exit code is non-zero and stdout is empty', async () => {
    mockSpawn.mockReturnValue(createMockChild('', 'Something went wrong', 1));
    await expect(
      executeBackend(makeInput({ backend: 'opencode' }))
    ).rejects.toThrow('Backend error');
  });

  it('still returns stdout when exit code is non-zero but stdout has content', async () => {
    mockSpawn.mockReturnValue(createMockChild('partial output', 'some warning', 1));
    const result = await executeBackend(makeInput({ backend: 'opencode' }));
    expect(result).toBe('partial output');
  });
});

// ============================================================================
// Command builders – correct CLI commands selected
// ============================================================================

describe('executeBackend() dispatches correct CLI command per backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(createMockChild('ok', '', 0));
  });

  it('spawns opencode with run and provider/model args', async () => {
    await executeBackend(makeInput({ backend: 'opencode', model: 'gpt-4o', provider: 'openai' }));
    expect(mockSpawn).toHaveBeenCalledWith(
      'opencode',
      ['run', '-m', 'openai/gpt-4o'],
      expect.any(Object)
    );
  });

  it('spawns codex with exec and model args', async () => {
    await executeBackend(makeInput({ backend: 'codex', model: 'o3', provider: undefined }));
    expect(mockSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '-m', 'o3', '-'],
      expect.any(Object)
    );
  });

  it('spawns gemini with -m flag', async () => {
    await executeBackend(makeInput({ backend: 'gemini', model: 'gemini-2.0-flash', provider: undefined }));
    expect(mockSpawn).toHaveBeenCalledWith(
      'gemini',
      ['-m', 'gemini-2.0-flash'],
      expect.any(Object)
    );
  });

  it('spawns claude with --non-interactive', async () => {
    await executeBackend(makeInput({ backend: 'claude', model: 'claude-3-5-sonnet-20241022' }));
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--non-interactive', '--model', 'claude-3-5-sonnet-20241022'],
      expect.any(Object)
    );
  });

  it('spawns gh copilot suggest for copilot backend', async () => {
    await executeBackend(makeInput({ backend: 'copilot', model: 'gpt-4o', provider: undefined }));
    expect(mockSpawn).toHaveBeenCalledWith(
      'gh',
      ['copilot', 'suggest', '--model', 'gpt-4o'],
      expect.any(Object)
    );
  });
});

// ============================================================================
// opencode backend – missing provider
// ============================================================================

describe("executeBackend() with backend 'opencode'", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when provider is missing', async () => {
    await expect(
      executeBackend(makeInput({ backend: 'opencode', provider: undefined }))
    ).rejects.toThrow('OpenCode backend requires provider parameter');
  });
});

// ============================================================================
// Unknown backend
// ============================================================================

describe('executeBackend() with unknown backend', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws an unsupported backend error', async () => {
    await expect(
      executeBackend(makeInput({ backend: 'unknown' as any }))
    ).rejects.toThrow('Unsupported CLI backend: unknown');
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe('executeBackend() error handling', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects when child process emits error event', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new Readable({ read() { this.push(null); } });
    child.stderr = new Readable({ read() { this.push(null); } });
    child.stdin = new Writable({ write(_c: any, _e: any, cb: any) { cb(); } });
    child.stdin.end = vi.fn();
    setTimeout(() => child.emit('error', new Error('spawn ENOENT')), 10);
    mockSpawn.mockReturnValue(child);

    await expect(
      executeBackend(makeInput({ backend: 'opencode' }))
    ).rejects.toThrow('Backend execution failed: spawn ENOENT');
  });
});

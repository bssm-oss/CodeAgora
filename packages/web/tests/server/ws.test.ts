/**
 * WebSocket Handler Tests
 * Tests for emitter registration and event forwarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setEmitters } from '../../src/server/ws.js';

// ============================================================================
// Mock @hono/node-ws
// ============================================================================

vi.mock('@hono/node-ws', () => ({
  createNodeWebSocket: vi.fn(() => ({
    injectWebSocket: vi.fn(),
    upgradeWebSocket: vi.fn((handler: () => unknown) => {
      // Store the handler factory for test access
      (globalThis as Record<string, unknown>).__wsHandlerFactory = handler;
      return vi.fn();
    }),
  })),
}));

// ============================================================================
// Tests
// ============================================================================

describe('WebSocket setEmitters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should accept null emitters without error', () => {
    expect(() => setEmitters(null, null)).not.toThrow();
  });

  it('should accept mock emitters without error', () => {
    const mockProgress = {
      onProgress: vi.fn(),
      removeListener: vi.fn(),
    };
    const mockDiscussion = {
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    expect(() => setEmitters(
      mockProgress as never,
      mockDiscussion as never,
    )).not.toThrow();
  });
});

describe('WebSocket setupWebSocket', () => {
  it('should export setupWebSocket function', async () => {
    const { setupWebSocket } = await import('../../src/server/ws.js');
    expect(typeof setupWebSocket).toBe('function');
  });

  it('should export setEmitters function', async () => {
    const { setEmitters: fn } = await import('../../src/server/ws.js');
    expect(typeof fn).toBe('function');
  });
});

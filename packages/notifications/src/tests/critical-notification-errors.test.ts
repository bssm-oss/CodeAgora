/**
 * Critical Notification Error Scenario Tests
 * Covers edge cases and failure modes in generic-webhook, webhook, event-stream.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendGenericWebhook } from '../generic-webhook.js';
import {
  sendDiscordNotification,
  sendSlackNotification,
} from '../webhook.js';
import { createEventStreamHandler } from '../event-stream.js';
import type { NotificationPayload } from '../webhook.js';
import type { GenericWebhookConfig } from '../generic-webhook.js';

// ============================================================================
// fetch mock
// ============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Helpers
// ============================================================================

const DISCORD_URL = 'https://discord.com/api/webhooks/123/token';

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    decision: 'REJECT',
    reasoning: 'Critical issues found.',
    severityCounts: { CRITICAL: 1 },
    topIssues: [{ severity: 'CRITICAL', filePath: 'src/auth.ts', title: 'SQL Injection' }],
    sessionId: 'sess-001',
    date: '2026-03-21',
    totalDiscussions: 1,
    resolved: 0,
    escalated: 1,
    ...overrides,
  };
}

// ============================================================================
// GW-002: circular reference in payload → JSON.stringify throws → no crash
// ============================================================================

describe('GW-002: circular reference payload does not cause unhandled rejection', () => {
  it('does not call fetch and does not throw when payload has circular reference', async () => {
    // JSON.stringify throws a TypeError for circular references
    // The implementation calls JSON.stringify({ event, timestamp, data: payload })
    // which will throw synchronously before fetch is called
    const circular: Record<string, unknown> = { key: 'value' };
    circular['self'] = circular; // circular reference

    // sendGenericWebhook catches JSON.stringify errors gracefully — should not throw
    await sendGenericWebhook(
      { url: 'https://example.com/hook', secret: 'supersecretvalue123' },
      'pipeline-complete',
      circular,
    );

    // fetch was never called (JSON.stringify failed before the fetch call)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends successfully with non-circular nested payload', async () => {
    const payload = { nested: { a: 1, b: [2, 3] }, label: 'ok' };

    await sendGenericWebhook(
      { url: 'https://example.com/hook', secret: 'supersecretvalue123' },
      'pipeline-complete',
      payload,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// WH-002: empty string reasoning → Discord embed description is empty string
// ============================================================================

describe('WH-002: empty reasoning string in Discord embed', () => {
  it('produces embed description as empty string when reasoning is ""', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ reasoning: '' }));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // truncate('', 4096) returns '' — description should be empty string
    expect(body.embeds[0].description).toBe('');
  });

  it('footer still contains session info even with empty reasoning', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ reasoning: '' }));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].footer.text).toContain('sess-001');
  });

  it('Slack section block text is empty string when reasoning is ""', async () => {
    const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';
    await sendSlackNotification(SLACK_URL, makePayload({ reasoning: '' }));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const sections = (body.blocks as Array<{ type: string; text?: { text: string } }>)
      .filter((b) => b.type === 'section');
    // The first section block contains the reasoning
    const reasoningSection = sections[0];
    expect(reasoningSection).toBeDefined();
    expect(reasoningSection!.text!.text).toBe('');
  });
});

// ============================================================================
// WH-003: both retry attempts fail → logs to stderr, does not throw
// ============================================================================

describe('WH-003: both retry attempts fail → stderr logged, no throw', () => {
  it('does not throw when all fetch attempts return non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      sendDiscordNotification(DISCORD_URL, makePayload()),
    ).resolves.toBeUndefined();

    // maxAttempts = 2
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('writes to stderr after last failed attempt (non-ok response)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await sendDiscordNotification(DISCORD_URL, makePayload());
      // After 2 failed attempts, stderr should be written
      expect(stderrSpy).toHaveBeenCalled();
      const message = String(stderrSpy.mock.calls[0]![0]);
      expect(message).toContain('503');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('writes to stderr after last failed attempt (fetch throws)', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await sendDiscordNotification(DISCORD_URL, makePayload());
      expect(stderrSpy).toHaveBeenCalled();
      const message = String(stderrSpy.mock.calls[0]![0]);
      expect(message).toContain('Connection refused');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('does not write to stderr on first attempt failure when second succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await sendDiscordNotification(DISCORD_URL, makePayload());
      // Second attempt succeeded — stderr should NOT be written
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ============================================================================
// ES-001: invalid config (short secret / HTTP URL) → handler created but fetch not called
// ============================================================================

describe('ES-001: createEventStreamHandler with invalid config does not call fetch', () => {
  it('handler is still returned when secret is too short', () => {
    const config: GenericWebhookConfig = {
      url: 'https://example.com/events',
      secret: 'short', // < 16 chars
    };
    const handler = createEventStreamHandler(config);
    expect(typeof handler).toBe('function');
  });

  it('does not call fetch when secret is shorter than 16 chars', async () => {
    const config: GenericWebhookConfig = {
      url: 'https://example.com/events',
      secret: 'tooshort123',
    };
    const handler = createEventStreamHandler(config);

    await handler({
      type: 'pipeline-complete',
      discussionId: 'd001',
      filePath: 'src/foo.ts',
      lineRange: [1, 5],
      severity: 'CRITICAL',
    } as never);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when URL is HTTP (not HTTPS)', async () => {
    const config: GenericWebhookConfig = {
      url: 'http://example.com/events', // HTTP — rejected
      secret: 'supersecretvalue123',
    };
    const handler = createEventStreamHandler(config);

    await handler({
      type: 'discussion-started',
      discussionId: 'd002',
      filePath: 'src/bar.ts',
      lineRange: [10, 15],
      severity: 'WARNING',
    } as never);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when URL is invalid (not parseable)', async () => {
    const config: GenericWebhookConfig = {
      url: 'not-a-valid-url',
      secret: 'supersecretvalue123',
    };
    const handler = createEventStreamHandler(config);

    await handler({
      type: 'round-complete',
      discussionId: 'd003',
      filePath: 'src/baz.ts',
      lineRange: [1, 1],
      severity: 'SUGGESTION',
    } as never);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when event is filtered out', async () => {
    const config: GenericWebhookConfig = {
      url: 'https://example.com/events',
      secret: 'supersecretvalue123',
      events: ['pipeline-complete'], // only this event passes
    };
    const handler = createEventStreamHandler(config);

    await handler({
      type: 'discussion-started', // not in filter list
      discussionId: 'd004',
      filePath: 'src/x.ts',
      lineRange: [1, 1],
      severity: 'CRITICAL',
    } as never);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does call fetch with valid config and matching event', async () => {
    const config: GenericWebhookConfig = {
      url: 'https://example.com/events',
      secret: 'supersecretvalue123',
      events: ['all'],
    };
    const handler = createEventStreamHandler(config);

    await handler({
      type: 'pipeline-complete',
      discussionId: 'd005',
      filePath: 'src/y.ts',
      lineRange: [1, 1],
      severity: 'CRITICAL',
    } as never);

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

/**
 * Notification Webhook Tests
 * Tests sendDiscordNotification(), sendSlackNotification(), sendNotifications()
 * with a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendDiscordNotification,
  sendSlackNotification,
  sendNotifications,
} from '../webhook.js';
import type { NotificationPayload, NotificationConfig } from '../webhook.js';

// ============================================================================
// Helpers
// ============================================================================

const DISCORD_URL = 'https://discord.com/api/webhooks/123/token';
const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    decision: 'REJECT',
    reasoning: 'Critical issues found in authentication layer.',
    severityCounts: { CRITICAL: 2, WARNING: 1 },
    topIssues: [
      { severity: 'CRITICAL', filePath: 'src/auth.ts', title: 'SQL Injection' },
      { severity: 'WARNING', filePath: 'src/utils.ts', title: 'Missing null check' },
    ],
    sessionId: 'sess-001',
    date: '2026-03-21',
    totalDiscussions: 3,
    resolved: 2,
    escalated: 1,
    ...overrides,
  };
}

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
// sendDiscordNotification — embed structure
// ============================================================================

describe('sendDiscordNotification', () => {
  it('sends a POST request to the Discord webhook URL', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload());
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(DISCORD_URL);
  });

  it('sends Content-Type: application/json', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends an embeds array in the body', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body.embeds)).toBe(true);
    expect(body.embeds.length).toBeGreaterThan(0);
  });

  it('uses color 0xff0000 (red) for REJECT decision', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ decision: 'REJECT' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].color).toBe(0xff0000);
  });

  it('uses color 0x00ff00 (green) for ACCEPT decision', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ decision: 'ACCEPT' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].color).toBe(0x00ff00);
  });

  it('uses color 0xffff00 (yellow) for NEEDS_HUMAN decision', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ decision: 'NEEDS_HUMAN' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].color).toBe(0xffff00);
  });

  it('uses fallback color 0x888888 for unknown decision', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ decision: 'UNKNOWN' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].color).toBe(0x888888);
  });

  it('embed description contains the reasoning text', async () => {
    await sendDiscordNotification(
      DISCORD_URL,
      makePayload({ reasoning: 'Specific reasoning about the review.' }),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].description).toContain('Specific reasoning about the review.');
  });

  it('embed fields include Triage, Debates, and Issues', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const embed = body.embeds[0];
    const fieldNames = embed.fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toContain('Triage');
    expect(fieldNames).toContain('Debates');
    expect(fieldNames).toContain('Issues');
    expect(embed.footer.text).toContain('Session');
  });

  it('retries with exponential backoff on non-ok response without throwing', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const promise = sendDiscordNotification(DISCORD_URL, makePayload());

    // First attempt fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // After 1s backoff → second attempt
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // After 2s backoff → third attempt
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    await promise;
    vi.useRealTimers();
  });

  it('does not throw when fetch itself rejects', async () => {
    vi.useFakeTimers();
    mockFetch.mockRejectedValue(new Error('Network error'));
    const promise = sendDiscordNotification(DISCORD_URL, makePayload());
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('throws for invalid webhook URL (HTTP)', async () => {
    await expect(
      sendDiscordNotification('http://discord.com/api/webhooks/123/tok', makePayload()),
    ).rejects.toThrow('HTTPS');
  });

  it('includes top issues in embed fields', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const topIssuesField = body.embeds[0].fields.find(
      (f: { name: string }) => f.name === 'Issues',
    );
    expect(topIssuesField).toBeDefined();
    expect(topIssuesField.value).toContain('SQL Injection');
  });

  it('shows celebration message when topIssues is empty', async () => {
    await sendDiscordNotification(DISCORD_URL, makePayload({ topIssues: [] }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const issuesField = body.embeds[0].fields.find(
      (f: { name: string }) => f.name === 'Issues',
    );
    expect(issuesField.value).toContain('Clean code');
  });
});

// ============================================================================
// sendSlackNotification — blocks structure
// ============================================================================

describe('sendSlackNotification', () => {
  it('sends a POST request to the Slack webhook URL', async () => {
    await sendSlackNotification(SLACK_URL, makePayload());
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SLACK_URL);
  });

  it('sends a blocks array in the body', async () => {
    await sendSlackNotification(SLACK_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body.blocks)).toBe(true);
    expect(body.blocks.length).toBeGreaterThan(0);
  });

  it('header block contains the decision text', async () => {
    await sendSlackNotification(SLACK_URL, makePayload({ decision: 'ACCEPT' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const header = body.blocks.find((b: { type: string }) => b.type === 'header');
    expect(header).toBeDefined();
    expect(header.text.text).toContain('ACCEPT');
  });

  it('uses :white_check_mark: emoji for ACCEPT', async () => {
    await sendSlackNotification(SLACK_URL, makePayload({ decision: 'ACCEPT' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const header = body.blocks.find((b: { type: string }) => b.type === 'header');
    expect(header.text.text).toContain(':white_check_mark:');
  });

  it('uses :x: emoji for REJECT', async () => {
    await sendSlackNotification(SLACK_URL, makePayload({ decision: 'REJECT' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const header = body.blocks.find((b: { type: string }) => b.type === 'header');
    expect(header.text.text).toContain(':x:');
  });

  it('uses :eyes: emoji for NEEDS_HUMAN', async () => {
    await sendSlackNotification(SLACK_URL, makePayload({ decision: 'NEEDS_HUMAN' }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const header = body.blocks.find((b: { type: string }) => b.type === 'header');
    expect(header.text.text).toContain(':eyes:');
  });

  it('context block contains session id and discussion counts', async () => {
    await sendSlackNotification(SLACK_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const context = body.blocks.find((b: { type: string }) => b.type === 'context');
    expect(context).toBeDefined();
    expect(context.elements[0].text).toContain('sess-001');
    expect(context.elements[0].text).toContain('3 total');
  });

  it('includes severity counts section when counts are non-zero', async () => {
    await sendSlackNotification(SLACK_URL, makePayload());
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const sections = body.blocks.filter((b: { type: string }) => b.type === 'section');
    const severitySection = sections.find((s: { text: { text: string } }) =>
      s.text.text.includes('Severity Counts'),
    );
    expect(severitySection).toBeDefined();
  });

  it('omits severity counts section when all counts are zero', async () => {
    await sendSlackNotification(SLACK_URL, makePayload({ severityCounts: {} }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const sections = body.blocks.filter((b: { type: string }) => b.type === 'section');
    const severitySection = sections.find((s: { text: { text: string } }) =>
      s.text.text.includes('Severity Counts'),
    );
    expect(severitySection).toBeUndefined();
  });

  it('throws for invalid webhook URL (non-slack host)', async () => {
    await expect(
      sendSlackNotification('https://evil.example.com/hook', makePayload()),
    ).rejects.toThrow();
  });

  it('does not throw when fetch itself rejects', async () => {
    vi.useFakeTimers();
    mockFetch.mockRejectedValue(new Error('Network error'));
    const promise = sendSlackNotification(SLACK_URL, makePayload());
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ============================================================================
// sendNotifications — combined sender
// ============================================================================

describe('sendNotifications', () => {
  it('sends to both Discord and Slack when both are configured', async () => {
    const config: NotificationConfig = {
      discord: { webhookUrl: DISCORD_URL },
      slack: { webhookUrl: SLACK_URL },
    };

    await sendNotifications(config, makePayload());
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const urls = mockFetch.mock.calls.map((c) => (c as [string])[0]);
    expect(urls).toContain(DISCORD_URL);
    expect(urls).toContain(SLACK_URL);
  });

  it('sends only to Discord when only discord is configured', async () => {
    const config: NotificationConfig = { discord: { webhookUrl: DISCORD_URL } };

    await sendNotifications(config, makePayload());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(DISCORD_URL);
  });

  it('sends only to Slack when only slack is configured', async () => {
    const config: NotificationConfig = { slack: { webhookUrl: SLACK_URL } };

    await sendNotifications(config, makePayload());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(SLACK_URL);
  });

  it('sends nothing when neither discord nor slack is configured', async () => {
    await sendNotifications({}, makePayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves even if one delivery fails (Promise.allSettled)', async () => {
    // Discord succeeds, Slack fails via invalid URL
    const config: NotificationConfig = {
      discord: { webhookUrl: DISCORD_URL },
      slack: { webhookUrl: 'http://hooks.slack.com/invalid' }, // HTTP — will throw in validateWebhookUrl
    };

    // Should resolve without throwing
    await expect(sendNotifications(config, makePayload())).resolves.toBeUndefined();
  });
});

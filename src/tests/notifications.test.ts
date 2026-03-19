/**
 * Notification webhook tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendDiscordNotification,
  sendSlackNotification,
  sendNotifications,
  type NotificationPayload,
  type NotificationConfig,
} from '@codeagora/notifications/webhook.js';

// ============================================================================
// Fixtures
// ============================================================================

const samplePayload: NotificationPayload = {
  decision: 'REJECT',
  reasoning: 'Critical security issue found in auth module.',
  severityCounts: {
    HARSHLY_CRITICAL: 1,
    CRITICAL: 2,
    WARNING: 3,
    SUGGESTION: 0,
  },
  topIssues: [
    { severity: 'HARSHLY_CRITICAL', filePath: 'src/auth.ts', title: 'SQL injection risk' },
    { severity: 'CRITICAL', filePath: 'src/api.ts', title: 'Missing input validation' },
  ],
  sessionId: '001',
  date: '2026-03-16',
  totalDiscussions: 5,
  resolved: 3,
  escalated: 2,
};

const acceptPayload: NotificationPayload = {
  ...samplePayload,
  decision: 'ACCEPT',
  reasoning: 'Code looks good.',
};

// ============================================================================
// fetch mock helpers
// ============================================================================

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
  } as Response);
}

function mockFetchFail(message = 'Network error') {
  return vi.fn().mockRejectedValue(new Error(message));
}

function mockFetchBadStatus(status = 400) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
  } as Response);
}

// ============================================================================
// Discord tests
// ============================================================================

describe('sendDiscordNotification()', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the given webhookUrl', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendDiscordNotification('https://discord.com/api/webhooks/test', samplePayload);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/test');
  });

  it('sends correct embed format with embeds array', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendDiscordNotification('https://discord.com/api/webhooks/test', samplePayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(Array.isArray(body['embeds'])).toBe(true);
    const embed = (body['embeds'] as Record<string, unknown>[])[0]!;
    expect(embed['title']).toBe('CodeAgora Review Result');
    expect(Array.isArray(embed['fields'])).toBe(true);
  });

  it('uses red color (0xff0000) for REJECT decision', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendDiscordNotification('https://discord.com/api/webhooks/test', samplePayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const embed = (body['embeds'] as Record<string, unknown>[])[0]!;
    expect(embed['color']).toBe(0xff0000);
  });

  it('uses green color (0x00ff00) for ACCEPT decision', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendDiscordNotification('https://discord.com/api/webhooks/test', acceptPayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const embed = (body['embeds'] as Record<string, unknown>[])[0]!;
    expect(embed['color']).toBe(0x00ff00);
  });

  it('uses yellow color (0xffff00) for NEEDS_HUMAN decision', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);
    const payload = { ...samplePayload, decision: 'NEEDS_HUMAN' };

    await sendDiscordNotification('https://discord.com/api/webhooks/test', payload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const embed = (body['embeds'] as Record<string, unknown>[])[0]!;
    expect(embed['color']).toBe(0xffff00);
  });

  it('does not throw on fetch failure (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', mockFetchFail());

    await expect(
      sendDiscordNotification('https://discord.com/api/webhooks/test', samplePayload)
    ).resolves.toBeUndefined();
  });

  it('writes to stderr on fetch failure', async () => {
    vi.stubGlobal('fetch', mockFetchFail('connection refused'));

    await sendDiscordNotification('https://discord.com/api/webhooks/test', samplePayload);

    expect(stderrSpy).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const written = (stderrSpy.mock.calls as any[]).map((c: any[]) => String(c[0])).join('');
    expect(written).toContain('codeagora');
  });
});

// ============================================================================
// Slack tests
// ============================================================================

describe('sendSlackNotification()', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the given webhookUrl', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendSlackNotification('https://hooks.slack.com/services/test', samplePayload);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://hooks.slack.com/services/test');
  });

  it('sends Block Kit format with blocks array', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendSlackNotification('https://hooks.slack.com/services/test', samplePayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(Array.isArray(body['blocks'])).toBe(true);
    const blocks = body['blocks'] as Record<string, unknown>[];
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a header block with the decision', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendSlackNotification('https://hooks.slack.com/services/test', samplePayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const blocks = body['blocks'] as Record<string, unknown>[];
    const header = blocks.find((b) => b['type'] === 'header');
    expect(header).toBeDefined();
    const text = (header!['text'] as Record<string, unknown>)['text'] as string;
    expect(text).toContain('REJECT');
  });

  it('includes session ID in context block', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendSlackNotification('https://hooks.slack.com/services/test', samplePayload);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toContain('001');
    expect(bodyStr).toContain('2026-03-16');
  });

  it('does not throw on fetch failure (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', mockFetchFail());

    await expect(
      sendSlackNotification('https://hooks.slack.com/services/test', samplePayload)
    ).resolves.toBeUndefined();
  });

  it('writes stderr warning on bad status after retry', async () => {
    vi.stubGlobal('fetch', mockFetchBadStatus(400));

    await sendSlackNotification('https://hooks.slack.com/services/test', samplePayload);

    expect(stderrSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// sendNotifications() combined
// ============================================================================

describe('sendNotifications()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls both Discord and Slack when both are configured', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      discord: { webhookUrl: 'https://discord.com/api/webhooks/abc' },
      slack: { webhookUrl: 'https://hooks.slack.com/services/xyz' },
    };

    await sendNotifications(config, samplePayload);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain('https://discord.com/api/webhooks/abc');
    expect(urls).toContain('https://hooks.slack.com/services/xyz');
  });

  it('calls only Discord when only discord is configured', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      discord: { webhookUrl: 'https://discord.com/api/webhooks/abc' },
    };

    await sendNotifications(config, samplePayload);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![0]).toBe('https://discord.com/api/webhooks/abc');
  });

  it('calls only Slack when only slack is configured', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      slack: { webhookUrl: 'https://hooks.slack.com/services/xyz' },
    };

    await sendNotifications(config, samplePayload);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![0]).toBe('https://hooks.slack.com/services/xyz');
  });

  it('calls nothing when neither discord nor slack is configured', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = { autoNotify: true };

    await sendNotifications(config, samplePayload);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not throw when one target fails', async () => {
    vi.stubGlobal('fetch', mockFetchFail());
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const config: NotificationConfig = {
      discord: { webhookUrl: 'https://discord.com/api/webhooks/abc' },
      slack: { webhookUrl: 'https://hooks.slack.com/services/xyz' },
    };

    await expect(sendNotifications(config, samplePayload)).resolves.toBeUndefined();
  });
});

// ============================================================================
// Config without notifications: no-op
// ============================================================================

describe('sendNotifications() with empty config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when config has no discord or slack fields', async () => {
    const mockFetch = mockFetchOk();
    vi.stubGlobal('fetch', mockFetch);

    await sendNotifications({}, samplePayload);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

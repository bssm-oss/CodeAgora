/**
 * Notify Command
 * Send notification for a past review session.
 */

import type { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { loadConfig } from '@codeagora/core/config/loader.js';
import { t } from '@codeagora/shared/i18n/index.js';

export function registerNotifyCommand(program: Command): void {
  program
    .command('notify <session-id>')
    .description('Send notification for a past review session (format: YYYY-MM-DD/NNN)')
    .action(async (sessionId: string) => {
      try {
        const config = await loadConfig();
        if (!config.notifications) {
          console.error(t('cli.error.notificationsNotConfigured'));
          process.exit(1);
        }

        // Parse "YYYY-MM-DD/NNN" format
        const parts = sessionId.split('/');
        if (parts.length !== 2) {
          console.error(t('cli.error.sessionIdFormat'));
          process.exit(1);
        }
        const [date, id] = parts;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date!) || !/^\d+$/.test(id!)) {
          console.error(t('cli.error.invalidSessionIdFormat'));
          process.exit(1);
        }
        const sessionDir = path.join(process.cwd(), '.ca', 'sessions', date!, id!);

        // Load verdict
        let verdictRaw: Record<string, unknown> | null = null;
        try {
          const raw = await fs.readFile(path.join(sessionDir, 'head-verdict.json'), 'utf-8');
          verdictRaw = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          console.error(t('cli.error.sessionNotFound', { sessionId }));
          process.exit(1);
        }

        const decision = String(verdictRaw['decision'] ?? 'NEEDS_HUMAN');
        const reasoning = String(verdictRaw['reasoning'] ?? '');
        const severityCounts = (verdictRaw['severityCounts'] as Record<string, number>) ?? {};
        const topIssues = (verdictRaw['topIssues'] as Array<{ severity: string; filePath: string; title: string }>) ?? [];

        let sendNotifications: typeof import('@codeagora/notifications/webhook.js')['sendNotifications'];
        try {
          ({ sendNotifications } = await import('@codeagora/notifications/webhook.js'));
        } catch {
          console.error(t('cli.error.notificationsNotInstalled'));
          console.error(t('cli.error.notificationsInstall'));
          process.exit(1);
        }

        await sendNotifications(config.notifications, {
          decision,
          reasoning,
          severityCounts,
          topIssues,
          sessionId: id!,
          date: date!,
          totalDiscussions: Number(verdictRaw['totalDiscussions'] ?? 0),
          resolved: Number(verdictRaw['resolved'] ?? 0),
          escalated: Number(verdictRaw['escalated'] ?? 0),
        });
        console.log(`Notification sent for session ${sessionId}`);
      } catch (error) {
        console.error('Notify failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}

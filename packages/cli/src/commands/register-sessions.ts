/**
 * Sessions Command Registration
 * Registers the `sessions` command and subcommands with commander.
 */

import type { Command } from 'commander';
import {
  listSessions, showSession, diffSessions, getSessionStats, pruneSessions,
  formatSessionList, formatSessionListJson, formatSessionDetail, formatSessionDetailJson,
  formatSessionDiff, formatSessionStats,
} from './sessions.js';

export function registerSessionsCommand(program: Command): void {
  const sessionsCmd = program.command('sessions').description('List, show, or diff past review sessions');

  sessionsCmd
    .command('list')
    .description('List recent review sessions')
    .option('--limit <n>', 'Maximum sessions to show', parseInt)
    .option('--status <status>', 'Filter by status (completed/failed/in_progress)')
    .option('--after <date>', 'Sessions after date (YYYY-MM-DD)')
    .option('--before <date>', 'Sessions before date (YYYY-MM-DD)')
    .option('--sort <field>', 'Sort by (date/status/issues)', 'date')
    .option('--search <keyword>', 'Search sessions by keyword (case-insensitive)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { limit?: number; status?: string; after?: string; before?: string; sort?: string; search?: string; json?: boolean }) => {
      try {
        const sessions = await listSessions(process.cwd(), {
          limit: opts.limit, status: opts.status, after: opts.after,
          before: opts.before, sort: opts.sort, keyword: opts.search,
        });
        if (opts.json) {
          console.log(formatSessionListJson(sessions));
        } else {
          console.log(formatSessionList(sessions));
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  sessionsCmd.command('stats').description('Show review statistics').action(async () => {
    try {
      console.log(formatSessionStats(await getSessionStats(process.cwd())));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

  sessionsCmd.command('show <session>')
    .description('Show details for a session (e.g. 2026-03-13/001)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (session: string, opts: { json?: boolean }) => {
      try {
        const detail = await showSession(process.cwd(), session);
        if (opts.json) {
          console.log(formatSessionDetailJson(detail));
        } else {
          console.log(formatSessionDetail(detail));
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  sessionsCmd.command('diff <session1> <session2>').description('Compare issues between two sessions').action(async (session1: string, session2: string) => {
    try {
      console.log(formatSessionDiff(await diffSessions(process.cwd(), session1, session2)));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

  sessionsCmd.command('prune').description('Delete sessions older than N days (default: 30)')
    .option('--days <n>', 'Maximum age in days', parseInt)
    .action(async (opts: { days?: number }) => {
      try {
        const days = opts.days ?? 30;
        const result = await pruneSessions(process.cwd(), days);
        console.log(`Pruned ${result.deleted} session(s) older than ${days} day(s).`);
        if (result.errors > 0) console.warn(`${result.errors} session(s) could not be deleted.`);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}

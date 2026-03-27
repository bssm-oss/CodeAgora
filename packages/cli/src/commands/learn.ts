/**
 * `learn` CLI Command
 * Learn from dismissed review patterns in a GitHub PR.
 * Manage learned patterns: list, clear, stats, remove, export, import.
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { collectDismissedPatterns } from '@codeagora/core/learning/collector.js';
import {
  loadLearnedPatterns,
  saveLearnedPatterns,
  mergePatterns,
  type LearnedPatterns,
} from '@codeagora/core/learning/store.js';
import { parseGitRemote } from '@codeagora/github/client.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { bold, dim } from '../utils/colors.js';
import { t } from '@codeagora/shared/i18n/index.js';

const execFileAsync = promisify(execFile);

/**
 * Resolve owner/repo from the git remote origin URL of the current directory.
 * Returns "owner/repo" string or throws if it cannot be determined.
 */
async function getRepoFromGit(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
  const remoteUrl = stdout.trim();
  const parsed = parseGitRemote(remoteUrl);
  if (!parsed) {
    throw new Error(
      `Could not parse git remote URL: ${remoteUrl}\n` +
        'Use --repo <owner/repo> to specify the repository explicitly.',
    );
  }
  return `${parsed.owner}/${parsed.repo}`;
}

export function registerLearnCommand(program: Command): void {
  const learnCmd = program
    .command('learn')
    .description('Learn from dismissed review patterns or manage learned patterns');

  // Default action: learn from PR (original behavior)
  learnCmd
    .command('from-pr')
    .description('Learn from dismissed review patterns in a GitHub PR')
    .requiredOption('--pr <number>', 'PR number to learn from')
    .option('--repo <owner/repo>', 'Repository (default: from git remote origin)')
    .action(
      async (options: { pr: string; repo?: string }) => {
        try {
          const prNumber = parseInt(options.pr, 10);
          if (isNaN(prNumber) || prNumber <= 0) {
            console.error(t('cli.learn.error.prPositiveInteger'));
            process.exit(1);
          }

          const token = process.env['GITHUB_TOKEN'];
          if (!token) {
            console.error(t('cli.learn.error.githubTokenRequired'));
            process.exit(1);
          }

          const ownerRepo = options.repo ?? (await getRepoFromGit());
          const slashIdx = ownerRepo.indexOf('/');
          if (slashIdx === -1) {
            console.error(t('cli.learn.error.repoFormat'));
            process.exit(1);
          }
          const owner = ownerRepo.slice(0, slashIdx);
          const repo = ownerRepo.slice(slashIdx + 1);

          console.log(`Fetching dismissed patterns from PR #${prNumber} (${owner}/${repo})...`);

          const newPatterns = await collectDismissedPatterns(owner, repo, prNumber, token);

          const existing = await loadLearnedPatterns(process.cwd());
          const merged = mergePatterns(
            existing?.dismissedPatterns ?? [],
            newPatterns,
          );

          await saveLearnedPatterns(process.cwd(), {
            version: 1,
            dismissedPatterns: merged,
          });

          console.log(t('cli.info.patternLearned', { prNumber: String(prNumber), count: String(newPatterns.length) }));
          console.log(t('cli.info.totalPatterns', { count: String(merged.length) }));
        } catch (err) {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      },
    );

  // list subcommand
  learnCmd
    .command('list')
    .description('Show all learned patterns')
    .action(async () => {
      try {
        const data = await loadLearnedPatterns(process.cwd());
        if (!data || data.dismissedPatterns.length === 0) {
          console.log(t('cli.learn.list.empty'));
          return;
        }

        console.log(bold('Learned Patterns'));
        console.log('─'.repeat(60));
        for (let i = 0; i < data.dismissedPatterns.length; i++) {
          const p = data.dismissedPatterns[i]!;
          console.log(`  ${dim(`[${i}]`)} ${p.pattern}`);
          console.log(`       severity: ${p.severity}  dismissed: ${p.dismissCount}x  action: ${p.action}`);
          console.log(`       last: ${p.lastDismissed}`);
        }
        console.log('');
        console.log(`Total: ${data.dismissedPatterns.length} pattern(s)`);
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // clear subcommand
  learnCmd
    .command('clear')
    .description('Clear all learned patterns')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options: { yes?: boolean }) => {
      try {
        const data = await loadLearnedPatterns(process.cwd());
        if (!data || data.dismissedPatterns.length === 0) {
          console.log(t('cli.learn.list.empty'));
          return;
        }

        if (!options.yes) {
          const readline = await import('readline');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise<string>((resolve) => {
            rl.question(t('cli.confirm.clearPatterns', { count: String(data.dismissedPatterns.length) }) + ' ', resolve);
          });
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log(t('cli.confirm.cancelled'));
            return;
          }
        }

        await saveLearnedPatterns(process.cwd(), {
          version: 1,
          dismissedPatterns: [],
        });
        console.log(t('cli.learn.cleared'));
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // stats subcommand
  learnCmd
    .command('stats')
    .description('Show learned pattern statistics')
    .action(async () => {
      try {
        const data = await loadLearnedPatterns(process.cwd());
        if (!data || data.dismissedPatterns.length === 0) {
          console.log(t('cli.learn.list.empty'));
          return;
        }

        const patterns = data.dismissedPatterns;
        const totalDismissals = patterns.reduce((sum, p) => sum + p.dismissCount, 0);
        const mostSuppressed = patterns.reduce((max, p) => p.dismissCount > max.dismissCount ? p : max, patterns[0]!);
        const lastUpdated = patterns.reduce((latest, p) => p.lastDismissed > latest ? p.lastDismissed : latest, '');

        console.log(bold('Learn Stats'));
        console.log('─'.repeat(40));
        console.log(`  Total patterns:     ${patterns.length}`);
        console.log(`  Total dismissals:   ${totalDismissals}`);
        console.log(`  Most suppressed:    "${mostSuppressed.pattern}" (${mostSuppressed.dismissCount}x)`);
        console.log(`  Last updated:       ${lastUpdated}`);

        // Severity breakdown
        const bySeverity = new Map<string, number>();
        for (const p of patterns) {
          bySeverity.set(p.severity, (bySeverity.get(p.severity) ?? 0) + 1);
        }
        console.log('');
        console.log('  By severity:');
        for (const [sev, count] of bySeverity) {
          console.log(`    ${sev}: ${count}`);
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // remove subcommand
  learnCmd
    .command('remove <index>')
    .description('Remove a pattern by index')
    .action(async (indexStr: string) => {
      try {
        const index = parseInt(indexStr, 10);
        const data = await loadLearnedPatterns(process.cwd());
        if (!data || data.dismissedPatterns.length === 0) {
          console.log(t('cli.learn.list.empty'));
          return;
        }
        if (isNaN(index) || index < 0 || index >= data.dismissedPatterns.length) {
          console.error(t('cli.learn.error.invalidIndex', { max: String(data.dismissedPatterns.length - 1) }));
          process.exit(1);
        }

        const removed = data.dismissedPatterns[index]!;
        data.dismissedPatterns.splice(index, 1);
        await saveLearnedPatterns(process.cwd(), data);
        console.log(t('cli.info.removedPattern', { pattern: removed.pattern }));
        console.log(t('cli.info.patternsRemaining', { count: String(data.dismissedPatterns.length) }));
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // export subcommand
  learnCmd
    .command('export')
    .description('Export learned patterns as JSON to stdout')
    .action(async () => {
      try {
        const data = await loadLearnedPatterns(process.cwd());
        if (!data || data.dismissedPatterns.length === 0) {
          console.log(JSON.stringify({ version: 1, dismissedPatterns: [] }, null, 2));
          return;
        }
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // import subcommand
  learnCmd
    .command('import <file>')
    .description('Import learned patterns from a JSON file')
    .action(async (file: string) => {
      try {
        const filePath = path.resolve(file);
        const raw = await fs.readFile(filePath, 'utf-8');
        const imported = JSON.parse(raw) as LearnedPatterns;

        if (!imported.dismissedPatterns || !Array.isArray(imported.dismissedPatterns)) {
          console.error(t('cli.learn.error.invalidPatternsFile'));
          process.exit(1);
        }

        const existing = await loadLearnedPatterns(process.cwd());
        const merged = mergePatterns(
          existing?.dismissedPatterns ?? [],
          imported.dismissedPatterns,
        );

        await saveLearnedPatterns(process.cwd(), {
          version: 1,
          dismissedPatterns: merged,
        });

        console.log(t('cli.info.importedPatterns', { count: String(imported.dismissedPatterns.length) }));
        console.log(t('cli.info.totalPatterns', { count: String(merged.length) }));
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

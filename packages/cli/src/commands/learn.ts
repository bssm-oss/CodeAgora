/**
 * `learn` CLI Command
 * Learn from dismissed review patterns in a GitHub PR.
 */

import { Command } from 'commander';
import { collectDismissedPatterns } from '@codeagora/core/learning/collector.js';
import {
  loadLearnedPatterns,
  saveLearnedPatterns,
  mergePatterns,
} from '@codeagora/core/learning/store.js';
import { parseGitRemote } from '@codeagora/github/client.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

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
  program
    .command('learn')
    .description('Learn from dismissed review patterns in a GitHub PR')
    .requiredOption('--from-pr <number>', 'PR number to learn from')
    .option('--repo <owner/repo>', 'Repository (default: from git remote origin)')
    .action(
      async (options: { fromPr: string; repo?: string }) => {
        try {
          const prNumber = parseInt(options.fromPr, 10);
          if (isNaN(prNumber) || prNumber <= 0) {
            console.error('Error: --from-pr must be a positive integer');
            process.exit(1);
          }

          const token = process.env['GITHUB_TOKEN'];
          if (!token) {
            console.error('Error: GITHUB_TOKEN environment variable required');
            process.exit(1);
          }

          const ownerRepo = options.repo ?? (await getRepoFromGit());
          const slashIdx = ownerRepo.indexOf('/');
          if (slashIdx === -1) {
            console.error('Error: --repo must be in <owner/repo> format');
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

          console.log(`Learned ${newPatterns.length} pattern(s) from PR #${prNumber}`);
          console.log(`Total patterns: ${merged.length}`);
        } catch (err) {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      },
    );
}

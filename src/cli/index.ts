#!/usr/bin/env node
/**
 * CodeAgora V3 CLI
 * Multi-agent code review pipeline
 */

import { Command } from 'commander';
import { runPipeline } from '../pipeline/orchestrator.js';
import { loadConfig } from '../config/loader.js';
import path from 'path';
import fs from 'fs/promises';
import { runInit, runInitInteractive, UserCancelledError } from './commands/init.js';
import { runDoctor, formatDoctorReport, runLiveHealthCheck } from './commands/doctor.js';
import { listProviders, formatProviderList } from './commands/providers.js';
import {
  listSessions, showSession, diffSessions, getSessionStats, pruneSessions,
  formatSessionList, formatSessionDetail, formatSessionDiff, formatSessionStats,
} from './commands/sessions.js';
import { formatOutput, type OutputFormat } from './formatters/review-output.js';
import { parseReviewerOption, readStdin } from './options/review-options.js';
import { formatError, classifyError } from './utils/errors.js';
import { sendNotifications, type NotificationPayload } from '../notifications/webhook.js';
import ora from 'ora';
import { ProgressEmitter } from '../pipeline/progress.js';
import { setLocale, detectLocale } from '../i18n/index.js';
import { parsePrUrl, createGitHubConfig } from '../github/client.js';
import { fetchPrDiff } from '../github/pr-diff.js';
import { buildDiffPositionIndex } from '../github/diff-parser.js';
import { mapToGitHubReview } from '../github/mapper.js';
import { postReview, setCommitStatus } from '../github/poster.js';
import { loadCredentials } from '../config/credentials.js';
import { registerLearnCommand } from './commands/learn.js';

// Load API keys from ~/.config/codeagora/credentials
loadCredentials();

/**
 * Derive the display name from the invoked binary path.
 * Exported for unit testing.
 */
export function detectBinaryName(argv1: string | undefined): string {
  const base = path.basename(argv1 ?? '');
  return base === 'agora' ? 'agora' : 'codeagora';
}

const displayName = detectBinaryName(process.argv[1]);

const program = new Command();

program
  .name(displayName)
  .description('Multi-LLM collaborative code review CLI')
  .version('3.0.0')
  .option('--lang <locale>', 'language (en/ko)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as { lang?: string };
    setLocale((opts.lang === 'ko' || opts.lang === 'en') ? opts.lang : detectLocale());
  });

program
  .command('review')
  .description('Run code review pipeline on a diff file')
  .argument('[diff-path]', 'Path to the diff file (use - for stdin)')
  .option('--dry-run', 'Validate config without running review')
  .option('--output <format>', 'Output format: text, json, md, github, annotated', 'text')
  .option('--provider <name>', 'Override provider for auto reviewers')
  .option('--model <name>', 'Override model for auto reviewers')
  .option('--verbose', 'Show detailed telemetry output', false)
  .option('--reviewers <value>', 'Number of reviewers or comma-separated names')
  .option('--timeout <seconds>', 'Pipeline timeout in seconds', parseInt)
  .option('--reviewer-timeout <seconds>', 'Per-reviewer timeout in seconds', parseInt)
  .option('--no-discussion', 'Skip L2 discussion phase')
  .option('--quiet', 'Suppress progress output', false)
  .option('--notify', 'send notification after review', false)
  .option('--pr <url-or-number>', 'GitHub PR URL or number (fetches diff from GitHub)')
  .option('--post-review', 'Post review comments back to the PR (requires --pr)', false)
  .action(async (diffPath: string | undefined, options: {
    dryRun?: boolean;
    output: string;
    provider?: string;
    model?: string;
    verbose: boolean;
    reviewers?: string;
    timeout?: number;
    reviewerTimeout?: number;
    discussion: boolean;
    quiet: boolean;
    notify: boolean;
    pr?: string;
    postReview: boolean;
  }) => {
    // Hoist stdinTmpPath so finally block can clean it up (#77)
    let stdinTmpPath: string | undefined;
    try {
      if (options.quiet && options.verbose) {
        options.verbose = false; // --quiet takes precedence
      }

      const outputFormat = (['text', 'json', 'md', 'github', 'annotated'].includes(options.output)
        ? options.output : 'text') as OutputFormat;

      // Handle --pr: fetch diff from GitHub
      let resolvedPath: string;
      let prContext: { owner: string; repo: string; prNumber: number; headSha: string; diff: string } | undefined;

      if (options.pr) {
        const parsed = parsePrUrl(options.pr);
        let ghConfig;
        if (parsed) {
          ghConfig = createGitHubConfig({ prUrl: options.pr });
        } else {
          const prNum = parseInt(options.pr, 10);
          if (isNaN(prNum)) {
            console.error('Error: --pr must be a GitHub PR URL or a number');
            process.exit(1);
          }
          const { execFile } = await import('child_process');
          const { promisify } = await import('util');
          const execFileAsync = promisify(execFile);
          const { stdout: remoteUrl } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
          ghConfig = createGitHubConfig({ remoteUrl: remoteUrl.trim(), prNumber: prNum });
        }

        if (!options.quiet) console.error(`Fetching PR #${ghConfig.prNumber} diff from GitHub...`);
        const prInfo = await fetchPrDiff(ghConfig, ghConfig.prNumber);

        const tmpDir = path.join(process.cwd(), '.ca');
        await fs.mkdir(tmpDir, { recursive: true });
        stdinTmpPath = path.join(tmpDir, `tmp-pr-${ghConfig.prNumber}-${Date.now()}.patch`);
        await fs.writeFile(stdinTmpPath, prInfo.diff);
        resolvedPath = stdinTmpPath;

        // Save PR context for --post-review
        const { createOctokit } = await import('../github/client.js');
        const kit = createOctokit(ghConfig);
        const { data: prData } = await kit.pulls.get({
          owner: ghConfig.owner,
          repo: ghConfig.repo,
          pull_number: ghConfig.prNumber,
        });
        prContext = {
          owner: ghConfig.owner,
          repo: ghConfig.repo,
          prNumber: ghConfig.prNumber,
          headSha: prData.head.sha,
          diff: prInfo.diff,
        };
      } else if (diffPath === '-' || (!diffPath && !process.stdin.isTTY)) {
        // Handle stdin
        const stdinContent = await readStdin();
        stdinTmpPath = path.join(process.cwd(), '.ca', `tmp-stdin-${Date.now()}.patch`);
        await fs.mkdir(path.dirname(stdinTmpPath), { recursive: true });
        await fs.writeFile(stdinTmpPath, stdinContent);
        resolvedPath = stdinTmpPath;
      } else if (diffPath) {
        resolvedPath = path.resolve(diffPath);
      } else {
        console.error('Error: diff-path required (or pipe via stdin, or use --pr)');
        process.exit(1);
      }

      // Check diff file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        console.error(`Error: Diff file not found: ${resolvedPath}`);
        process.exit(1);
      }

      if (options.dryRun) {
        console.log('Validating config...');
        const config = await loadConfig();
        console.log('Config valid.');
        console.log(`  Reviewers: ${Array.isArray(config.reviewers) ? config.reviewers.length : config.reviewers.count}`);
        console.log(`  Supporters: ${config.supporters.pool.length}`);
        console.log(`  Max rounds: ${config.discussion.maxRounds}`);
        return;
      }

      // Parse --reviewers if provided
      let reviewerSelection: { count?: number; names?: string[] } | undefined;
      if (options.reviewers) {
        reviewerSelection = parseReviewerOption(options.reviewers);
      }

      // Build pipeline options from CLI flags
      const pipelineOptions = {
        diffPath: resolvedPath,
        ...(options.provider && { providerOverride: options.provider }),
        ...(options.model && { modelOverride: options.model }),
        ...(options.timeout && { timeoutMs: options.timeout * 1000 }),
        ...(options.reviewerTimeout && { reviewerTimeoutMs: options.reviewerTimeout * 1000 }),
        ...(!options.discussion && { skipDiscussion: true }),
        ...(reviewerSelection && { reviewerSelection }),
      };

      if (options.verbose) {
        console.log(`Starting review: ${resolvedPath}`);
        if (options.provider) console.log(`  Provider override: ${options.provider}`);
        if (options.model) console.log(`  Model override: ${options.model}`);
        if (options.timeout) console.log(`  Pipeline timeout: ${options.timeout}s`);
        if (options.reviewerTimeout) console.log(`  Reviewer timeout: ${options.reviewerTimeout}s`);
        if (!options.discussion) console.log(`  Discussion: skipped`);
        console.log('---');
      }

      // Setup progress spinner (stderr so stdout remains clean for results)
      let progress: ProgressEmitter | undefined;
      let spinner: ReturnType<typeof ora> | undefined;

      if (!options.quiet) {
        progress = new ProgressEmitter();
        spinner = ora({ stream: process.stderr });

        const stageLabels: Record<string, string> = {
          init: 'Loading config...',
          review: 'Running reviewers...',
          discuss: 'Moderating discussions...',
          verdict: 'Generating verdict...',
          complete: 'Done!',
        };

        progress.onProgress((event) => {
          switch (event.event) {
            case 'stage-start':
              spinner!.start(stageLabels[event.stage] ?? event.stage);
              break;
            case 'stage-update':
              // Per-reviewer progress updates are not currently emitted by executeReviewers.
              // Future enhancement: wrap each reviewer promise to emit incremental progress.
              break;
            case 'stage-complete':
              spinner!.succeed(stageLabels[event.stage] ?? event.stage);
              break;
            case 'stage-error':
              spinner!.fail(event.details?.error ?? 'Error');
              break;
            case 'pipeline-complete':
              spinner!.stop();
              break;
          }
        });
      }

      const result = await runPipeline(pipelineOptions, progress);
      spinner?.stop();

      // For annotated format, read the original diff file and pass it through
      let annotatedOptions: { diffContent?: string } | undefined;
      if (outputFormat === 'annotated') {
        try {
          const diffContent = await fs.readFile(resolvedPath, 'utf-8');
          annotatedOptions = { diffContent };
        } catch {
          // If we can't read the diff, formatAnnotated will show "(no diff content)"
        }
      }
      console.log(formatOutput(result, outputFormat, annotatedOptions));

      // Post review to GitHub if --post-review and --pr were used
      if (options.postReview && prContext && result.status === 'success' && result.summary) {
        if (!options.quiet) console.error('Posting review to GitHub...');
        const ghConfig = { token: process.env['GITHUB_TOKEN'] ?? '', owner: prContext.owner, repo: prContext.repo };
        const positionIndex = buildDiffPositionIndex(prContext.diff);
        const cliReviewerMap = result.reviewerMap ? new Map(Object.entries(result.reviewerMap)) : undefined;
        const review = mapToGitHubReview({
          summary: result.summary,
          evidenceDocs: result.evidenceDocs ?? [],
          discussions: result.discussions ?? [],
          positionIndex,
          headSha: prContext.headSha,
          sessionId: result.sessionId,
          sessionDate: result.date,
          reviewerMap: cliReviewerMap,
        });
        const postResult = await postReview(ghConfig, prContext.prNumber, review);
        await setCommitStatus(ghConfig, prContext.headSha, postResult.verdict, postResult.reviewUrl);
        if (!options.quiet) console.error(`Review posted: ${postResult.reviewUrl}`);
      }

      // Send notifications if requested and pipeline succeeded with a summary
      if (result.status === 'success' && result.summary) {
        const config = await loadConfig().catch(() => null);
        const shouldNotify = options.notify || config?.notifications?.autoNotify === true;
        if (shouldNotify && config?.notifications) {
          const s = result.summary;
          const payload: NotificationPayload = {
            decision: s.decision,
            reasoning: s.reasoning,
            severityCounts: s.severityCounts,
            topIssues: s.topIssues.map((i) => ({
              severity: i.severity,
              filePath: i.filePath,
              title: i.title,
            })),
            sessionId: result.sessionId,
            date: result.date,
            totalDiscussions: s.totalDiscussions,
            resolved: s.resolved,
            escalated: s.escalated,
          };
          await sendNotifications(config.notifications, payload);
        }
      }

      if (result.summary?.decision === 'REJECT') {
        process.exit(1);
      }

      if (result.status !== 'success') {
        process.exit(1);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(formatError(error, options.verbose));
      const { exitCode } = classifyError(error);
      process.exit(exitCode);
    } finally {
      // Clean up stdin/PR temp file — guaranteed even on error (#77)
      if (stdinTmpPath) {
        try { await fs.unlink(stdinTmpPath); } catch { /* ignore */ }
      }
    }
  });

program
  .command('config')
  .description('Validate and display current config')
  .action(async () => {
    try {
      const config = await loadConfig();
      console.log('Config: .ca/config.json');
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Config error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize CodeAgora in current project')
  .option('--format <format>', 'Config format (json or yaml)', 'json')
  .option('--force', 'Overwrite existing files', false)
  .option('-y, --yes', 'Skip prompts, use defaults', false)
  .option('--ci', 'also create GitHub Actions workflow', false)
  .action(async (options: { format: string; force: boolean; yes: boolean; ci: boolean }) => {
    try {
      const format = options.format === 'yaml' ? 'yaml' : 'json';
      const isInteractive = !options.yes && process.stdin.isTTY;
      let result;
      if (isInteractive) {
        try {
          result = await runInitInteractive({ format, force: options.force, baseDir: process.cwd(), ci: options.ci });
        } catch (err) {
          if (err instanceof UserCancelledError) {
            console.log(err.message);
            return;
          }
          throw err;
        }
      } else {
        result = await runInit({ format, force: options.force, baseDir: process.cwd(), ci: options.ci });
      }
      for (const f of result.created) {
        console.log(`  created: ${f}`);
      }
      for (const f of result.skipped) {
        console.log(`  skipped: ${f} (already exists, use --force to overwrite)`);
      }
      for (const w of result.warnings) {
        console.warn(`  warning: ${w}`);
      }
      if (result.created.length > 0) {
        console.log('CodeAgora initialized successfully.');
      }
      if (options.ci && result.created.some(f => f.includes('codeagora-review.yml'))) {
        console.log('Created: .github/workflows/codeagora-review.yml');
        console.log('  Add GROQ_API_KEY to your repository secrets:');
        console.log('  Settings -> Secrets -> Actions -> New repository secret');
      }
    } catch (error) {
      console.error('Init failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Check environment and configuration')
  .option('--live', 'test actual API connections', false)
  .action(async (options: { live: boolean }) => {
    try {
      const result = await runDoctor(process.cwd());

      if (options.live) {
        try {
          const { loadConfig } = await import('../config/loader.js');
          const config = await loadConfig();
          result.liveChecks = await runLiveHealthCheck(config);
        } catch (liveErr) {
          console.error(
            'Live check failed:',
            liveErr instanceof Error ? liveErr.message : liveErr
          );
        }
      }

      console.log(formatDoctorReport(result));
      if (result.summary.fail > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Doctor failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('providers')
  .description('List supported providers and API key status')
  .action(() => {
    const providers = listProviders();
    console.log(formatProviderList(providers));
  });

const sessionsCmd = program
  .command('sessions')
  .description('List, show, or diff past review sessions');

sessionsCmd
  .command('list')
  .description('List recent review sessions')
  .option('--limit <n>', 'Maximum sessions to show', parseInt)
  .option('--status <status>', 'Filter by status (completed/failed/in_progress)')
  .option('--after <date>', 'Sessions after date (YYYY-MM-DD)')
  .option('--before <date>', 'Sessions before date (YYYY-MM-DD)')
  .option('--sort <field>', 'Sort by (date/status/issues)', 'date')
  .action(async (opts: { limit?: number; status?: string; after?: string; before?: string; sort?: string }) => {
    try {
      const sessions = await listSessions(process.cwd(), {
        limit: opts.limit,
        status: opts.status,
        after: opts.after,
        before: opts.before,
        sort: opts.sort,
      });
      console.log(formatSessionList(sessions));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

sessionsCmd
  .command('stats')
  .description('Show review statistics')
  .action(async () => {
    try {
      const stats = await getSessionStats(process.cwd());
      console.log(formatSessionStats(stats));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

sessionsCmd
  .command('show <session>')
  .description('Show details for a session (e.g. 2026-03-13/001)')
  .action(async (session: string) => {
    try {
      const detail = await showSession(process.cwd(), session);
      console.log(formatSessionDetail(detail));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

sessionsCmd
  .command('diff <session1> <session2>')
  .description('Compare issues between two sessions')
  .action(async (session1: string, session2: string) => {
    try {
      const diff = await diffSessions(process.cwd(), session1, session2);
      console.log(formatSessionDiff(diff));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

sessionsCmd
  .command('prune')
  .description('Delete sessions older than N days (default: 30)')
  .option('--days <n>', 'Maximum age in days', parseInt)
  .action(async (opts: { days?: number }) => {
    try {
      const days = opts.days ?? 30;
      const result = await pruneSessions(process.cwd(), days);
      console.log(`Pruned ${result.deleted} session(s) older than ${days} day(s).`);
      if (result.errors > 0) {
        console.warn(`${result.errors} session(s) could not be deleted.`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('notify <session-id>')
  .description('Send notification for a past review session (format: YYYY-MM-DD/NNN)')
  .action(async (sessionId: string) => {
    try {
      const config = await loadConfig();
      if (!config.notifications) {
        console.error('No notifications configured in .ca/config.json');
        process.exit(1);
      }

      // Parse "YYYY-MM-DD/NNN" format
      const parts = sessionId.split('/');
      if (parts.length !== 2) {
        console.error('Session ID must be in format YYYY-MM-DD/NNN');
        process.exit(1);
      }
      const [date, id] = parts;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date!) || !/^\d+$/.test(id!)) {
        console.error('Invalid session ID format. Expected: YYYY-MM-DD/NNN');
        process.exit(1);
      }
      const sessionDir = path.join(process.cwd(), '.ca', 'sessions', date!, id!);

      // Load verdict
      let verdictRaw: Record<string, unknown> | null = null;
      try {
        const raw = await fs.readFile(path.join(sessionDir, 'head-verdict.json'), 'utf-8');
        verdictRaw = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        console.error(`Session not found: ${sessionId}`);
        process.exit(1);
      }

      const decision = String(verdictRaw['decision'] ?? 'NEEDS_HUMAN');
      const reasoning = String(verdictRaw['reasoning'] ?? '');
      const severityCounts = (verdictRaw['severityCounts'] as Record<string, number>) ?? {};
      const topIssues = (verdictRaw['topIssues'] as Array<{ severity: string; filePath: string; title: string }>) ?? [];

      const payload: NotificationPayload = {
        decision,
        reasoning,
        severityCounts,
        topIssues,
        sessionId: id!,
        date: date!,
        totalDiscussions: Number(verdictRaw['totalDiscussions'] ?? 0),
        resolved: Number(verdictRaw['resolved'] ?? 0),
        escalated: Number(verdictRaw['escalated'] ?? 0),
      };

      await sendNotifications(config.notifications, payload);
      console.log(`Notification sent for session ${sessionId}`);
    } catch (error) {
      console.error('Notify failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('tui')
  .description('Launch interactive TUI mode')
  .action(async () => {
    const { startTui } = await import('../tui/index.js');
    startTui();
  });

registerLearnCommand(program);

// Only parse argv when this file is the direct entry point (not imported by tests).
// In ESM the canonical check is comparing import.meta.url to the process entry module.
// A simpler cross-env guard: skip parse when NODE_ENV is 'test' and argv hasn't been
// explicitly set beyond the two node/script entries.
if (process.env.NODE_ENV !== 'test') {
  program.parse();
}

#!/usr/bin/env node
/**
 * CodeAgora V3 CLI
 * Multi-agent code review pipeline
 */

import { Command } from 'commander';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { loadConfig } from '@codeagora/core/config/loader.js';
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
// @codeagora/notifications is optional — dynamically imported when needed
import ora from 'ora';
import { ProgressEmitter } from '@codeagora/core/pipeline/progress.js';
import { setLocale, detectLocale, t } from '@codeagora/shared/i18n/index.js';
import { parsePrUrl, createGitHubConfig } from '@codeagora/github/client.js';
import { fetchPrDiff } from '@codeagora/github/pr-diff.js';
import { buildDiffPositionIndex } from '@codeagora/github/diff-parser.js';
import { mapToGitHubReview } from '@codeagora/github/mapper.js';
import { postReview, setCommitStatus } from '@codeagora/github/poster.js';
import { loadCredentials } from '@codeagora/core/config/credentials.js';
import { registerLearnCommand } from './commands/learn.js';
import { getModelLeaderboard, formatLeaderboard } from './commands/models.js';
import { explainSession } from './commands/explain.js';
import { computeAgreementMatrix, formatAgreementMatrix } from './commands/agreement.js';
import { loadSessionForReplay } from './commands/replay.js';
import { startDashboard } from './commands/dashboard.js';
import { getCostSummary } from './commands/costs.js';
import { getStatus } from './commands/status.js';
import { setConfigValue, editConfig } from './commands/config-set.js';
import { testProviders, formatProviderTestResults } from './commands/providers-test.js';
import { loadModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import { detectCliBackends } from '@codeagora/shared/utils/cli-detect.js';

// Load API keys from ~/.config/codeagora/credentials
await loadCredentials();

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
  .version(process.env.CODEAGORA_VERSION ?? 'dev')
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
  .option('--output <format>', 'Output format: text, json, md, github, annotated, html, junit', 'text')
  .option('--provider <name>', 'Override provider for auto reviewers')
  .option('--model <name>', 'Override model for auto reviewers')
  .option('-v, --verbose', 'Show detailed issue info and fix suggestions', false)
  .option('--reviewers <value>', 'Number of reviewers or comma-separated names')
  .option('--timeout <seconds>', 'Pipeline timeout in seconds', parseInt)
  .option('--reviewer-timeout <seconds>', 'Per-reviewer timeout in seconds', parseInt)
  .option('--no-discussion', 'Skip L2 discussion phase')
  .option('--quiet', 'Suppress progress output', false)
  .option('--notify', 'send notification after review', false)
  .option('--pr <url-or-number>', 'GitHub PR URL or number (fetches diff from GitHub)')
  .option('--post-review', 'Post review comments back to the PR (requires --pr)', false)
  .option('--quick', 'Quick review (L1 only, skip discussion and verdict)')
  .option('--staged', 'Review staged changes (git diff --staged)')
  .option('--context-lines <n>', 'Surrounding code context lines (default 20, 0 = disabled)', parseInt)
  .option('--json-stream', 'Stream NDJSON events during review (for CI/pipelines)')
  .option('--no-cache', 'Skip result caching — always run a fresh review')
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
    quick?: boolean;
    staged?: boolean;
    contextLines?: number;
    jsonStream?: boolean;
    cache: boolean;
  }) => {
    // Hoist stdinTmpPath so finally block can clean it up (#77)
    let stdinTmpPath: string | undefined;
    try {
      if (options.quiet && options.verbose) {
        options.verbose = false; // --quiet takes precedence
      }

      const outputFormat = (['text', 'json', 'md', 'github', 'annotated', 'html', 'junit'].includes(options.output)
        ? options.output : 'text') as OutputFormat;

      // Handle --staged: run git diff --staged and use as input
      if (options.staged) {
        const { execFileSync } = await import('child_process');
        let stagedDiff: string;
        try {
          stagedDiff = execFileSync('git', ['diff', '--staged'], { encoding: 'utf-8' });
        } catch {
          console.error('Failed to run "git diff --staged". Are you in a git repository?');
          process.exit(1);
        }
        if (!stagedDiff.trim()) {
          console.error(t('cli.staged.empty'));
          process.exit(1);
        }
        const tmpDir = path.join(process.cwd(), '.ca', 'tmp');
        await fs.mkdir(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, `staged-${Date.now()}.diff`);
        await fs.writeFile(tmpPath, stagedDiff, 'utf-8');
        diffPath = tmpPath;
        stdinTmpPath = tmpPath; // reuse cleanup variable
      }

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
        const { createOctokit } = await import('@codeagora/github/client.js');
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

      // Auto-detect git repo root for context-aware review
      let repoPath: string | undefined;
      const contextLines = options.contextLines ?? 20;
      if (contextLines > 0) {
        try {
          const { execFileSync } = await import('child_process');
          repoPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
            encoding: 'utf-8',
          }).trim();
        } catch {
          // Not in a git repo — context-aware review disabled
        }
      }

      // Build pipeline options from CLI flags
      const pipelineOptions = {
        diffPath: resolvedPath,
        ...(options.provider && { providerOverride: options.provider }),
        ...(options.model && { modelOverride: options.model }),
        ...(options.timeout && { timeoutMs: options.timeout * 1000 }),
        ...(options.reviewerTimeout && { reviewerTimeoutMs: options.reviewerTimeout * 1000 }),
        ...(!options.discussion && { skipDiscussion: true }),
        ...(options.quick && { skipDiscussion: true, skipHead: true }),
        ...(reviewerSelection && { reviewerSelection }),
        ...(!options.cache && { noCache: true }),
        ...(repoPath && { repoPath }),
        contextLines,
      };

      if (options.verbose) {
        console.log(`Starting review: ${resolvedPath}`);
        if (options.provider) console.log(`  Provider override: ${options.provider}`);
        if (options.model) console.log(`  Model override: ${options.model}`);
        if (options.timeout) console.log(`  Pipeline timeout: ${options.timeout}s`);
        if (options.reviewerTimeout) console.log(`  Reviewer timeout: ${options.reviewerTimeout}s`);
        if (!options.discussion) console.log(`  Discussion: skipped`);
        if (repoPath) console.log(`  Context lines: ${contextLines}`);
        else if (contextLines > 0) console.log(`  Context: disabled (not a git repo)`);
        console.log('---');
      }

      // Setup progress spinner (stderr so stdout remains clean for results)
      let progress: ProgressEmitter | undefined;
      let spinner: ReturnType<typeof ora> | undefined;

      if (options.jsonStream) {
        progress = progress ?? new ProgressEmitter();
        progress.onProgress((event) => {
          process.stdout.write(JSON.stringify(event) + '\n');
        });
      }

      if (!options.quiet) {
        progress = progress ?? new ProgressEmitter();
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

      if (result.cached && !options.quiet) {
        console.error('Cache hit — returning previous review result. Use --no-cache to force a fresh review.');
      }

      // Build format options: verbose flag + annotated-specific options
      const formatOpts: Parameters<typeof formatOutput>[2] = {
        verbose: options.verbose,
      };
      if (outputFormat === 'annotated') {
        try {
          formatOpts.diffContent = await fs.readFile(resolvedPath, 'utf-8');
        } catch {
          // If we can't read the diff, formatAnnotated will show "(no diff content)"
        }
      }
      console.log(formatOutput(result, outputFormat, formatOpts));

      // Emit final result as NDJSON for --json-stream consumers
      if (options.jsonStream) {
        process.stdout.write(JSON.stringify({ type: 'result', ...result }) + '\n');
      }

      // Post review to GitHub if --post-review and --pr were used
      if (options.postReview && prContext && result.status === 'success' && result.summary) {
        if (!options.quiet) console.error('Posting review to GitHub...');
        const ghConfig = { token: process.env['GITHUB_TOKEN'] ?? '', owner: prContext.owner, repo: prContext.repo };
        const positionIndex = buildDiffPositionIndex(prContext.diff);
        const cliReviewerMap = result.reviewerMap ? new Map(Object.entries(result.reviewerMap)) : undefined;
        const cliReviewerOpinions = result.reviewerOpinions
          ? new Map(Object.entries(result.reviewerOpinions))
          : undefined;
        const review = mapToGitHubReview({
          summary: result.summary,
          evidenceDocs: result.evidenceDocs ?? [],
          discussions: result.discussions ?? [],
          positionIndex,
          headSha: prContext.headSha,
          sessionId: result.sessionId,
          sessionDate: result.date,
          reviewerMap: cliReviewerMap,
          reviewerOpinions: cliReviewerOpinions,
          devilsAdvocateId: result.devilsAdvocateId,
          supporterModelMap: result.supporterModelMap
            ? new Map(Object.entries(result.supporterModelMap))
            : undefined,
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
          try {
            const { sendNotifications } = await import('@codeagora/notifications/webhook.js');
            const s = result.summary;
            await sendNotifications(config.notifications, {
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
            });
          } catch {
            console.error('@codeagora/notifications is not installed.');
            console.error('Install: npm i -g @codeagora/notifications');
          }
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
          const { loadConfig } = await import('@codeagora/core/config/loader.js');
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
  .action(async () => {
    let catalog;
    try { catalog = await loadModelsCatalog(); } catch { /* optional */ }

    let cliBackends;
    try { cliBackends = await detectCliBackends(); } catch { /* optional */ }

    const providers = listProviders(catalog);
    console.log(formatProviderList(providers, cliBackends));
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
  .option('--search <keyword>', 'Search sessions by keyword (case-insensitive)')
  .action(async (opts: { limit?: number; status?: string; after?: string; before?: string; sort?: string; search?: string }) => {
    try {
      const sessions = await listSessions(process.cwd(), {
        limit: opts.limit,
        status: opts.status,
        after: opts.after,
        before: opts.before,
        sort: opts.sort,
        keyword: opts.search,
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

      let sendNotifications: typeof import('@codeagora/notifications/webhook.js')['sendNotifications'];
      try {
        ({ sendNotifications } = await import('@codeagora/notifications/webhook.js'));
      } catch {
        console.error('@codeagora/notifications is not installed.');
        console.error('Install: npm i -g @codeagora/notifications');
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

program
  .command('tui')
  .description('Launch interactive TUI mode')
  .action(async () => {
    try {
      const { startTui } = await import('@codeagora/tui/index.js');
      startTui();
    } catch {
      console.error('@codeagora/tui is not installed.');
      console.error('Install: npm i -g @codeagora/tui');
      process.exit(1);
    }
  });

registerLearnCommand(program);

// === Sprint 4+5 CLI commands ===

program
  .command('models')
  .description('Show model performance leaderboard')
  .action(async () => {
    try {
      const entries = await getModelLeaderboard();
      console.log(formatLeaderboard(entries));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('explain <session>')
  .description('Explain a past review session (e.g. 2026-03-19/001)')
  .action(async (session: string) => {
    try {
      const result = await explainSession(process.cwd(), session);
      console.log(result.narrative);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('agreement <session>')
  .description('Show reviewer agreement matrix for a session')
  .action(async (session: string) => {
    try {
      const [date, id] = session.split('/');
      if (!date || !id) { console.error('Session must be YYYY-MM-DD/NNN'); process.exit(1); }
      const sessionDir = path.join(process.cwd(), '.ca', 'sessions', date, id);
      const raw = await fs.readFile(path.join(sessionDir, 'result.json'), 'utf-8');
      const result = JSON.parse(raw) as { reviewerMap?: Record<string, string[]> };
      if (!result.reviewerMap) { console.error('No reviewer map in session'); process.exit(1); }
      const allIds = [...new Set(Object.values(result.reviewerMap).flat())];
      const matrix = computeAgreementMatrix(result.reviewerMap, allIds);
      console.log(formatAgreementMatrix(matrix));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('replay <session>')
  .description('Re-render a past review session locally (no LLM calls)')
  .action(async (session: string) => {
    try {
      const result = await loadSessionForReplay(process.cwd(), session);
      console.log(`Session ${result.sessionPath} — ${result.decision}`);
      console.log(`Evidence documents: ${result.evidenceDocs.length}`);
      if (result.evidenceDocs.length > 0) {
        const output = formatOutput({ status: 'success', sessionId: session.split('/')[1] ?? '', date: session.split('/')[0] ?? '', evidenceDocs: result.evidenceDocs } as Parameters<typeof formatOutput>[0], 'text');
        console.log(output);
      }
      if (!result.diffContent) {
        console.log('(Original diff file not available for annotated output)');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('language [locale]')
  .description('Get or set language (en/ko)')
  .action(async (locale?: string) => {
    const caRoot = path.join(process.cwd(), '.ca');

    if (!locale) {
      // Show current language
      try {
        const config = await loadConfig();
        const lang = config.language ?? detectLocale();
        console.log(`Current language: ${lang === 'ko' ? 'ko (한국어)' : 'en (English)'}`);
        console.log(`\nUsage: ${displayName} language <en|ko>`);
      } catch {
        const lang = detectLocale();
        console.log(`No config found. System locale: ${lang === 'ko' ? 'ko (한국어)' : 'en (English)'}`);
        console.log(`\nRun "${displayName} init" first, then "${displayName} language <en|ko>"`);
      }
      return;
    }

    if (locale !== 'en' && locale !== 'ko') {
      console.error(`Unsupported language: "${locale}". Supported: en, ko`);
      process.exit(1);
    }

    // Update config file
    const jsonPath = path.join(caRoot, 'config.json');
    const yamlPath = path.join(caRoot, 'config.yaml');

    let configPath: string | null = null;
    try { await fs.access(jsonPath); configPath = jsonPath; } catch { /* */ }
    if (!configPath) {
      try { await fs.access(yamlPath); configPath = yamlPath; } catch { /* */ }
    }

    if (!configPath) {
      console.error(`No config file found. Run "${displayName} init" first.`);
      process.exit(1);
    }

    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      console.error('YAML config editing is not yet supported. Use .ca/config.json.');
      process.exit(1);
    }

    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    config.language = locale;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    setLocale(locale);
    console.log(locale === 'ko'
      ? `✓ 언어가 한국어(ko)로 설정되었습니다.`
      : `✓ Language set to English (en).`
    );
  });

// === Dashboard command (#163) ===

program
  .command('dashboard')
  .description('Launch web dashboard')
  .option('--port <port>', 'Port number', '6274')
  .option('--open', 'Open browser')
  .action(async (options: { port: string; open?: boolean }) => {
    try {
      await startDashboard({ port: parseInt(options.port, 10), open: options.open });
    } catch (error) {
      console.error('Dashboard failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// === Costs command (#165) ===

program
  .command('costs')
  .description('Show cost analytics')
  .option('--last <days>', 'Last N days', parseInt)
  .option('--by <group>', 'Group by: reviewer, provider')
  .action(async (options: { last?: number; by?: string }) => {
    try {
      const summary = await getCostSummary(process.cwd(), options);
      console.log(summary);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// === CLI Improvements Batch 2 ===

program
  .command('status')
  .description('Show CodeAgora status overview')
  .action(async () => {
    try {
      const output = await getStatus(process.cwd());
      console.log(output);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('config-set <key> <value>')
  .description('Set a config value (dot notation: discussion.maxRounds)')
  .action(async (key: string, value: string) => {
    try {
      await setConfigValue(process.cwd(), key, value);
      console.log(t('cli.config.set.success', { key, value }));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('config-edit')
  .description('Open config in $EDITOR')
  .action(async () => {
    try {
      await editConfig(process.cwd());
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('providers-test')
  .description('Verify API key status for all providers')
  .action(() => {
    const results = testProviders();
    console.log(formatProviderTestResults(results));
  });

// === Help text examples (#169) ===

// Find registered commands and add help text
for (const cmd of program.commands) {
  const name = cmd.name();
  switch (name) {
    case 'review':
      cmd.addHelpText('after', `
Examples:
  git diff HEAD~1 | ${displayName} review          Review last commit
  ${displayName} review changes.diff               Review a diff file
  ${displayName} review --pr 123                   Review a GitHub PR
  ${displayName} review --staged                   Review staged changes
  ${displayName} review --quick                    Quick review (L1 only)
  ${displayName} review --verbose                   Show full issue details
  ${displayName} review --context-lines 40         More surrounding context
  ${displayName} review --context-lines 0          Disable context
  ${displayName} review --output json              JSON output for CI
  ${displayName} review --json-stream              Stream NDJSON for CI
  ${displayName} review --no-cache                 Skip cache, run fresh review
  ${displayName} review --output html              HTML report for sharing
  ${displayName} review --output junit             JUnit XML for CI integration
`);
      break;
    case 'init':
      cmd.addHelpText('after', `
Examples:
  ${displayName} init                              Interactive setup wizard
  ${displayName} init -y                           Use defaults (no prompts)
  ${displayName} init --format yaml                Create YAML config
  ${displayName} init --ci                         Also create GitHub Actions workflow
`);
      break;
    case 'doctor':
      cmd.addHelpText('after', `
Examples:
  ${displayName} doctor                            Check environment
  ${displayName} doctor --live                     Test actual API connections
`);
      break;
    case 'sessions':
      cmd.addHelpText('after', `
Examples:
  ${displayName} sessions list                     List recent sessions
  ${displayName} sessions list --limit 5           Show last 5 sessions
  ${displayName} sessions list --search "null"     Search sessions by keyword
  ${displayName} sessions show 2026-03-19/001      Show session details
  ${displayName} sessions diff 001 002             Compare two sessions
  ${displayName} sessions stats                    Show review statistics
`);
      break;
    case 'models':
      cmd.addHelpText('after', `
Examples:
  ${displayName} models                            Show model leaderboard
`);
      break;
    case 'costs':
      cmd.addHelpText('after', `
Examples:
  ${displayName} costs                             Show total cost summary
  ${displayName} costs --last 7                    Costs from last 7 days
  ${displayName} costs --by reviewer               Group costs by reviewer model
  ${displayName} costs --by provider               Group costs by provider
`);
      break;
    case 'learn':
      cmd.addHelpText('after', `
Examples:
  ${displayName} learn from-pr --pr 42             Learn from PR #42
  ${displayName} learn list                        Show all learned patterns
  ${displayName} learn stats                       Show pattern statistics
  ${displayName} learn remove 0                    Remove pattern at index 0
  ${displayName} learn export > patterns.json      Export patterns
  ${displayName} learn import patterns.json        Import patterns
  ${displayName} learn clear                       Clear all patterns
`);
      break;
    case 'dashboard':
      cmd.addHelpText('after', `
Examples:
  ${displayName} dashboard                         Start on default port 6274
  ${displayName} dashboard --port 8080             Start on custom port
  ${displayName} dashboard --open                  Start and open browser
`);
      break;
    case 'language':
      cmd.addHelpText('after', `
Examples:
  ${displayName} language                          Show current language
  ${displayName} language en                       Set language to English
  ${displayName} language ko                       Set language to Korean
`);
      break;
    case 'status':
      cmd.addHelpText('after', `
Examples:
  ${displayName} status                            Show CodeAgora status
`);
      break;
    case 'config-set':
      cmd.addHelpText('after', `
Examples:
  ${displayName} config-set discussion.maxRounds 5 Set max discussion rounds
  ${displayName} config-set language ko            Set language to Korean
`);
      break;
    case 'config-edit':
      cmd.addHelpText('after', `
Examples:
  ${displayName} config-edit                       Open config in editor
`);
      break;
    case 'providers-test':
      cmd.addHelpText('after', `
Examples:
  ${displayName} providers-test                    Check API key status
`);
      break;
  }
}

// Only parse argv when this file is the direct entry point (not imported by tests).
// In ESM the canonical check is comparing import.meta.url to the process entry module.
// A simpler cross-env guard: skip parse when NODE_ENV is 'test' and argv hasn't been
// explicitly set beyond the two node/script entries.
// Default action: show quick guide when no command is given
program.action(() => {
  const r = '\x1b[0m', b = '\x1b[1m', c = '\x1b[36m', g = '\x1b[32m', d = '\x1b[2m', y = '\x1b[33m';
  console.log('');
  console.log(`  ${c}${b}CodeAgora${r} ${d}v${process.env.CODEAGORA_VERSION ?? 'dev'}${r}`);
  console.log(`  ${d}Multi-LLM collaborative code review${r}`);
  console.log('');
  console.log(`  ${g}Commands:${r}`);
  console.log(`    ${b}agora init${r}              ${d}Setup (auto-detects API keys + CLI tools)${r}`);
  console.log(`    ${b}agora review${r}            ${d}Run code review${r}`);
  console.log(`    ${b}agora review --quick${r}    ${d}Fast review (L1 only)${r}`);
  console.log(`    ${b}agora review --verbose${r}  ${d}Show full issue details${r}`);
  console.log(`    ${b}agora providers${r}         ${d}Show available providers${r}`);
  console.log(`    ${b}agora doctor${r}            ${d}Check setup health${r}`);
  console.log(`    ${b}agora language${r}          ${d}Switch language (en/ko)${r}`);
  console.log('');
  console.log(`  ${y}Free tier:${r} ${d}Groq + GitHub Models = unlimited free reviews${r}`);
  console.log(`  ${d}Run ${b}agora --help${r}${d} for all commands${r}`);
  console.log('');
});

// Easter egg (hidden from --help)
program
  .command('justn', { hidden: true })
  .action(async () => {
    const msg = 'I MADE IT GRAHHHHHHHHH ';
    const colors = ['\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[35m'];
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const end = Date.now() + 5000;
    let i = 0;
    while (Date.now() < end) {
      process.stdout.write(`${bold}${colors[i % colors.length]}${msg}${reset}`);
      i++;
      await new Promise((r) => setTimeout(r, 15));
    }
    console.log('\n');
    console.log(`${bold}\x1b[33m  ███╗   ███╗ █████╗ ██████╗ ███████╗    ██████╗ ██╗   ██╗     ██╗██╗   ██╗███████╗████████╗███╗   ██╗${reset}`);
    console.log(`${bold}\x1b[33m  ████╗ ████║██╔══██╗██╔══██╗██╔════╝    ██╔══██╗╚██╗ ██╔╝     ██║██║   ██║██╔════╝╚══██╔══╝████╗  ██║${reset}`);
    console.log(`${bold}\x1b[33m  ██╔████╔██║███████║██║  ██║█████╗      ██████╔╝ ╚████╔╝      ██║██║   ██║███████╗   ██║   ██╔██╗ ██║${reset}`);
    console.log(`${bold}\x1b[33m  ██║╚██╔╝██║██╔══██║██║  ██║██╔══╝      ██╔══██╗  ╚██╔╝  ██   ██║██║   ██║╚════██║   ██║   ██║╚██╗██║${reset}`);
    console.log(`${bold}\x1b[33m  ██║ ╚═╝ ██║██║  ██║██████╔╝███████╗    ██████╔╝   ██║   ╚█████╔╝╚██████╔╝███████║   ██║   ██║ ╚████║${reset}`);
    console.log(`${bold}\x1b[33m  ╚═╝     ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝    ╚═════╝    ╚═╝    ╚════╝  ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═══╝${reset}`);
    console.log('');
  });

if (process.env.NODE_ENV !== 'test') {
  program.parse();
}

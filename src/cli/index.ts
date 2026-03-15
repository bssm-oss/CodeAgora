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
  listSessions, showSession, diffSessions, getSessionStats,
  formatSessionList, formatSessionDetail, formatSessionDiff, formatSessionStats,
} from './commands/sessions.js';
import { formatOutput, type OutputFormat } from './formatters/review-output.js';
import { parseReviewerOption, readStdin } from './options/review-options.js';
import { formatError, classifyError } from './utils/errors.js';
import ora from 'ora';
import { ProgressEmitter } from '../pipeline/progress.js';

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
  .version('3.0.0');

program
  .command('review')
  .description('Run code review pipeline on a diff file')
  .argument('[diff-path]', 'Path to the diff file (use - for stdin)')
  .option('--dry-run', 'Validate config without running review')
  .option('--output <format>', 'Output format: text, json, md, github', 'text')
  .option('--provider <name>', 'Override provider for auto reviewers')
  .option('--model <name>', 'Override model for auto reviewers')
  .option('--verbose', 'Show detailed telemetry output', false)
  .option('--reviewers <value>', 'Number of reviewers or comma-separated names')
  .option('--timeout <seconds>', 'Pipeline timeout in seconds', parseInt)
  .option('--reviewer-timeout <seconds>', 'Per-reviewer timeout in seconds', parseInt)
  .option('--no-discussion', 'Skip L2 discussion phase')
  .option('--quiet', 'Suppress progress output', false)
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
  }) => {
    try {
      if (options.quiet && options.verbose) {
        options.verbose = false; // --quiet takes precedence
      }

      const outputFormat = (['text', 'json', 'md', 'github'].includes(options.output)
        ? options.output : 'text') as OutputFormat;

      // Handle stdin
      let resolvedPath: string;
      let stdinTmpPath: string | undefined;
      if (diffPath === '-' || (!diffPath && !process.stdin.isTTY)) {
        const stdinContent = await readStdin();
        stdinTmpPath = path.join(process.cwd(), '.ca', `tmp-stdin-${Date.now()}.patch`);
        await fs.mkdir(path.dirname(stdinTmpPath), { recursive: true });
        await fs.writeFile(stdinTmpPath, stdinContent);
        resolvedPath = stdinTmpPath;
      } else if (diffPath) {
        resolvedPath = path.resolve(diffPath);
      } else {
        console.error('Error: diff-path required (or pipe via stdin)');
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

      console.log(formatOutput(result, outputFormat));

      // Clean up stdin temp file if created
      if (stdinTmpPath) {
        try { await fs.unlink(stdinTmpPath); } catch { /* ignore */ }
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

program
  .command('tui')
  .description('Launch interactive TUI mode')
  .action(async () => {
    const { startTui } = await import('../tui/index.js');
    startTui();
  });

// Only parse argv when this file is the direct entry point (not imported by tests).
// In ESM the canonical check is comparing import.meta.url to the process entry module.
// A simpler cross-env guard: skip parse when NODE_ENV is 'test' and argv hasn't been
// explicitly set beyond the two node/script entries.
if (process.env.NODE_ENV !== 'test') {
  program.parse();
}

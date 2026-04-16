/**
 * Review Command
 * Run code review pipeline on a diff file.
 * Extracted from index.ts to reduce monolith size.
 */

import type { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import ora from 'ora';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { loadConfig } from '@codeagora/core/config/loader.js';
import { ProgressEmitter } from '@codeagora/core/pipeline/progress.js';
import { parsePrUrl, createGitHubConfig } from '@codeagora/github/client.js';
import { fetchPrDiff } from '@codeagora/github/pr-diff.js';
import { buildDiffPositionIndex } from '@codeagora/github/diff-parser.js';
import { mapToGitHubReview } from '@codeagora/github/mapper.js';
import { postReview, setCommitStatus } from '@codeagora/github/poster.js';
import { createAppOctokit } from '@codeagora/github/client.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { formatOutput, type OutputFormat } from '../formatters/review-output.js';
import { parseReviewerOption, readStdin } from '../options/review-options.js';
import { formatError } from '../utils/errors.js';
import { dim } from '../utils/colors.js';

// ============================================================================
// Types
// ============================================================================

interface ReviewOptions {
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
  failOnReject?: boolean;
  failOnSeverity?: string;
  scope?: string;
}

// ============================================================================
// Action handler
// ============================================================================

async function reviewAction(diffPath: string | undefined, options: ReviewOptions): Promise<void> {
  // Hoist stdinTmpPath so finally block can clean it up (#77)
  let stdinTmpPath: string | undefined;
  try {
    if (options.quiet && options.verbose) {
      options.verbose = false; // --quiet takes precedence
    }

    // Check for interrupted sessions
    if (!options.quiet) {
      try {
        const { recoverStaleSessions } = await import('@codeagora/core/session/manager.js');
        const recovered = await recoverStaleSessions();
        if (recovered > 0) {
          console.error(dim(`\u26A0 ${recovered} interrupted session(s) recovered. Run 'agora sessions' to inspect.`));
        }
      } catch { /* ignore — .ca/ may not exist yet */ }
    }

    const validFormats = ['text', 'json', 'md', 'github', 'annotated', 'html', 'junit'];
    if (!validFormats.includes(options.output)) {
      console.error(`Invalid output format: "${options.output}". Valid formats: ${validFormats.join(', ')}`);
      process.exit(1);
    }
    const outputFormat = options.output as OutputFormat;

    if (options.postReview && !options.pr) {
      console.error('--post-review requires --pr to specify the target PR');
      process.exit(1);
    }

    // Handle --staged: run git diff --staged and use as input
    if (options.staged) {
      const { execFileSync } = await import('child_process');
      let stagedDiff: string;
      try {
        stagedDiff = execFileSync('git', ['diff', '--staged'], { encoding: 'utf-8' });
      } catch {
        console.error(t('cli.error.gitStagedFailed'));
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
          console.error(t('cli.error.prFormat'));
          process.exit(1);
        }
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);
        const { stdout: remoteUrl } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
        ghConfig = createGitHubConfig({ remoteUrl: remoteUrl.trim(), prNumber: prNum });
      }

      if (!options.quiet) console.error(t('cli.info.fetchingPR', { prNumber: String(ghConfig.prNumber) }));
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
      if (!options.quiet) console.error(dim('Reading diff from stdin...'));
      const stdinContent = await readStdin();
      stdinTmpPath = path.join(process.cwd(), '.ca', `tmp-stdin-${Date.now()}.patch`);
      await fs.mkdir(path.dirname(stdinTmpPath), { recursive: true });
      await fs.writeFile(stdinTmpPath, stdinContent);
      resolvedPath = stdinTmpPath;
    } else if (diffPath) {
      resolvedPath = path.resolve(diffPath);
    } else {
      console.error(t('cli.error.diffPathRequired'));
      process.exit(1);
    }

    // Check diff file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      console.error(t('cli.error.diffFileNotFound', { path: resolvedPath }));
      process.exit(1);
    }

    // Zero-config: if no config exists, try inline setup
    try {
      await loadConfig();
    } catch {
      const { detectAvailableProvider, runInlineSetup } = await import('../utils/inline-setup.js');
      const existing = detectAvailableProvider();
      if (existing) {
        // API key exists but no config — create default config silently
        const { buildDefaultConfig } = await import('@codeagora/core/config/loader.js');
        const config = buildDefaultConfig(existing.name);
        const caDir = path.join(process.cwd(), '.ca');
        await fs.mkdir(caDir, { recursive: true });
        await fs.writeFile(path.join(caDir, 'config.json'), JSON.stringify(config, null, 2));
        if (!options.quiet) {
          console.error(`  \u2713 Auto-configured with ${existing.name} (${existing.envVar} detected)`);
        }
      } else {
        // No config, no keys — run inline setup
        if (!process.stdin.isTTY) {
          console.error('No config and no API keys found. Run `agora init` to set up.');
          process.exit(1);
        }
        await runInlineSetup(process.cwd());
      }
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
    // --scope: filter diff to only include changes in specified paths
    if (options.scope) {
      const scopes = options.scope.split(',').map((s) => s.trim());
      const diffContent = await fs.readFile(resolvedPath, 'utf-8');
      const filteredLines: string[] = [];
      let include = false;
      for (const line of diffContent.split('\n')) {
        if (line.startsWith('diff --git')) {
          include = scopes.some((scope) => line.includes(`b/${scope}`));
        }
        if (include) filteredLines.push(line);
      }
      if (filteredLines.length === 0) {
        console.error(dim(`No changes found in scope: ${options.scope}`));
        return;
      }
      await fs.writeFile(resolvedPath, filteredLines.join('\n'), 'utf-8');
      if (!options.quiet) {
        console.error(dim(`Scoped to: ${options.scope}`));
      }
    }

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
            spinner!.text = event.message;
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

    const reviewStart = Date.now();
    const result = await runPipeline(pipelineOptions, progress);
    const reviewDuration = ((Date.now() - reviewStart) / 1000).toFixed(1);
    spinner?.stop();

    if (!options.quiet) {
      console.error(`Review completed in ${reviewDuration}s`);
    }

    if (result.cached && !options.quiet) {
      console.error(t('cli.info.cacheHit'));
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
      if (!options.quiet) console.error(t('cli.info.postingReview'));
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
      const appKit = await createAppOctokit(prContext.owner, prContext.repo);
      if (appKit && !options.quiet) console.error(t('cli.info.usingAppAuth'));
      const postResult = await postReview(ghConfig, prContext.prNumber, review, appKit ?? undefined);
      await setCommitStatus(ghConfig, prContext.headSha, postResult.verdict, postResult.reviewUrl);
      if (!options.quiet) console.error(t('cli.info.reviewPosted', { url: postResult.reviewUrl }));
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
          console.error(t('cli.error.notificationsNotInstalled'));
          console.error(t('cli.error.notificationsInstall'));
        }
      }
    }

    if (result.summary?.decision === 'REJECT' && options.failOnReject) {
      process.exit(1);
    }

    // --fail-on-severity: exit 1 if any issue at or above the threshold
    if (options.failOnSeverity && result.summary?.severityCounts) {
      const order = ['SUGGESTION', 'WARNING', 'CRITICAL', 'HARSHLY_CRITICAL'];
      const threshold = order.indexOf(options.failOnSeverity.toUpperCase());
      if (threshold >= 0) {
        const hasIssueAtOrAbove = order.slice(threshold).some(
          (sev) => (result.summary!.severityCounts[sev as keyof typeof result.summary.severityCounts] ?? 0) > 0
        );
        if (hasIssueAtOrAbove) {
          process.exit(1);
        }
      }
    }

    if (result.status !== 'success') {
      process.exit(1);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(formatError(error, options.verbose));
    process.exit(1);
  } finally {
    // Clean up stdin/PR temp file — guaranteed even on error (#77)
    if (stdinTmpPath) {
      try { await fs.unlink(stdinTmpPath); } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// Command registration
// ============================================================================

export function registerReviewCommand(program: Command): void {
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
    .option('--fail-on-reject', 'Exit 1 on REJECT verdict (default: false)', false)
    .option('--fail-on-severity <level>', 'Exit 1 if any issue at or above this severity (SUGGESTION|WARNING|CRITICAL|HARSHLY_CRITICAL)')
    .option('--scope <paths>', 'Only review changes in these paths (comma-separated, e.g. "packages/web,packages/core")')
    .action(reviewAction);
}

#!/usr/bin/env node
/**
 * CodeAgora V3 CLI
 * Multi-agent code review pipeline
 *
 * Thin entry point — command logic lives in commands/*.ts
 */

import { Command } from 'commander';
import { loadConfig } from '@codeagora/core/config/loader.js';
import path from 'path';
import fs from 'fs/promises';
import { formatOutput } from './formatters/review-output.js';
import { dim } from './utils/colors.js';
import { setLocale, detectLocale, t } from '@codeagora/shared/i18n/index.js';
import { loadCredentials } from '@codeagora/core/config/credentials.js';
import { loadModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import { detectCliBackends } from '@codeagora/shared/utils/cli-detect.js';

// Command registrations
import { registerReviewCommand } from './commands/review.js';
import { registerInitCommand } from './commands/register-init.js';
import { registerSessionsCommand } from './commands/register-sessions.js';
import { registerLanguageCommand } from './commands/language.js';
import { registerConfigGetCommand } from './commands/config-get.js';
import { registerCheckUpdateCommand } from './commands/check-update.js';
import { registerLearnCommand } from './commands/learn.js';
import { addHelpExamples } from './commands/help-text.js';

// Command logic imports (for simple inline wiring)
import { runDoctor, formatDoctorReport, runLiveHealthCheck } from './commands/doctor.js';
import { listProviders, formatProviderList } from './commands/providers.js';
import { getModelLeaderboard, formatLeaderboard } from './commands/models.js';
import { explainSession } from './commands/explain.js';
import { traceSession } from './commands/trace.js';
import { computeAgreementMatrix, formatAgreementMatrix } from './commands/agreement.js';
import { loadSessionForReplay } from './commands/replay.js';
import { getCostSummary } from './commands/costs.js';
import { getStatus } from './commands/status.js';
import { setConfigValue, editConfig } from './commands/config-set.js';
import { testProviders, formatProviderTestResults } from './commands/providers-test.js';

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

// === Core commands (extracted) ===

registerReviewCommand(program);
registerInitCommand(program);
registerSessionsCommand(program);
registerLearnCommand(program);
registerLanguageCommand(program, displayName);
registerConfigGetCommand(program);
registerCheckUpdateCommand(program);

// === Simple inline commands ===

program.command('config').description('Validate and display current config').action(async () => {
  try {
    const config = await loadConfig();
    console.log('Config: .ca/config.json');
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Config error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

program.command('doctor').description('Check environment and configuration')
  .option('--live', 'test actual API connections', false)
  .action(async (options: { live: boolean }) => {
    try {
      const result = await runDoctor(process.cwd());
      if (options.live) {
        try {
          const config = await loadConfig();
          result.liveChecks = await runLiveHealthCheck(config);
        } catch (liveErr) {
          console.error('Live check failed:', liveErr instanceof Error ? liveErr.message : liveErr);
        }
      }
      console.log(formatDoctorReport(result));
      if (result.summary.fail > 0) process.exit(1);
    } catch (error) {
      console.error('Doctor failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.command('providers').description('List supported providers and API key status').action(async () => {
  let catalog;
  try { catalog = await loadModelsCatalog(); } catch { /* optional */ }
  let cliBackends;
  try { cliBackends = await detectCliBackends(); } catch { /* optional */ }
  console.log(formatProviderList(listProviders(catalog), cliBackends));
});

program.command('models').description('Show model performance leaderboard').action(async () => {
  try {
    console.log(formatLeaderboard(await getModelLeaderboard()));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

program.command('explain <session>').description('Explain a past review session (e.g. 2026-03-19/001)').action(async (session: string) => {
  try {
    console.log((await explainSession(process.cwd(), session)).narrative);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

program
  .command('trace <session>')
  .description('Show confidence-trace breakdown per finding (e.g. 2026-04-20/001)')
  .option('-f, --finding <idx>', 'Drill into a specific finding by 1-based index', (v) => parseInt(v, 10))
  .action(async (session: string, opts: { finding?: number }) => {
    try {
      const result = await traceSession(process.cwd(), session, { finding: opts.finding });
      console.log(result.output);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.command('agreement <session>').description('Show reviewer agreement matrix for a session').action(async (session: string) => {
  try {
    const [date, id] = session.split('/');
    if (!date || !id) { console.error(t('cli.error.sessionFormat')); process.exit(1); }
    const sessionDir = path.join(process.cwd(), '.ca', 'sessions', date, id);

    let reviewerMap: Record<string, string[]> | undefined;

    // Try result.json first
    try {
      const raw = await fs.readFile(path.join(sessionDir, 'result.json'), 'utf-8');
      const result = JSON.parse(raw) as { reviewerMap?: Record<string, string[]> };
      reviewerMap = result.reviewerMap;
    } catch {
      // Fallback: build reviewerMap from individual review files
      try {
        const reviewsDir = path.join(sessionDir, 'reviews');
        const files = await fs.readdir(reviewsDir);
        const map: Record<string, string[]> = {};
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const review = JSON.parse(await fs.readFile(path.join(reviewsDir, file), 'utf-8'));
          const rid = review.reviewerId ?? file.replace('.json', '');
          const issues: string[] = (review.issues ?? review.evidenceDocs ?? []).map(
            (i: { filePath?: string; lineRange?: number[] }) => `${i.filePath ?? '?'}:${i.lineRange?.[0] ?? '?'}`
          );
          map[rid] = issues;
        }
        if (Object.keys(map).length > 0) reviewerMap = map;
      } catch { /* no reviews directory */ }
    }

    if (!reviewerMap) { console.error(t('cli.error.noReviewerMap')); process.exit(1); }
    const allIds = [...new Set(Object.values(reviewerMap).flat())];
    console.log(formatAgreementMatrix(computeAgreementMatrix(reviewerMap, allIds)));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

program.command('replay <session>').description('Re-render a past review session locally (no LLM calls)').action(async (session: string) => {
  try {
    const result = await loadSessionForReplay(process.cwd(), session);
    const sessionId = session.split('/')[1] ?? '';
    const date = session.split('/')[0] ?? '';
    if (result.evidenceDocs.length > 0) {
      console.log(formatOutput(
        { status: 'success', sessionId, date, evidenceDocs: result.evidenceDocs } as Parameters<typeof formatOutput>[0],
        'text',
      ));
    } else {
      console.log(`Session ${date}/${sessionId} — ${result.decision}`);
      console.log('No evidence documents found in this session.');
    }
    if (!result.diffContent) {
      console.error(dim('Note: original diff not available. Use --output text (default) or re-run the review.'));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

program.command('costs').description('Show cost analytics')
  .option('--last <days>', 'Last N days', parseInt)
  .option('--by <group>', 'Group by: reviewer, provider')
  .action(async (options: { last?: number; by?: string }) => {
    try { console.log(await getCostSummary(process.cwd(), options)); }
    catch (error) { console.error('Error:', error instanceof Error ? error.message : error); process.exit(1); }
  });

program.command('status').description('Show CodeAgora status overview').action(async () => {
  try { console.log(await getStatus(process.cwd())); }
  catch (error) { console.error('Error:', error instanceof Error ? error.message : error); process.exit(1); }
});

program.command('config-set <key> <value>').description('Set a config value (dot notation: discussion.maxRounds)').action(async (key: string, value: string) => {
  try { await setConfigValue(process.cwd(), key, value); console.log(t('cli.config.set.success', { key, value })); }
  catch (error) { console.error('Error:', error instanceof Error ? error.message : error); process.exit(1); }
});

program.command('config-edit').description('Open config in $EDITOR').action(async () => {
  try { await editConfig(process.cwd()); }
  catch (error) { console.error('Error:', error instanceof Error ? error.message : error); process.exit(1); }
});

program.command('providers-test').description('Verify API key status for all providers').action(() => {
  console.log(formatProviderTestResults(testProviders()));
});

// === Persona management ===

const personaCmd = program.command('persona').description('Manage reviewer personas');
personaCmd.command('list').description('List all available personas (built-in + custom)').action(async () => {
  const { listPersonas } = await import('./commands/persona.js');
  console.log(await listPersonas(process.cwd()));
});
personaCmd.command('show <name>').description('Show persona prompt text').action(async (name: string) => {
  const { showPersona } = await import('./commands/persona.js');
  console.log(await showPersona(name));
});
personaCmd.command('create <name>').description('Create a custom persona template').action(async (name: string) => {
  const { createPersona } = await import('./commands/persona.js');
  console.log(await createPersona(name, process.cwd()));
});

// === Default action: quick guide ===

program.action(() => {
  const r = '\x1b[0m', b = '\x1b[1m', c = '\x1b[36m', g = '\x1b[32m', d = '\x1b[2m', y = '\x1b[33m';
  console.log(`\n  ${c}${b}CodeAgora${r} ${d}v${process.env.CODEAGORA_VERSION ?? 'dev'}${r}`);
  console.log(`  ${d}Multi-LLM collaborative code review${r}\n`);
  console.log(`  ${g}Commands:${r}`);
  console.log(`    ${b}agora init${r}              ${d}Setup (auto-detects API keys + CLI tools)${r}`);
  console.log(`    ${b}agora review${r}            ${d}Run code review${r}`);
  console.log(`    ${b}agora review --quick${r}    ${d}Fast review (L1 only)${r}`);
  console.log(`    ${b}agora review --verbose${r}  ${d}Show full issue details${r}`);
  console.log(`    ${b}agora providers${r}         ${d}Show available providers${r}`);
  console.log(`    ${b}agora doctor${r}            ${d}Check setup health${r}`);
  console.log(`    ${b}agora language${r}          ${d}Switch language (en/ko)${r}\n`);
  console.log(`  ${y}Free tier:${r} ${d}Groq + GitHub Models = unlimited free reviews${r}`);
  console.log(`  ${d}Run ${b}agora --help${r}${d} for all commands${r}\n`);
});

// Easter egg (hidden from --help)
program.command('justn', { hidden: true }).action(async () => {
  const msg = 'I MADE IT GRAHHHHHHHHH ';
  const colors = ['\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[35m'];
  const bold = '\x1b[1m', reset = '\x1b[0m';
  const end = Date.now() + 5000;
  let i = 0;
  while (Date.now() < end) {
    process.stdout.write(`${bold}${colors[i % colors.length]}${msg}${reset}`);
    i++;
    await new Promise((r) => setTimeout(r, 15));
  }
  console.log('\n');
  const y33 = `${bold}\x1b[33m`;
  console.log(`${y33}  ███╗   ███╗ █████╗ ██████╗ ███████╗    ██████╗ ██╗   ██╗     ██╗██╗   ██╗███████╗████████╗███╗   ██╗${reset}`);
  console.log(`${y33}  ████╗ ████║██╔══██╗██╔══██╗██╔════╝    ██╔══██╗╚██╗ ██╔╝     ██║██║   ██║██╔════╝╚══██╔══╝████╗  ██║${reset}`);
  console.log(`${y33}  ██╔████╔██║███████║██║  ██║█████╗      ██████╔╝ ╚████╔╝      ██║██║   ██║███████╗   ██║   ██╔██╗ ██║${reset}`);
  console.log(`${y33}  ██║╚██╔╝██║██╔══██║██║  ██║██╔══╝      ██╔══██╗  ╚██╔╝  ██   ██║██║   ██║╚════██║   ██║   ██║╚██╗██║${reset}`);
  console.log(`${y33}  ██║ ╚═╝ ██║██║  ██║██████╔╝███████╗    ██████╔╝   ██║   ╚█████╔╝╚██████╔╝███████║   ██║   ██║ ╚████║${reset}`);
  console.log(`${y33}  ╚═╝     ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝    ╚═════╝    ╚═╝    ╚════╝  ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═══╝${reset}`);
  console.log('');
});

// === Help text examples (#169) ===
addHelpExamples(program, displayName);

// Only parse argv when this file is the direct entry point (not imported by tests).
if (process.env.NODE_ENV !== 'test') {
  program.parse();
}

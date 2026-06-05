/**
 * Init Command Registration
 * Registers the `init` command with commander.
 */

import type { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { runInit, runInitInteractive, UserCancelledError, type InitResult } from './init.js';

function printInitNextSteps(result: InitResult): void {
  if (result.created.length === 0 && result.skipped.length > 0) {
    console.log('\nNext steps:');
    console.log('  1. Reuse existing config, or rerun with --force to regenerate it.');
    console.log('  2. Check setup: agora doctor');
    console.log('  3. Preflight a review: agora review --dry-run <diff.patch>');
    return;
  }

  console.log('\nNext steps:');
  console.log('  1. Check setup: agora doctor');
  console.log('  2. Preflight a review: agora review --dry-run <diff.patch>');
  console.log('  3. Run your first review: git diff | agora review');
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize CodeAgora in current project (simple 2-step setup)')
    .option('--format <format>', 'Config format (json or yaml)', 'json')
    .option('--force', 'Overwrite existing files', false)
    .option('-y, --yes', 'Skip prompts, use defaults', false)
    .option('--ci', 'also create GitHub Actions workflow', false)
    .option('--preset <name>', 'Generate config from preset: quick/free/thorough (or aliases: budget/balanced/premium)')
    .option('--advanced', 'Full wizard with provider/model/reviewer customization', false)
    .action(async (options: { format: string; force: boolean; yes: boolean; ci: boolean; preset?: string; advanced: boolean }) => {
      try {
        const format = options.format === 'yaml' ? 'yaml' : 'json';
        const isInteractive = !options.yes && process.stdin.isTTY;

        if (options.preset) {
          const result = await runInit({
            format,
            force: options.force,
            baseDir: process.cwd(),
            ci: options.ci,
            preset: options.preset,
          });
          for (const f of result.created) console.log(`  created: ${f}`);
          for (const f of result.skipped) console.log(`  skipped: ${f} (already exists, use --force to overwrite)`);
          for (const w of result.warnings) console.warn(`  warning: ${w}`);
          if (result.created.length > 0) console.log('CodeAgora initialized successfully.');
          printInitNextSteps(result);
          if (options.ci && result.created.some(f => f.includes('codeagora-review.yml'))) {
            console.log('Created: .github/workflows/codeagora-review.yml');
            console.log('  Add GROQ_API_KEY to your repository secrets:');
            console.log('  Settings -> Secrets -> Actions -> New repository secret');
          }
          return;
        }

        if (isInteractive && !options.advanced) {
          const { detectAvailableProvider, runInlineSetup } = await import('../utils/inline-setup.js');
          const existing = detectAvailableProvider();
          if (existing) {
            const { buildDefaultConfig } = await import('@codeagora/core/config/loader.js');
            const config = buildDefaultConfig(existing.name);
            const caDir = path.join(process.cwd(), '.ca');
            await fs.mkdir(caDir, { recursive: true });
            const configPath = path.join(caDir, format === 'yaml' ? 'config.yaml' : 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            console.log(`\u2713 Config created with ${existing.name} (${existing.envVar} detected)`);
            printInitNextSteps({ created: [configPath], skipped: [], warnings: [] });
            return;
          }
          await runInlineSetup(process.cwd());
          printInitNextSteps({ created: [path.join(process.cwd(), '.ca')], skipped: [], warnings: [] });
          console.log(`\nFor full customization: agora init --advanced`);
          return;
        }

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
        for (const f of result.created) console.log(`  created: ${f}`);
        for (const f of result.skipped) console.log(`  skipped: ${f} (already exists, use --force to overwrite)`);
        for (const w of result.warnings) console.warn(`  warning: ${w}`);
        if (result.created.length > 0) console.log('CodeAgora initialized successfully.');
        printInitNextSteps(result);
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
}

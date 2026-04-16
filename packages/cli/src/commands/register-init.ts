/**
 * Init Command Registration
 * Registers the `init` command with commander.
 */

import type { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { runInit, runInitInteractive, UserCancelledError } from './init.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize CodeAgora in current project (simple 2-step setup)')
    .option('--format <format>', 'Config format (json or yaml)', 'json')
    .option('--force', 'Overwrite existing files', false)
    .option('-y, --yes', 'Skip prompts, use defaults', false)
    .option('--ci', 'also create GitHub Actions workflow', false)
    .option('--advanced', 'Full wizard with provider/model/reviewer customization', false)
    .action(async (options: { format: string; force: boolean; yes: boolean; ci: boolean; advanced: boolean }) => {
      try {
        const format = options.format === 'yaml' ? 'yaml' : 'json';
        const isInteractive = !options.yes && process.stdin.isTTY;

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
            console.log(`\nRun your first review:`);
            console.log(`  git diff | agora review`);
            return;
          }
          await runInlineSetup(process.cwd());
          console.log(`\nRun your first review:`);
          console.log(`  git diff | agora review`);
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

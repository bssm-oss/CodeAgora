import type { Command } from 'commander';
import {
  formatResearchExperimentsMarkdown,
  getResearchExperiments,
} from '@codeagora/core/research/experiments.js';

export function registerResearchCommand(program: Command): void {
  const research = program.command('research').description('Inspect research backlog experiment plans');

  research
    .command('plan')
    .description('Print small proof plans for research backlog issues')
    .option('--json', 'Output machine-readable JSON')
    .action((options: { json?: boolean }) => {
      const experiments = getResearchExperiments();
      console.log(options.json
        ? JSON.stringify({ schemaVersion: 'codeagora.research.experiments.v1', experiments }, null, 2)
        : formatResearchExperimentsMarkdown(experiments));
    });
}

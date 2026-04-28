import type { Command } from 'commander';
import path from 'path';
import {
  formatBenchmarkMetricsMarkdown,
  generateBenchmarkMetricsReport,
  writeBenchmarkMetricsArtifacts,
} from '@codeagora/core/metrics/benchmark.js';

export function registerMetricsCommand(program: Command): void {
  const metricsCmd = program.command('metrics').description('Generate local metrics reports');

  metricsCmd
    .command('benchmark')
    .description('Generate quality/cost metrics from a benchmark result directory')
    .requiredOption('--results <dir>', 'Benchmark result directory')
    .option('--fixtures <dir>', 'Golden-bug fixture directory')
    .option('--out <dir>', 'Write benchmark-metrics.json and benchmark-metrics.md')
    .option('--json', 'Print JSON instead of Markdown')
    .action(async (opts: { results: string; fixtures?: string; out?: string; json?: boolean }) => {
      try {
        const report = await generateBenchmarkMetricsReport({
          resultsDir: opts.results,
          fixturesDir: opts.fixtures,
          repoRoot: process.cwd(),
        });
        if (opts.out) {
          const artifacts = await writeBenchmarkMetricsArtifacts(report, path.resolve(opts.out));
          console.error(`Wrote ${artifacts.jsonPath}`);
          console.error(`Wrote ${artifacts.markdownPath}`);
        }
        console.log(opts.json ? JSON.stringify(report, null, 2) : formatBenchmarkMetricsMarkdown(report));
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

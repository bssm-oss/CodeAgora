import fs from 'fs/promises';
import path from 'path';
import { GoldenBugFixtureSchema, type GoldenBugFixture } from '@codeagora/shared/types/golden-bug.js';
import { redactDeep, redactSecrets } from '@codeagora/shared/utils/redaction.js';
import {
  aggregate,
  scoreCase,
  type ActualFinding,
  type AggregateReport,
} from '@codeagora/shared/utils/golden-bug-scorer.js';

export interface BenchmarkRuntimeSummary {
  fixtures: number;
  ok: number;
  errors: number;
  durationMs: number;
  knownCostUsd: number;
  hasUnknownCost: boolean;
  totalTokens: number;
}

export interface BenchmarkMetricsReport {
  schemaVersion: 'codeagora.metrics.benchmark.v1';
  generatedAt: string;
  resultsDir: string;
  fixturesDir: string;
  score: AggregateReport;
  runtime: BenchmarkRuntimeSummary | null;
}

export interface BenchmarkMetricsOptions {
  resultsDir: string;
  repoRoot?: string;
  fixturesDir?: string;
  generatedAt?: string;
}

interface SummaryMetadata {
  totals?: Partial<BenchmarkRuntimeSummary>;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function loadFixtures(fixturesDir: string): Promise<GoldenBugFixture[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const fixtures: GoldenBugFixture[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const expectedPath = path.join(fixturesDir, entry.name, 'expected.json');
    const parsed = GoldenBugFixtureSchema.safeParse(await readJson(expectedPath));
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`fixture ${entry.name}: schema error: ${msg}`);
    }
    fixtures.push(parsed.data);
  }
  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadActualFindings(resultsDir: string, fixtureId: string): Promise<ActualFinding[]> {
  const resultsPath = path.join(resultsDir, `${fixtureId}.json`);
  try {
    const parsed = await readJson(resultsPath);
    if (!Array.isArray(parsed)) throw new Error(`expected JSON array`);
    return parsed as ActualFinding[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`results for ${fixtureId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function loadRuntimeSummary(resultsDir: string): Promise<BenchmarkRuntimeSummary | null> {
  try {
    const parsed = await readJson(path.join(resultsDir, '_meta', 'summary.json')) as SummaryMetadata;
    const totals = parsed.totals;
    if (!totals) return null;
    return {
      fixtures: Number(totals.fixtures ?? 0),
      ok: Number(totals.ok ?? 0),
      errors: Number(totals.errors ?? 0),
      durationMs: Number(totals.durationMs ?? 0),
      knownCostUsd: Number(totals.knownCostUsd ?? 0),
      hasUnknownCost: Boolean(totals.hasUnknownCost),
      totalTokens: Number(totals.totalTokens ?? 0),
    };
  } catch {
    return null;
  }
}

export async function generateBenchmarkMetricsReport(
  options: BenchmarkMetricsOptions,
): Promise<BenchmarkMetricsReport> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const resultsDir = path.resolve(repoRoot, options.resultsDir);
  const fixturesDir = options.fixturesDir
    ? path.resolve(repoRoot, options.fixturesDir)
    : path.join(repoRoot, 'benchmarks', 'golden-bugs');
  const fixtures = await loadFixtures(fixturesDir);
  const scored = [];
  for (const fixture of fixtures) {
    scored.push(scoreCase(fixture, await loadActualFindings(resultsDir, fixture.id)));
  }

  return {
    schemaVersion: 'codeagora.metrics.benchmark.v1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    resultsDir,
    fixturesDir,
    score: aggregate(scored),
    runtime: await loadRuntimeSummary(resultsDir),
  };
}

function pct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatBenchmarkMetricsMarkdown(report: BenchmarkMetricsReport): string {
  const m = report.score.metrics;
  const lines: string[] = [];
  lines.push('# Benchmark Metrics');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Results: ${report.resultsDir}`);
  lines.push('');
  lines.push('| Metric | Result |');
  lines.push('|---|---:|');
  lines.push(`| Fixtures | ${report.score.totalCases} |`);
  lines.push(`| Recall / FP-regression | ${report.score.recallCases} / ${report.score.fpRegressionCases} |`);
  lines.push(`| TP / FP / FN | ${m.truePositives} / ${m.falsePositives} / ${m.falseNegatives} |`);
  lines.push(`| Precision | ${pct(m.precision)} |`);
  lines.push(`| Recall | ${pct(m.recall)} |`);
  lines.push(`| F1 | ${pct(m.f1)} |`);
  lines.push(`| FP clean-rate | ${pct(m.fpCleanRate)} |`);
  lines.push(`| Mean recall@3 / @5 / @10 | ${pct(report.score.meanRecallAtK[3])} / ${pct(report.score.meanRecallAtK[5])} / ${pct(report.score.meanRecallAtK[10])} |`);
  lines.push(`| FP regressions triggered | ${report.score.fpRegressionsTriggered} / ${report.score.fpRegressionCases} |`);
  if (report.runtime) {
    lines.push(`| Duration | ${report.runtime.durationMs}ms |`);
    lines.push(`| Tokens | ${report.runtime.totalTokens} |`);
    lines.push(`| Known cost | $${report.runtime.knownCostUsd.toFixed(4)} |`);
  }
  lines.push('');
  lines.push('## Per Fixture');
  lines.push('');
  lines.push('| Fixture | Type | TP / FP / FN | Recall@3 |');
  lines.push('|---|---|---:|---:|');
  for (const item of report.score.perCase) {
    const type = item.isFpRegression ? 'fp-regression' : 'recall';
    lines.push(`| ${item.fixtureId} | ${type} | ${item.metrics.truePositives} / ${item.metrics.falsePositives} / ${item.metrics.falseNegatives} | ${pct(item.recallAtK[3])} |`);
  }
  return lines.join('\n');
}

export async function writeBenchmarkMetricsArtifacts(
  report: BenchmarkMetricsReport,
  outDir: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'benchmark-metrics.json');
  const markdownPath = path.join(outDir, 'benchmark-metrics.md');
  await fs.writeFile(jsonPath, JSON.stringify(redactDeep(report), null, 2) + '\n', 'utf-8');
  await fs.writeFile(markdownPath, redactSecrets(formatBenchmarkMetricsMarkdown(report)) + '\n', 'utf-8');
  return { jsonPath, markdownPath };
}

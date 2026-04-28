#!/usr/bin/env -S tsx
// Compare two golden-bug benchmark result directories.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { GoldenBugFixtureSchema, type GoldenBugFixture } from '../packages/shared/src/types/golden-bug.js';
import {
  aggregate,
  scoreCase,
  type ActualFinding,
  type AggregateReport,
} from '../packages/shared/src/utils/golden-bug-scorer.js';
import {
  compareGoldenBugReports,
  type BenchmarkSummaryMetadata,
  type GoldenBugComparison,
} from '../packages/shared/src/utils/golden-bug-compare.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'benchmarks', 'golden-bugs');

interface Args {
  baselineDir: string | null;
  candidateDir: string | null;
  json: boolean;
  markdownPath: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { baselineDir: null, candidateDir: null, json: false, markdownPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline' || a === '--base') args.baselineDir = argv[++i] ?? null;
    else if (a === '--candidate') args.candidateDir = argv[++i] ?? null;
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdownPath = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm bench:fn:compare -- --baseline <skip-head-results> --candidate <l3-results> [--json] [--markdown <file>]',
      );
      process.exit(0);
    }
  }
  return args;
}

async function loadFixtures(): Promise<GoldenBugFixture[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const fixtures: GoldenBugFixture[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(fixturesDir, entry.name);
    await stat(path.join(dir, 'diff.patch'));
    const raw = await readFile(path.join(dir, 'expected.json'), 'utf8');
    const parsed = GoldenBugFixtureSchema.parse(JSON.parse(raw));
    if (parsed.id !== entry.name) {
      throw new Error(`fixture ${entry.name}: id "${parsed.id}" does not match directory name`);
    }
    fixtures.push(parsed);
  }
  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadResultsFor(fixtureId: string, resultsDir: string): Promise<ActualFinding[]> {
  const raw = await readFile(path.join(resultsDir, `${fixtureId}.json`), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`results for ${fixtureId}: expected JSON array`);
  }
  return parsed;
}

async function scoreResults(fixtures: GoldenBugFixture[], resultsDir: string): Promise<AggregateReport> {
  const cases = [];
  for (const fixture of fixtures) {
    cases.push(scoreCase(fixture, await loadResultsFor(fixture.id, resultsDir)));
  }
  return aggregate(cases);
}

async function loadSummary(resultsDir: string): Promise<BenchmarkSummaryMetadata | undefined> {
  try {
    const raw = await readFile(path.join(resultsDir, '_meta', 'summary.json'), 'utf8');
    return JSON.parse(raw) as BenchmarkSummaryMetadata;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  return `${(x * 100).toFixed(1)}%`;
}

function signed(n: number | null | undefined, suffix = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a';
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${n}${suffix}`;
}

function metricLine(label: string, baseline: string, candidate: string, delta: string): string {
  return `${label.padEnd(16)} ${baseline.padStart(10)} -> ${candidate.padStart(10)} (${delta})`;
}

function humanReport(comparison: GoldenBugComparison): string {
  const b = comparison.baseline.metrics;
  const c = comparison.candidate.metrics;
  const d = comparison.deltas;
  const lines: string[] = [];
  lines.push('');
  lines.push('== Golden-bug L3 comparison ==');
  lines.push('');
  lines.push(metricLine('TP/FP/FN', `${b.truePositives}/${b.falsePositives}/${b.falseNegatives}`, `${c.truePositives}/${c.falsePositives}/${c.falseNegatives}`, `${signed(d.truePositives)}/${signed(d.falsePositives)}/${signed(d.falseNegatives)}`));
  lines.push(metricLine('Actual', String(b.actualFindings), String(c.actualFindings), signed(d.actualFindings)));
  lines.push(metricLine('Precision', pct(b.precision), pct(c.precision), pct(d.precision)));
  lines.push(metricLine('Recall', pct(b.recall), pct(c.recall), pct(d.recall)));
  lines.push(metricLine('F1', pct(b.f1), pct(c.f1), pct(d.f1)));
  lines.push(metricLine('FP clean-rate', pct(b.fpCleanRate), pct(c.fpCleanRate), pct(d.fpCleanRate)));
  if (d.durationMs !== undefined) {
    lines.push(metricLine('Duration ms', 'metadata', 'metadata', signed(d.durationMs, 'ms')));
  }
  if (d.totalTokens !== undefined) {
    lines.push(metricLine('Tokens', 'metadata', 'metadata', signed(d.totalTokens)));
  }
  if (d.knownCostUsd !== undefined) {
    lines.push(metricLine('Known cost', 'metadata', 'metadata', signed(d.knownCostUsd, ' USD')));
  }
  lines.push('');
  lines.push(`Verdict flips: ${comparison.verdicts.flips}/${comparison.verdicts.compared}`);
  lines.push(`False accepts: ${comparison.verdicts.falseAccepts}`);
  lines.push(`False rejects: ${comparison.verdicts.falseRejects}`);
  lines.push('');
  lines.push('Per-fixture:');
  for (const f of comparison.perFixture) {
    const verdict = f.baselineDecision || f.candidateDecision
      ? ` verdict=${f.baselineDecision ?? 'n/a'}->${f.candidateDecision ?? 'n/a'}`
      : '';
    const flags = [
      f.verdictFlip ? 'flip' : '',
      f.falseAccept ? 'false-accept' : '',
      f.falseReject ? 'false-reject' : '',
    ].filter(Boolean);
    lines.push(
      `  ${f.fixtureId.padEnd(32)} base ${f.baseline.truePositives}/${f.baseline.falsePositives}/${f.baseline.falseNegatives} -> cand ${f.candidate.truePositives}/${f.candidate.falsePositives}/${f.candidate.falseNegatives}${verdict}${flags.length ? ` [${flags.join(', ')}]` : ''}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function markdownReport(comparison: GoldenBugComparison): string {
  const b = comparison.baseline.metrics;
  const c = comparison.candidate.metrics;
  const d = comparison.deltas;
  const lines: string[] = [];
  lines.push('# Golden-Bug L3 Comparison');
  lines.push('');
  lines.push('| Metric | Baseline | Candidate | Delta |');
  lines.push('|---|---:|---:|---:|');
  lines.push(`| TP / FP / FN | ${b.truePositives} / ${b.falsePositives} / ${b.falseNegatives} | ${c.truePositives} / ${c.falsePositives} / ${c.falseNegatives} | ${signed(d.truePositives)} / ${signed(d.falsePositives)} / ${signed(d.falseNegatives)} |`);
  lines.push(`| Actual findings | ${b.actualFindings} | ${c.actualFindings} | ${signed(d.actualFindings)} |`);
  lines.push(`| Precision | ${pct(b.precision)} | ${pct(c.precision)} | ${pct(d.precision)} |`);
  lines.push(`| Recall | ${pct(b.recall)} | ${pct(c.recall)} | ${pct(d.recall)} |`);
  lines.push(`| F1 | ${pct(b.f1)} | ${pct(c.f1)} | ${pct(d.f1)} |`);
  lines.push(`| FP clean-rate | ${pct(b.fpCleanRate)} | ${pct(c.fpCleanRate)} | ${pct(d.fpCleanRate)} |`);
  if (d.durationMs !== undefined) lines.push(`| Duration | metadata | metadata | ${signed(d.durationMs, 'ms')} |`);
  if (d.totalTokens !== undefined) lines.push(`| Tokens | metadata | metadata | ${signed(d.totalTokens)} |`);
  if (d.knownCostUsd !== undefined) lines.push(`| Known cost | metadata | metadata | ${signed(d.knownCostUsd, ' USD')} |`);
  lines.push('');
  lines.push('| Verdict metric | Count |');
  lines.push('|---|---:|');
  lines.push(`| Compared verdicts | ${comparison.verdicts.compared} |`);
  lines.push(`| Verdict flips | ${comparison.verdicts.flips} |`);
  lines.push(`| False accepts | ${comparison.verdicts.falseAccepts} |`);
  lines.push(`| False rejects | ${comparison.verdicts.falseRejects} |`);
  lines.push('');
  lines.push('| Fixture | Baseline TP/FP/FN | Candidate TP/FP/FN | Verdict | Flags |');
  lines.push('|---|---:|---:|---|---|');
  for (const f of comparison.perFixture) {
    const flags = [
      f.verdictFlip ? 'flip' : '',
      f.falseAccept ? 'false-accept' : '',
      f.falseReject ? 'false-reject' : '',
    ].filter(Boolean).join(', ');
    lines.push(`| ${f.fixtureId} | ${f.baseline.truePositives}/${f.baseline.falsePositives}/${f.baseline.falseNegatives} | ${f.candidate.truePositives}/${f.candidate.falsePositives}/${f.candidate.falseNegatives} | ${f.baselineDecision ?? 'n/a'} -> ${f.candidateDecision ?? 'n/a'} | ${flags || '-'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baselineDir || !args.candidateDir) {
    console.error('bench-fn-compare: --baseline <dir> and --candidate <dir> are required');
    process.exit(2);
  }
  const baselineDir = path.resolve(process.cwd(), args.baselineDir);
  const candidateDir = path.resolve(process.cwd(), args.candidateDir);
  const fixtures = await loadFixtures();
  const comparison = compareGoldenBugReports(
    await scoreResults(fixtures, baselineDir),
    await scoreResults(fixtures, candidateDir),
    {
      baselineSummary: await loadSummary(baselineDir),
      candidateSummary: await loadSummary(candidateDir),
    },
  );

  if (args.markdownPath) {
    await writeFile(path.resolve(process.cwd(), args.markdownPath), markdownReport(comparison));
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(comparison, null, 2) + '\n');
    return;
  }

  process.stdout.write(humanReport(comparison));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bench-fn-compare: ${msg}`);
  process.exit(2);
});

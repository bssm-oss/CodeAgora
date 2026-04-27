#!/usr/bin/env -S tsx
// Golden-bug FN benchmark runner (#472).
//
// Loads fixtures from benchmarks/golden-bugs/ and scores them against
// precomputed review results.
//
// Usage:
//   tsx scripts/bench-fn.ts --validate-only
//       Load every fixture. Exit non-zero on any schema error.
//
//   tsx scripts/bench-fn.ts --results <dir>
//       Score fixtures against pre-generated review results. Each file
//       in <dir> must be named `<fixture-id>.json` and contain an array
//       of ActualFinding objects.
//
//   tsx scripts/bench-fn.ts --results <dir> --json
//       Same as above but emits a single JSON report on stdout.
//
// This runner does NOT invoke the CodeAgora pipeline. Driving the live
// pipeline requires API keys and takes minutes per fixture — Phase 2 of
// #472 will add a pipeline-driver that emits into --results.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { GoldenBugFixtureSchema, type GoldenBugFixture } from '../packages/shared/src/types/golden-bug.js';
import {
  scoreCase,
  aggregate,
  type ActualFinding,
  type AggregateReport,
} from '../packages/shared/src/utils/golden-bug-scorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'benchmarks', 'golden-bugs');

interface Args {
  validateOnly: boolean;
  resultsDir: string | null;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { validateOnly: false, resultsDir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--validate-only') args.validateOnly = true;
    else if (a === '--json') args.json = true;
    else if (a === '--results') args.resultsDir = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/bench-fn.ts [--validate-only] [--results <dir>] [--json]');
      process.exit(0);
    }
  }
  return args;
}

async function loadFixtures(): Promise<{ fixture: GoldenBugFixture; dir: string }[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const fixtures: { fixture: GoldenBugFixture; dir: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(fixturesDir, entry.name);
    const expectedPath = path.join(dir, 'expected.json');
    const diffPath = path.join(dir, 'diff.patch');
    try {
      await stat(diffPath);
    } catch {
      throw new Error(`fixture ${entry.name}: missing diff.patch`);
    }
    const raw = await readFile(expectedPath, 'utf8');
    const json = JSON.parse(raw);
    const parsed = GoldenBugFixtureSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`fixture ${entry.name}: schema error — ${msg}`);
    }
    if (parsed.data.id !== entry.name) {
      throw new Error(`fixture ${entry.name}: id "${parsed.data.id}" does not match directory name`);
    }
    fixtures.push({ fixture: parsed.data, dir });
  }
  fixtures.sort((a, b) => a.fixture.id.localeCompare(b.fixture.id));
  return fixtures;
}

async function loadResultsFor(fixtureId: string, resultsDir: string): Promise<ActualFinding[] | null> {
  const resultsPath = path.join(resultsDir, `${fixtureId}.json`);
  try {
    const raw = await readFile(resultsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`results for ${fixtureId}: expected JSON array`);
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '  n/a';
  return `${(x * 100).toFixed(1).padStart(4)}%`;
}

function printHumanReport(report: AggregateReport, opts: { hadAnyResults: boolean }): void {
  console.log('\n== Golden-bug benchmark ==\n');
  console.log(
    `total: ${report.totalCases} | recall: ${report.recallCases} | fp-regression: ${report.fpRegressionCases}`,
  );
  if (opts.hadAnyResults) {
    console.log(
      `mean recall@3: ${pct(report.meanRecallAtK[3])}  @5: ${pct(report.meanRecallAtK[5])}  @10: ${pct(report.meanRecallAtK[10])}`,
    );
    console.log(
      `TP: ${report.metrics.truePositives}  FP: ${report.metrics.falsePositives}  FN: ${report.metrics.falseNegatives}  actual: ${report.metrics.actualFindings}  expected: ${report.metrics.expectedFindings}`,
    );
    console.log(
      `precision: ${pct(report.metrics.precision)}  recall: ${pct(report.metrics.recall)}  F1: ${pct(report.metrics.f1)}  FP clean-rate: ${pct(report.metrics.fpCleanRate)}`,
    );
    console.log(`FP regressions triggered: ${report.fpRegressionsTriggered}/${report.fpRegressionCases}`);
  } else {
    console.log('no --results supplied — fixture validation only');
  }
  console.log('\nper-fixture:');
  for (const r of report.perCase) {
    if (r.isFpRegression) {
      const status = r.falsePositives.length === 0 ? 'PASS' : `FAIL (${r.falsePositives.length} FPs)`;
      console.log(`  [fp ] ${r.fixtureId.padEnd(32)} ${status}`);
    } else {
      const hits = r.matched.length;
      const total = r.matched.length + r.missed.length;
      console.log(
        `  [rec] ${r.fixtureId.padEnd(32)} ${hits}/${total}  fp=${r.metrics.falsePositives}  r@3=${pct(r.recallAtK[3])} r@5=${pct(r.recallAtK[5])} r@10=${pct(r.recallAtK[10])}`,
      );
    }
  }
  console.log();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = await loadFixtures();

  if (args.validateOnly) {
    console.log(`OK: ${fixtures.length} fixture(s) validated`);
    for (const { fixture } of fixtures) {
      console.log(`  - ${fixture.id} (${fixture.category})`);
    }
    return;
  }

  const hadResultsDir = Boolean(args.resultsDir);
  const results = [];
  for (const { fixture } of fixtures) {
    let actual: ActualFinding[] = [];
    if (hadResultsDir && args.resultsDir) {
      const loaded = await loadResultsFor(fixture.id, args.resultsDir);
      if (loaded !== null) actual = loaded;
    }
    results.push(scoreCase(fixture, actual));
  }

  const report = aggregate(results);

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  printHumanReport(report, { hadAnyResults: hadResultsDir });
  if (report.fpRegressionsTriggered > 0) process.exit(1);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bench-fn: ${msg}`);
  process.exit(2);
});

#!/usr/bin/env -S tsx
// Read-only benchmark reference checker for Phase 2 #478.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { z } from 'zod';

import { GoldenBugFixtureSchema, type GoldenBugFixture } from '../packages/shared/src/types/golden-bug.js';
import {
  aggregate,
  scoreCase,
  type ActualFinding,
} from '../packages/shared/src/utils/golden-bug-scorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'benchmarks', 'golden-bugs');
const defaultReferencePath = path.join(repoRoot, 'benchmarks', 'references', 'phase2-quality-gate.json');

const ReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  fixtureSet: z.string().min(1),
  fixtures: z.array(z.string().min(1)).min(1),
  thresholds: z.object({
    minPrecision: z.number().min(0).max(1),
    minRecall: z.number().min(0).max(1),
    minF1: z.number().min(0).max(1),
    minFpCleanRate: z.number().min(0).max(1),
    maxFalsePositives: z.number().int().min(0),
    maxFalseNegatives: z.number().int().min(0),
  }),
  notes: z.string().optional(),
});

type Reference = z.infer<typeof ReferenceSchema>;

interface Args {
  referencePath: string;
  resultsDir: string | null;
  validateOnly: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    referencePath: defaultReferencePath,
    resultsDir: null,
    validateOnly: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--reference') args.referencePath = path.resolve(argv[++i] ?? '');
    else if (arg === '--results') args.resultsDir = path.resolve(argv[++i] ?? '');
    else if (arg === '--validate-only') args.validateOnly = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm bench:reference -- [--validate-only] [--results <dir>] [--reference <file>] [--json]');
      process.exit(0);
    }
  }
  return args;
}

async function loadReference(referencePath: string): Promise<Reference> {
  const parsed = ReferenceSchema.safeParse(JSON.parse(await readFile(referencePath, 'utf8')));
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`reference schema error: ${msg}`);
  }
  return parsed.data;
}

async function loadFixtures(): Promise<Map<string, GoldenBugFixture>> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const fixtures = new Map<string, GoldenBugFixture>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const expectedPath = path.join(fixturesDir, entry.name, 'expected.json');
    const parsed = GoldenBugFixtureSchema.safeParse(JSON.parse(await readFile(expectedPath, 'utf8')));
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`fixture ${entry.name}: schema error: ${msg}`);
    }
    fixtures.set(entry.name, parsed.data);
  }
  return fixtures;
}

function validateReferenceFixtureSet(reference: Reference, fixtures: Map<string, GoldenBugFixture>): void {
  const missing = reference.fixtures.filter((id) => !fixtures.has(id));
  if (missing.length > 0) {
    throw new Error(`reference ${reference.id}: missing fixture(s): ${missing.join(', ')}`);
  }
  const duplicates = reference.fixtures.filter((id, index) => reference.fixtures.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`reference ${reference.id}: duplicate fixture(s): ${Array.from(new Set(duplicates)).join(', ')}`);
  }
}

async function loadResultsFor(fixtureId: string, resultsDir: string): Promise<ActualFinding[]> {
  const resultsPath = path.join(resultsDir, `${fixtureId}.json`);
  try {
    await stat(resultsPath);
  } catch {
    throw new Error(`missing result file for reference fixture: ${fixtureId}`);
  }
  const parsed = JSON.parse(await readFile(resultsPath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`results for ${fixtureId}: expected JSON array`);
  return parsed;
}

function pct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function passesThresholds(reference: Reference, metrics: ReturnType<typeof aggregate>['metrics']): string[] {
  const failures: string[] = [];
  const thresholds = reference.thresholds;
  if ((metrics.precision ?? 0) < thresholds.minPrecision) failures.push(`precision ${pct(metrics.precision)} < ${pct(thresholds.minPrecision)}`);
  if ((metrics.recall ?? 0) < thresholds.minRecall) failures.push(`recall ${pct(metrics.recall)} < ${pct(thresholds.minRecall)}`);
  if ((metrics.f1 ?? 0) < thresholds.minF1) failures.push(`F1 ${pct(metrics.f1)} < ${pct(thresholds.minF1)}`);
  if ((metrics.fpCleanRate ?? 0) < thresholds.minFpCleanRate) failures.push(`FP clean-rate ${pct(metrics.fpCleanRate)} < ${pct(thresholds.minFpCleanRate)}`);
  if (metrics.falsePositives > thresholds.maxFalsePositives) failures.push(`FP ${metrics.falsePositives} > ${thresholds.maxFalsePositives}`);
  if (metrics.falseNegatives > thresholds.maxFalseNegatives) failures.push(`FN ${metrics.falseNegatives} > ${thresholds.maxFalseNegatives}`);
  return failures;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reference = await loadReference(args.referencePath);
  const fixtures = await loadFixtures();
  validateReferenceFixtureSet(reference, fixtures);

  if (args.validateOnly || !args.resultsDir) {
    const recall = reference.fixtures.filter((id) => fixtures.get(id)!.expectedFindings.length > 0).length;
    const fp = reference.fixtures.length - recall;
    console.log(`OK: reference ${reference.id} validates ${reference.fixtures.length} fixture(s) (${recall} recall, ${fp} fp-regression)`);
    return;
  }

  const scored = [];
  for (const fixtureId of reference.fixtures) {
    scored.push(scoreCase(fixtures.get(fixtureId)!, await loadResultsFor(fixtureId, args.resultsDir)));
  }
  const report = aggregate(scored);
  const failures = passesThresholds(reference, report.metrics);

  if (args.json) {
    process.stdout.write(JSON.stringify({ reference, report, failures }, null, 2) + '\n');
  } else {
    console.log(`\n== Benchmark reference: ${reference.id} ==\n`);
    console.log(`fixtures: ${reference.fixtures.length}`);
    console.log(`TP/FP/FN: ${report.metrics.truePositives}/${report.metrics.falsePositives}/${report.metrics.falseNegatives}`);
    console.log(`precision: ${pct(report.metrics.precision)} | recall: ${pct(report.metrics.recall)} | F1: ${pct(report.metrics.f1)} | FP clean-rate: ${pct(report.metrics.fpCleanRate)}`);
    console.log(failures.length === 0 ? '\nPASS\n' : `\nFAIL:\n  - ${failures.join('\n  - ')}\n`);
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bench-reference-check: ${msg}`);
  process.exit(1);
});

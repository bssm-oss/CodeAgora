#!/usr/bin/env -S tsx
// Live-pipeline driver for the golden-bug benchmark (#472 Phase 2).
//
// For each fixture in benchmarks/golden-bugs/ this script runs the full
// CodeAgora pipeline against `diff.patch` and emits an ActualFinding[]
// JSON file at <results-dir>/<fixture-id>.json, which `pnpm bench:fn`
// then scores.
//
// Usage:
//   pnpm bench:fn:run -- --results <dir>                     # run all fixtures
//   pnpm bench:fn:run -- --results <dir> --fixtures id1,id2  # subset
//   pnpm bench:fn:run -- --results <dir> --config .ca/config.low-cost-diverse.json
//   pnpm bench:fn:run -- --results <dir> --skip-head         # skip L3 verdict
//
// Requirements:
//   - OPENROUTER_API_KEY in env (matching the default benchmark config)
//   - Run from repo root; the driver chdir's into benchmarks/ so the
//     pipeline picks up benchmarks/.ca/config.json.
//
// Cost: roughly $0.04–$0.10 per full run across the seed fixtures with
// the default cheap OpenRouter config. Scales with reviewer count and
// discussion rounds.

import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { GoldenBugFixtureSchema, type GoldenBugFixture } from '../packages/shared/src/types/golden-bug.js';
import { evidenceListToActualFindings } from '../packages/shared/src/utils/golden-bug-mapping.js';
import { runPipeline } from '../packages/core/src/pipeline/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'benchmarks', 'golden-bugs');
const benchmarkCwd = path.join(repoRoot, 'benchmarks');

interface Args {
  resultsDir: string | null;
  fixtureFilter: Set<string> | null;
  skipHead: boolean;
  dryRun: boolean;
  configPath: string | null;
}

interface RunPerformanceSummary {
  totalCalls?: number;
  totalLatencyMs?: number;
  averageLatencyMs?: number;
  totalTokens?: number;
  totalCost?: string;
}

interface FixtureRunMetadata {
  fixtureId: string;
  status: 'ok' | 'error';
  findings: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  performance?: RunPerformanceSummary;
  error?: string;
}

interface SummaryEntry {
  id: string;
  findings: number;
  status: 'ok' | 'error';
  durationMs: number;
  performance?: RunPerformanceSummary;
  error?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    resultsDir: null,
    fixtureFilter: null,
    skipHead: false,
    dryRun: false,
    configPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--results') args.resultsDir = argv[++i] ?? null;
    else if (a === '--fixtures') {
      const list = argv[++i] ?? '';
      args.fixtureFilter = new Set(list.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--skip-head') args.skipHead = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--config') args.configPath = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm bench:fn:run -- --results <dir> [--fixtures id1,id2] [--config <path>] [--skip-head] [--dry-run]',
      );
      process.exit(0);
    }
  }
  return args;
}

async function loadFixtures(filter: Set<string> | null): Promise<GoldenBugFixture[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const out: GoldenBugFixture[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (filter && !filter.has(entry.name)) continue;
    const dir = path.join(fixturesDir, entry.name);
    await stat(path.join(dir, 'diff.patch'));
    const expectedPath = path.join(dir, 'expected.json');
    let parsed: GoldenBugFixture;
    try {
      const raw = await readFile(expectedPath, 'utf8');
      parsed = GoldenBugFixtureSchema.parse(JSON.parse(raw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`fixture ${entry.name}: failed to load expected.json — ${msg}`);
    }
    if (parsed.id !== entry.name) {
      throw new Error(
        `fixture ${entry.name}: id "${parsed.id}" does not match directory name`,
      );
    }
    out.push(parsed);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function parsePerformanceSummary(text: string | undefined): RunPerformanceSummary | undefined {
  if (!text) return undefined;

  const summary: RunPerformanceSummary = {};
  const totalCalls = text.match(/- Total calls:\s*(\d+)/);
  const totalLatency = text.match(/- Total latency:\s*(\d+)ms/);
  const averageLatency = text.match(/- Average latency:\s*(\d+)ms/);
  const totalTokens = text.match(/- Total tokens:\s*(\d+)/);
  const totalCost = text.match(/- Total cost:\s*([^\n]+)/);

  if (totalCalls) summary.totalCalls = Number(totalCalls[1]);
  if (totalLatency) summary.totalLatencyMs = Number(totalLatency[1]);
  if (averageLatency) summary.averageLatencyMs = Number(averageLatency[1]);
  if (totalTokens) summary.totalTokens = Number(totalTokens[1]);
  if (totalCost) summary.totalCost = totalCost[1].trim();

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function knownCostUsd(performance: RunPerformanceSummary | undefined): number {
  const cost = performance?.totalCost;
  if (!cost?.startsWith('$')) return 0;
  const parsed = Number(cost.slice(1));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runOne(
  fixtureId: string,
  skipHead: boolean,
  configPath: string | null,
): Promise<{ findings: unknown[]; performance?: RunPerformanceSummary }> {
  const diffPath = path.join(fixturesDir, fixtureId, 'diff.patch');
  const result = await runPipeline({ diffPath, skipHead, configPath: configPath ?? undefined });
  if (result.status !== 'success') {
    throw new Error(`pipeline error for ${fixtureId}: ${result.error ?? 'unknown'}`);
  }
  const docs = result.evidenceDocs ?? [];
  return {
    findings: evidenceListToActualFindings(docs),
    performance: parsePerformanceSummary(result.performanceText),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.resultsDir) {
    console.error('bench-fn-run: --results <dir> is required');
    process.exit(2);
  }

  const fixtures = await loadFixtures(args.fixtureFilter);
  if (fixtures.length === 0) {
    console.error('bench-fn-run: no fixtures matched');
    process.exit(2);
  }

  const resultsDir = path.resolve(process.cwd(), args.resultsDir);
  const configPath = args.configPath
    ? path.resolve(process.cwd(), args.configPath)
    : null;
  await mkdir(resultsDir, { recursive: true });
  const metadataDir = path.join(resultsDir, '_meta');
  await mkdir(metadataDir, { recursive: true });

  if (args.dryRun) {
    console.log(`[dry-run] would run ${fixtures.length} fixture(s):`);
    console.log(`  config: ${configPath ?? path.join(benchmarkCwd, '.ca', 'config.json')}`);
    console.log(`  metadata: ${metadataDir}`);
    for (const f of fixtures) console.log(`  - ${f.id} → ${path.join(resultsDir, `${f.id}.json`)}`);
    return;
  }

  // Pipeline reads config from process.cwd()/.ca/config.json — chdir into
  // benchmarks/ so the committed benchmark config is picked up regardless
  // of where the caller invoked the script from.
  const originalCwd = process.cwd();
  process.chdir(benchmarkCwd);

  const summary: SummaryEntry[] = [];
  try {
    for (const fixture of fixtures) {
      process.stderr.write(`[${fixture.id}] running... `);
      const started = Date.now();
      const startedAt = new Date(started).toISOString();
      try {
        const run = await runOne(fixture.id, args.skipHead, configPath);
        const durationMs = Date.now() - started;
        const outPath = path.join(resultsDir, `${fixture.id}.json`);
        await writeFile(outPath, JSON.stringify(run.findings, null, 2) + '\n');
        const metadata: FixtureRunMetadata = {
          fixtureId: fixture.id,
          status: 'ok',
          findings: run.findings.length,
          durationMs,
          startedAt,
          completedAt: new Date().toISOString(),
          ...(run.performance ? { performance: run.performance } : {}),
        };
        await writeFile(path.join(metadataDir, `${fixture.id}.json`), JSON.stringify(metadata, null, 2) + '\n');
        summary.push({
          id: fixture.id,
          findings: run.findings.length,
          status: 'ok',
          durationMs,
          ...(run.performance ? { performance: run.performance } : {}),
        });
        const cost = run.performance?.totalCost ?? 'N/A';
        const latency = run.performance?.totalLatencyMs ?? durationMs;
        process.stderr.write(
          `ok (${run.findings.length} finding(s), ${Math.round(durationMs / 1000)}s, cost=${cost}, latency=${latency}ms)\n`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - started;
        const metadata: FixtureRunMetadata = {
          fixtureId: fixture.id,
          status: 'error',
          findings: 0,
          durationMs,
          startedAt,
          completedAt: new Date().toISOString(),
          error: msg,
        };
        await writeFile(path.join(metadataDir, `${fixture.id}.json`), JSON.stringify(metadata, null, 2) + '\n');
        summary.push({ id: fixture.id, findings: 0, status: 'error', durationMs, error: msg });
        process.stderr.write(`ERROR: ${msg}\n`);
      }
    }
  } finally {
    process.chdir(originalCwd);
  }

  console.log('\n== bench-fn-run summary ==');
  for (const s of summary) {
    if (s.status === 'ok') {
      const cost = s.performance?.totalCost ?? 'N/A';
      const latency = s.performance?.totalLatencyMs ?? s.durationMs;
      console.log(
        `  ${s.id.padEnd(32)} ok     ${s.findings} finding(s)  ${Math.round(s.durationMs / 1000)}s  cost=${cost}  latency=${latency}ms`,
      );
    }
    else console.log(`  ${s.id.padEnd(32)} ERROR  ${s.error ?? ''}`);
  }

  const failures = summary.filter((s) => s.status === 'error').length;
  const summaryMetadata = {
    generatedAt: new Date().toISOString(),
    resultsDir,
    config: configPath ?? path.join(benchmarkCwd, '.ca', 'config.json'),
    skipHead: args.skipHead,
    fixtures: summary,
    totals: {
      fixtures: summary.length,
      ok: summary.length - failures,
      errors: failures,
      durationMs: summary.reduce((sum, s) => sum + s.durationMs, 0),
      knownCostUsd: Number(summary.reduce((sum, s) => sum + knownCostUsd(s.performance), 0).toFixed(6)),
      hasUnknownCost: summary.some((s) => !s.performance?.totalCost || s.performance.totalCost === 'N/A'),
      totalTokens: summary.reduce((sum, s) => sum + (s.performance?.totalTokens ?? 0), 0),
    },
  };
  await writeFile(path.join(metadataDir, 'summary.json'), JSON.stringify(summaryMetadata, null, 2) + '\n');

  if (failures > 0) process.exit(1);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bench-fn-run: ${msg}`);
  process.exit(2);
});

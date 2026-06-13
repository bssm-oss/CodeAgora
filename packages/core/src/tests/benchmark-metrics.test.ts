import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  formatBenchmarkMetricsMarkdown,
  generateBenchmarkMetricsReport,
  writeBenchmarkMetricsArtifacts,
} from '../metrics/benchmark.js';

const rawApiKey = 'OPENAI_API_KEY=sk-test-secret';
const rawBearer = 'Authorization: Bearer test-secret';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

describe('benchmark metrics report', () => {
  it('scores benchmark results and loads runtime metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeagora-metrics-'));
    const fixturesDir = path.join(root, 'fixtures');
    const resultsDir = path.join(root, 'results');

    await writeJson(path.join(fixturesDir, 'bug-one', 'expected.json'), {
      id: 'bug-one',
      title: 'Bug one',
      source: 'test',
      category: 'hotfix',
      expectedFindings: [
        {
          filePath: 'src/app.ts',
          lineRange: [3, 3],
          minSeverity: 'CRITICAL',
          rationale: 'null bug',
          keyword: 'null',
        },
      ],
    });
    await writeFile(path.join(fixturesDir, 'bug-one', 'diff.patch'), 'diff', 'utf-8');
    await writeJson(path.join(resultsDir, 'bug-one.json'), [
      {
        issueTitle: 'Null bug',
        problem: 'A null bug is present.',
        severity: 'CRITICAL',
        filePath: 'src/app.ts',
        lineRange: [3, 3],
      },
    ]);
    await writeJson(path.join(resultsDir, '_meta', 'summary.json'), {
      totals: {
        fixtures: 1,
        ok: 1,
        errors: 0,
        durationMs: 1234,
        knownCostUsd: 0.0123,
        hasUnknownCost: false,
        totalTokens: 456,
      },
    });

    const report = await generateBenchmarkMetricsReport({
      repoRoot: root,
      resultsDir: 'results',
      fixturesDir: 'fixtures',
      generatedAt: '2026-04-28T00:00:00.000Z',
    });

    expect(report.score.metrics).toMatchObject({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      f1: 1,
    });
    expect(report.runtime?.totalTokens).toBe(456);
    expect(formatBenchmarkMetricsMarkdown(report)).toContain('| TP / FP / FN | 1 / 0 / 0 |');
  });

  it('writes JSON and Markdown artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeagora-metrics-write-'));
    const report = {
      schemaVersion: 'codeagora.metrics.benchmark.v1' as const,
      generatedAt: '2026-04-28T00:00:00.000Z',
      resultsDir: path.join(root, 'results'),
      fixturesDir: path.join(root, 'fixtures'),
      runtime: null,
      score: {
        totalCases: 0,
        recallCases: 0,
        fpRegressionCases: 0,
        meanRecallAtK: { 3: 0, 5: 0, 10: 0 },
        fpRegressionsTriggered: 0,
        metrics: {
          truePositives: 0,
          falsePositives: 0,
          falseNegatives: 0,
          actualFindings: 0,
          expectedFindings: 0,
          precision: null,
          recall: null,
          f1: null,
          fpCleanRate: null,
        },
        perCase: [],
      },
    };

    const paths = await writeBenchmarkMetricsArtifacts(report, path.join(root, 'out'));
    expect(JSON.parse(await readFile(paths.jsonPath, 'utf-8')).schemaVersion).toBe('codeagora.metrics.benchmark.v1');
    expect(await readFile(paths.markdownPath, 'utf-8')).toContain('# Benchmark Metrics');
  });

  it('redacts sensitive values before writing JSON and Markdown artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeagora-metrics-redaction-'));
    const report = {
      schemaVersion: 'codeagora.metrics.benchmark.v1' as const,
      generatedAt: '2026-04-28T00:00:00.000Z',
      resultsDir: path.join(root, rawApiKey),
      fixturesDir: path.join(root, rawBearer),
      runtime: null,
      score: {
        totalCases: 1,
        recallCases: 1,
        fpRegressionCases: 0,
        meanRecallAtK: { 3: 1, 5: 1, 10: 1 },
        fpRegressionsTriggered: 0,
        metrics: {
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          actualFindings: 1,
          expectedFindings: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          fpCleanRate: null,
        },
        perCase: [{
          fixtureId: rawApiKey,
          category: 'security',
          isFpRegression: false,
          matched: [],
          missed: [],
          falsePositives: [],
          metrics: {
            truePositives: 1,
            falsePositives: 0,
            falseNegatives: 0,
            actualFindings: 1,
            expectedFindings: 1,
          },
          recallAtK: { 3: 1, 5: 1, 10: 1 },
        }],
      },
    };

    const paths = await writeBenchmarkMetricsArtifacts(report, path.join(root, 'out'));
    const json = await readFile(paths.jsonPath, 'utf-8');
    const markdown = await readFile(paths.markdownPath, 'utf-8');
    const combined = `${json}\n${markdown}`;

    expect(combined).not.toContain('sk-test-secret');
    expect(combined).not.toContain('Bearer test-secret');
    expect(combined).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(combined).toContain('Authorization: Bearer [REDACTED]');
  });
});

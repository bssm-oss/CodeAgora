import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repoRoot = process.cwd();

const checkedFiles = [
  'action.yml',
  'packages/shared/src/data/github-actions-template.yml',
  ...fs
    .readdirSync(path.join(repoRoot, '.github', 'workflows'))
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => path.join('.github', 'workflows', file)),
];

const deprecatedNode20ActionPins = [
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'pnpm/action-setup@v4',
  'actions/github-script@v7',
  'actions/upload-artifact@v4',
  'softprops/action-gh-release@v2',
];

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

describe('GitHub Actions runtime readiness', () => {
  it('does not pin workflows or generated templates to Node 20 JavaScript action majors', () => {
    for (const file of checkedFiles) {
      const content = readText(file);
      for (const pin of deprecatedNode20ActionPins) {
        expect(content, `${file} should not contain deprecated action pin ${pin}`).not.toContain(pin);
      }
    }
  });

  it('wires optional Code Scanning upload to the generated SARIF path', () => {
    const action = readText('action.yml');
    const template = readText('packages/shared/src/data/github-actions-template.yml');
    const docs = readText('docs/for-users/5_GITHUB_INTEGRATION.md');

    expect(action).toContain('upload-sarif:');
    expect(action).toContain('sarif-file:');
    expect(action).toContain('uses: github/codeql-action/upload-sarif@v4');
    expect(action).toContain("inputs.upload-sarif == 'true' && steps.review.outputs.sarif-file != '' && steps.review.outputs.degraded != 'true'");
    expect(action).toContain('id: upload-codeagora-sarif');
    expect(action).toContain('continue-on-error: true');
    expect(action).toContain('sarif_file: ${{ steps.review.outputs.sarif-file }}');
    expect(action).toContain('uses: actions/upload-artifact@v7');
    expect(action).toContain("steps.review.outputs.degraded != 'true' && (inputs.upload-sarif != 'true' || steps.upload-codeagora-sarif.outcome == 'failure')");
    expect(action).toContain('path: ${{ steps.review.outputs.sarif-file }}');
    expect(action).toContain('if-no-files-found: error');
    expect(template).toContain('security-events: write');
    expect(template).toContain("upload-sarif: 'true'");
    expect(docs).toContain("upload-sarif: 'true'");
    expect(docs).toContain('`sarif-file` output');
    expect(docs).toContain('github/codeql-action/upload-sarif@v4');
    expect(docs).toContain('actions/upload-artifact@v7');
    expect(docs).toContain('artifact fallback');
    expect(docs).toContain('suppressed when the review is degraded');
    expect(docs).not.toContain('uploadSarif()');
    expect(docs).not.toContain('POST /code-scanning/sarifs');
  });

  it('passes fork metadata to the runtime policy and suppresses degraded SARIF publication', () => {
    const action = readText('action.yml');

    expect(action).toContain('--base-repo "$BASE_REPO"');
    expect(action).toContain('--head-repo "$HEAD_REPO"');
    expect(action).toContain('BASE_REPO: ${{ github.event.pull_request.base.repo.full_name }}');
    expect(action).toContain('HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}');
    expect(action).toContain('steps.review.outputs.degraded != \'true\'');

    const parsed = parseYaml(action);
    const steps = parsed.runs.steps as Array<Record<string, unknown>>;
    const reviewStep = steps.find((step) => step.id === 'review');
    const sarifUploadStep = steps.find((step) => step.id === 'upload-codeagora-sarif');
    const sarifArtifactStep = steps.find((step) => step.name === 'Upload CodeAgora SARIF artifact fallback');

    expect(reviewStep).toBeDefined();
    expect(sarifUploadStep?.if).toContain("steps.review.outputs.degraded != 'true'");
    expect(sarifArtifactStep?.if).toContain("steps.review.outputs.degraded != 'true'");
  });

  it('keeps the generated Action bundle syntactically valid on Node 20', () => {
    const bundlePath = path.join(repoRoot, 'dist/action.js');
    const bundle = readText('dist/action.js');

    expect(bundle).toContain('__codeagoraCreateRequire');
    expect(bundle).not.toContain('import { createRequire } from "module"; const require = createRequire(import.meta.url);');
    execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'pipe' });
  });

  it('uses retained API providers for live PR and benchmark smoke paths', () => {
    const review = readText('.github/workflows/review.yml');
    const bench = readText('.github/workflows/bench-fn.yml');

    expect(review).not.toContain('models: read');
    expect(review).toContain('OPENROUTER_API_KEY');
    expect(review).toContain('provider=openrouter');
    expect(review).not.toContain('provider=groq');
    expect(review).toContain('qwen/qwen3-235b-a22b-2507');
    expect(review).toContain('deepseek/deepseek-v4-flash');
    expect(review).toContain('qwen/qwen3.5-9b');
    expect(review).toContain('z-ai/glm-4.7-flash');
    expect(review).toContain('openai/gpt-oss-120b');
    expect(review).toContain('moonshotai/kimi-k2.5');
    expect(review).toContain('"enabled": false');
    expect(bench).not.toContain('models: read');
    expect(bench).toContain('config.openrouter-low-cost-5x2.json');
    expect(bench).toContain('OPENROUTER_API_KEY');
    expect(bench).toContain('BENCH_DELAY_MS');
    expect(bench).toContain('--delay-ms "$BENCH_DELAY_MS"');
  });

  it('rebuilds the action bundle when the action contract changes', () => {
    const buildAction = readText('.github/workflows/build-action.yml');

    expect(buildAction).toContain("- 'action.yml'");
    expect(buildAction).toContain('scripts/build-action.mjs');
    expect(buildAction).toContain('dist/action.js');
  });
});

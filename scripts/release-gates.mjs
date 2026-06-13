export const SCHEMA_VERSION = 'codeagora.release-evidence.v1';

export const RELEASE_TIERS = ['beta', 'rc', 'stable'];

export const RELEASE_GATE_EXECUTIONS = {
  LOCAL_COMMAND: 'local-command',
  COVERED_LOCAL_COMMAND: 'covered-local-command',
  LOCAL_ARTIFACT: 'local-artifact',
  LIVE_CLI: 'live-cli',
  LIVE_PROVIDER: 'live-provider',
  LIVE_GITHUB: 'live-github',
};

export const EXPECTED_EVIDENCE = [
  { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'lint', filename: 'lint.log', command: 'pnpm lint', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'build', filename: 'build.log', command: 'pnpm build', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'test', filename: 'test.log', command: 'pnpm test --no-file-parallelism', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'cross-surface-parity', filename: 'cross-surface-parity.log', command: 'pnpm vitest run src/tests/cross-surface-parity.test.ts', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'bench-ci', filename: 'bench-ci.log', command: 'pnpm bench:ci', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'beta-smoke', filename: 'beta-smoke.log', command: 'pnpm release:beta-smoke', tier: 'beta', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'package-root-dry-run', filename: 'package-root-dry-run.log', command: 'pnpm pack --dry-run', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'package-mcp-dry-run', filename: 'package-mcp-dry-run.log', command: 'pnpm --filter @codeagora/mcp pack --dry-run', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'action-smoke', filename: 'action-smoke.log', command: 'pnpm build:action && pnpm release:beta-smoke', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'mcp-smoke', filename: 'mcp-smoke.log', command: 'covered by pnpm release:beta-smoke', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.COVERED_LOCAL_COMMAND },
  { name: 'desktop-app-e2e', filename: 'desktop-app-e2e.log', command: 'pnpm desktop:app-e2e', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'desktop-macos-webdriver-e2e', filename: 'desktop-macos-webdriver-e2e.log', command: 'pnpm desktop:macos-webdriver-e2e', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'desktop-visual-qa', filename: 'desktop-visual-qa.json', command: 'pnpm desktop:visual-qa', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'desktop-gate', filename: 'desktop-gate.log', command: 'pnpm rc:desktop-gate', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'desktop-evidence-manifest', filename: 'desktop-evidence-manifest.json', command: 'pnpm desktop:evidence', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'desktop-security-evidence', filename: 'desktop-security-evidence.json', command: 'pnpm evidence:desktop-security', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT },
  { name: 'desktop-macos-arm64-signing-evidence', filename: 'desktop-macos-arm64-signing-evidence.json', command: 'pnpm desktop:evidence after signed and notarized macOS arm64 bundle artifact', tier: 'stable', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT },
  { name: 'security-regression', filename: 'security-regression.log', command: 'pnpm test:security', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND },
  { name: 'redaction-path-safety-evidence', filename: 'redaction-path-safety-evidence.json', command: 'pnpm evidence:redaction-path-safety', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT },
  { name: 'github-security-evidence', filename: 'github-security-evidence.json', command: 'pnpm evidence:github-security', tier: 'rc', redactionStatus: 'safe-to-publish', execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT },
  { name: 'cli-live-clean-diff-smoke', filename: 'cli-live-clean-diff-smoke.json', command: 'pnpm smoke:cli-clean-diff with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-clean-diff-transcript', filename: 'cli-live-clean-diff-smoke.transcript.txt', command: 'pnpm smoke:cli-clean-diff with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-staged-diff-smoke', filename: 'cli-live-staged-diff-smoke.json', command: 'pnpm smoke:cli-staged-diff with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-staged-diff-transcript', filename: 'cli-live-staged-diff-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-staged-diff with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-patch-file-smoke', filename: 'cli-live-patch-file-smoke.json', command: 'pnpm smoke:cli-patch-file with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-patch-file-transcript', filename: 'cli-live-patch-file-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-patch-file with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-invalid-config-smoke', filename: 'cli-live-invalid-config-smoke.json', command: 'pnpm smoke:cli-invalid-config', tier: 'stable', redactionStatus: 'safe-to-publish', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI },
  { name: 'cli-live-invalid-config-transcript', filename: 'cli-live-invalid-config-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-invalid-config', tier: 'stable', redactionStatus: 'safe-to-publish', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI },
  { name: 'cli-live-missing-provider-key-smoke', filename: 'cli-live-missing-provider-key-smoke.json', command: 'pnpm smoke:cli-missing-provider-key', tier: 'stable', redactionStatus: 'safe-to-publish', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI },
  { name: 'cli-live-missing-provider-key-transcript', filename: 'cli-live-missing-provider-key-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-missing-provider-key', tier: 'stable', redactionStatus: 'safe-to-publish', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI },
  { name: 'cli-live-provider-failure-smoke', filename: 'cli-live-provider-failure-smoke.json', command: 'pnpm smoke:cli-provider-failure', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-provider-failure-transcript', filename: 'cli-live-provider-failure-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-provider-failure', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-timeout-runtime-smoke', filename: 'cli-live-timeout-runtime-smoke.json', command: 'pnpm smoke:cli-timeout-runtime with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'cli-live-timeout-runtime-transcript', filename: 'cli-live-timeout-runtime-smoke.transcript.txt', command: 'sidecar transcript from pnpm smoke:cli-timeout-runtime with provider credentials', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'live-benchmark-report', filename: 'live-benchmark-report.md', sourcePath: 'docs/archived/live-benchmark-report.md', command: 'pnpm bench:fn:run with provider secrets', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER },
  { name: 'live-github-action-pr-smoke', filename: 'live-github-action-pr-smoke.md', sourcePath: 'docs/archived/live-github-action-pr-smoke.md', command: 'pnpm evidence:github-action-pr-smoke from pull_request workflow context', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true, execution: RELEASE_GATE_EXECUTIONS.LIVE_GITHUB },
];

export function deterministicLocalReleaseGates() {
  return EXPECTED_EVIDENCE.filter((entry) => entry.execution === RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND);
}

export function deterministicLocalReleaseCommands() {
  return deterministicLocalReleaseGates().map((entry) => entry.command);
}

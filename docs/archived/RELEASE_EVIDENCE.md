# Release Evidence

This document defines the release-candidate evidence bundle. It separates
deterministic local/CI gates from live-only gates so stable claims cannot be
made from skipped provider or GitHub integration coverage.

## Evidence Manifest

Generate the manifest after capturing logs under `.sisyphus/evidence/`:

```bash
pnpm evidence:manifest -- --require=rc
```

To smoke-check the rc/staging security gate capture path before a full release
run, use:

```bash
pnpm evidence:security-smoke
```

The smoke writes an isolated rc manifest and verifies that the
`security-regression` entry includes the latest `pnpm test:security` command
evidence and exit code, that the rc manifest carries the redaction/path-safety
evidence artifact, that the rc manifest carries the desktop security evidence
artifact, and that the rc manifest carries the GitHub security evidence artifact.

Capture redaction and path-safety evidence before generating an rc/staging
manifest:

```bash
pnpm evidence:redaction-path-safety
```

The command runs focused redaction and path validation tests and writes
`.sisyphus/evidence/redaction-path-safety-evidence.json` with schema
`codeagora.redaction-path-safety-evidence.v1`. The artifact records the focused
test command, exit code, safe-to-publish output excerpts, and the checks covered
for secret redaction, persisted artifact redaction, GitHub/MCP outward response
redaction, traversal rejection, repository-root boundaries, symlink escapes,
config path safety, and GitHub Action diff/SARIF path safety.

Capture GitHub token-handling and fork-safety evidence before generating an
rc/staging manifest:

```bash
pnpm evidence:github-security
```

The command runs the focused GitHub Action policy/runtime evidence tests and
writes `.sisyphus/evidence/github-security-evidence.json` with schema
`codeagora.github-security-evidence.v1`. The artifact records the focused test
command and the token/fork checks it covers: GitHub token separation from
provider credentials, missing-token degraded behavior, least-privilege
permissions, excessive-permission rejection, privileged operation trust checks,
fork hard-stops before provider work, and fork/SHA metadata capture.

Capture Desktop-specific security evidence before generating an rc/staging
manifest:

```bash
pnpm evidence:desktop-security
```

The command runs the focused Desktop security smoke checks and writes
`.sisyphus/evidence/desktop-security-evidence.json` with schema
`codeagora.desktop-security-evidence.v1`. The artifact records the focused
Vitest and Tauri/Rust commands, exit codes, safe-to-publish output excerpts, and
the checks covered for minimal Tauri capabilities, frontend/Rust command
alignment, debug-only loopback WebDriver automation, approved external-link
opening, workspace path boundaries, redacted Desktop exports, symlink rejection,
and trusted-workspace enforcement.

The generated `.sisyphus/evidence/evidence-manifest.json` uses schema
`codeagora.release-evidence.v1` and records:

- command name and expected log filename
- required release tier (`beta`, `rc`, or `stable`)
- exit-code evidence availability through file presence
- file size and SHA-256 hash for present artifacts
- commit SHA and generation timestamp
- redaction status for each evidence artifact
- latest deterministic gate command evidence, including `pnpm test:security`
  exit status for the rc `security-regression` gate
- rc redaction and path-safety evidence for the focused redaction and
  path-validation checks
- rc Desktop security evidence for Tauri capabilities, external-link,
  WebDriver, workspace path, and export-redaction checks
- rc GitHub security evidence for token handling and fork-safety checks

When deterministic gates are executed through `scripts/release-gate-runner.mjs`,
the runner writes each gate log under `.sisyphus/evidence/` and appends a durable
`.sisyphus/evidence/gate-command-evidence.jsonl` entry using schema
`codeagora.release-gate-command-evidence.v1`. Each entry records the gate name,
command, exit code, timestamp, and log path or link so failed stable blockers
remain auditable before the manifest is generated.

Required-tier manifest generation also evaluates the latest command-evidence
entry for each required deterministic local gate using schema
`codeagora.release-gate-exit-status.v1`. The evaluator passes only when every
required deterministic gate has complete recorded evidence: matching schema
version, gate command, integer exit code, timestamp, log path or link, and an
exit code of `0`. Missing entries, incomplete records, and nonzero exit codes
block the manifest even if a log file exists.

Live GitHub Action PR smoke captures also append validated metadata to
`.sisyphus/evidence/release-evidence-metadata.jsonl` using schema
`codeagora.live-github-action-pr-smoke-metadata.v1`. The manifest attaches the
latest matching metadata entry to `live-github-action-pr-smoke`, including the
workflow run, PR, local evidence artifact paths, and Action output links such as
`review-url`, so stable review of the evidence does not depend on the Markdown
summary alone.

Use `--require=beta` only for beta evidence checks. Use `--require=rc` or
`--require=stable` for stricter promotion checks. Live artifacts are required
only for stable claims that depend on live behavior.

## Stable Evidence Filenames

| Evidence | Filename | Command | Tier |
|----------|----------|---------|------|
| Typecheck | `typecheck.log` | `pnpm typecheck` | beta |
| Lint | `lint.log` | `pnpm lint` | beta |
| Build | `build.log` | `pnpm build` | beta |
| Full deterministic tests | `test.log` | `pnpm test --no-file-parallelism` | beta |
| Cross-surface parity | `cross-surface-parity.log` | `pnpm vitest run src/tests/cross-surface-parity.test.ts` | rc |
| Deterministic benchmark gate | `bench-ci.log` | `pnpm bench:ci` | beta |
| Beta package and Action smoke | `beta-smoke.log` | `pnpm release:beta-smoke` | beta |
| Root package dry-run | `package-root-dry-run.log` | `pnpm pack --dry-run` | rc |
| MCP package dry-run | `package-mcp-dry-run.log` | `pnpm --filter @codeagora/mcp pack --dry-run` | rc |
| Action smoke bundle | `action-smoke.log` | `pnpm build:action && pnpm release:beta-smoke` | rc |
| MCP smoke | `mcp-smoke.log` | covered by `pnpm release:beta-smoke` | rc |
| Desktop gate | `desktop-gate.log` | `pnpm rc:desktop-gate` | rc |
| Desktop evidence manifest | `desktop-evidence-manifest.json` | `pnpm desktop:evidence` | rc |
| Desktop security evidence | `desktop-security-evidence.json` | `pnpm evidence:desktop-security` | rc |
| Desktop RC distribution evidence | `desktop-rc-distribution-evidence.json` | capture after signed, notarized, stapled macOS arm64 RC artifacts exist | rc |
| Desktop RC distribution gate | `desktop-rc-distribution-gate.log` | `pnpm rc:desktop-distribution-gate` | rc |
| Desktop macOS arm64 signing evidence | `desktop-macos-arm64-signing-evidence.json` | superseded by Desktop RC distribution evidence for RC distribution | stable |
| Security regression gate | `security-regression.log` | `pnpm test:security` | rc |
| Redaction and path-safety evidence | `redaction-path-safety-evidence.json` | `pnpm evidence:redaction-path-safety` | rc |
| GitHub security evidence | `github-security-evidence.json` | `pnpm evidence:github-security` | rc |
| CLI live clean-diff smoke | `cli-live-clean-diff-smoke.json` | `pnpm smoke:cli-clean-diff` with provider credentials | stable |
| CLI live clean-diff transcript | `cli-live-clean-diff-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-clean-diff` with provider credentials | stable |
| CLI live staged-diff smoke | `cli-live-staged-diff-smoke.json` | `pnpm smoke:cli-staged-diff` with provider credentials | stable |
| CLI live staged-diff transcript | `cli-live-staged-diff-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-staged-diff` with provider credentials | stable |
| CLI live patch-file smoke | `cli-live-patch-file-smoke.json` | `pnpm smoke:cli-patch-file` with provider credentials | stable |
| CLI live patch-file transcript | `cli-live-patch-file-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-patch-file` with provider credentials | stable |
| CLI live invalid-config smoke | `cli-live-invalid-config-smoke.json` | `pnpm smoke:cli-invalid-config` | stable |
| CLI live invalid-config transcript | `cli-live-invalid-config-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-invalid-config` | stable |
| CLI live missing-provider-key smoke | `cli-live-missing-provider-key-smoke.json` | `pnpm smoke:cli-missing-provider-key` | stable |
| CLI live missing-provider-key transcript | `cli-live-missing-provider-key-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-missing-provider-key` | stable |
| CLI live provider-failure smoke | `cli-live-provider-failure-smoke.json` | `pnpm smoke:cli-provider-failure` | stable |
| CLI live provider-failure transcript | `cli-live-provider-failure-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-provider-failure` | stable |
| CLI live timeout-runtime smoke | `cli-live-timeout-runtime-smoke.json` | `pnpm smoke:cli-timeout-runtime` with provider credentials | stable |
| CLI live timeout-runtime transcript | `cli-live-timeout-runtime-smoke.transcript.txt` | sidecar transcript from `pnpm smoke:cli-timeout-runtime` with provider credentials | stable |
| Live benchmark report | `live-benchmark-report.md` | `pnpm bench:fn:run` with provider secrets | stable |
| Live GitHub Action PR smoke | `live-github-action-pr-smoke.md` | `pnpm evidence:github-action-pr-smoke` from a real `pull_request` workflow context | stable |

## Current Live Captures

### rc.6 Usability Note

The rc.6 usability hardening is documented separately so the release story has a clean local smoke reference alongside live-only evidence. The note is deterministic and local, not live-provider or live-GitHub evidence.

| Evidence | Location | Result |
|----------|----------|--------|
| rc.6 usability evidence | `docs/archived/rc6-usability-evidence.md` | CLI first-run guidance, dry-run readiness, MCP retry guidance, and GitHub Action degraded summaries verified through local smoke and tests |

The 2026-05-04 readiness branch has stable-candidate live evidence captured in
GitHub Actions:

| Evidence | Location | Result |
|----------|----------|--------|
| Live GitHub Action PR smoke | `docs/archived/live-github-action-pr-smoke.md` | Normal same-repo PR #532 posted an `ACCEPT` PR review; oversized PR #531 skipped with a structured diff-limit warning |
| Live benchmark report | `docs/archived/live-benchmark-report.md` | Run 25317360402 completed 20/20 fixtures with 87.5% recall, 82.4% precision, 84.8% F1, and 0/6 FP regressions |

## Skipped And Live-Only Register

| Gate | Location | Classification | Enablement | Stable impact |
|------|----------|----------------|------------|---------------|
| CLI live clean-diff smoke | `.sisyphus/evidence/cli-live-clean-diff-smoke.json` and `.sisyphus/evidence/cli-live-clean-diff-smoke.transcript.txt` | live-only CLI smoke | `pnpm smoke:cli-clean-diff -- --output .sisyphus/evidence/cli-live-clean-diff-smoke.json` with a provider key such as `OPENROUTER_API_KEY`; emits `codeagora.cli-clean-diff-smoke.v1`, records `sessionArtifact.state` as `present` with the derived `.ca/sessions/{date}/{sessionId}/result.json` reference when the CLI produces one or `absent` with a reason otherwise, writes the stdout/stderr transcript sidecar, and must report `ACCEPT` with zero findings | Required before stable CLI false-positive smoke claims; `--dry-run` validates runner plumbing only and is not live evidence |
| CLI live staged-diff smoke | `.sisyphus/evidence/cli-live-staged-diff-smoke.json` and `.sisyphus/evidence/cli-live-staged-diff-smoke.transcript.txt` | live-only CLI smoke | `pnpm smoke:cli-staged-diff -- --output .sisyphus/evidence/cli-live-staged-diff-smoke.json` with a provider key such as `OPENROUTER_API_KEY`; creates an isolated temporary git repository, stages the harmless `src/math.ts` fixture change, invokes the CLI with `review --staged`, emits `codeagora.cli-clean-diff-smoke.v1`, records the observed CLI process exit code, records `sessionArtifact.state` as `present` with size/hash metadata when `.ca/sessions/{date}/{sessionId}/result.json` exists or `absent` with a reason otherwise, and writes the stdout/stderr transcript sidecar | Required before stable staged-diff CLI support claims; `--dry-run` validates runner plumbing only and is not live evidence |
| CLI live patch-file smoke | `.sisyphus/evidence/cli-live-patch-file-smoke.json` and `.sisyphus/evidence/cli-live-patch-file-smoke.transcript.txt` | live-only CLI smoke | `pnpm smoke:cli-patch-file -- --output .sisyphus/evidence/cli-live-patch-file-smoke.json` with a provider key such as `OPENROUTER_API_KEY`; writes a harmless generated patch file by default or accepts `--patch-file /path/to/change.patch`, invokes the CLI with `review <patch-file>`, emits `codeagora.cli-clean-diff-smoke.v1`, records the observed CLI process exit code, records `sessionArtifact.state` as `present` with size/hash metadata when `.ca/sessions/{date}/{sessionId}/result.json` exists or `absent` with a reason otherwise, and writes the stdout/stderr transcript sidecar | Required before stable patch-file CLI support claims; `--dry-run` validates runner plumbing only and is not live evidence |
| CLI live invalid-config smoke | `.sisyphus/evidence/cli-live-invalid-config-smoke.json` and `.sisyphus/evidence/cli-live-invalid-config-smoke.transcript.txt` | live-only CLI validation smoke | `pnpm smoke:cli-invalid-config -- --output .sisyphus/evidence/cli-live-invalid-config-smoke.json`; creates an isolated fixture with malformed `.ca/config.json`, invokes the real CLI with `review clean.patch`, emits `codeagora.cli-clean-diff-smoke.v1`, passes only when the observed CLI process exit code is `2` and stderr contains the JSON parse diagnostic, records `sessionArtifact.state` as `absent` with reason `invalid-config-rejected-before-session-artifact`, and writes the stdout/stderr transcript sidecar | Required before stable invalid-config CLI behavior claims; no provider credentials are required because validation must fail before provider execution |
| CLI live missing-provider-key smoke | `.sisyphus/evidence/cli-live-missing-provider-key-smoke.json` and `.sisyphus/evidence/cli-live-missing-provider-key-smoke.transcript.txt` | live-only CLI validation smoke | `pnpm smoke:cli-missing-provider-key -- --output .sisyphus/evidence/cli-live-missing-provider-key-smoke.json`; creates an isolated valid OpenRouter fixture, removes `OPENROUTER_API_KEY` from the child CLI environment, invokes the real CLI with `review clean.patch`, emits `codeagora.cli-clean-diff-smoke.v1`, passes only when the observed CLI process exit code is `2` and the structured output or transcript contains the missing provider-key diagnostic and env var name, records `sessionArtifact.state` as `absent` with reason `missing-provider-key-rejected-before-session-artifact`, and writes the stdout/stderr transcript sidecar | Required before stable missing-provider-key CLI setup-error behavior claims; no provider credentials are required because the fixture deliberately validates their absence |
| CLI live provider-failure smoke | `.sisyphus/evidence/cli-live-provider-failure-smoke.json` and `.sisyphus/evidence/cli-live-provider-failure-smoke.transcript.txt` | live-only CLI runtime smoke | `pnpm smoke:cli-provider-failure -- --output .sisyphus/evidence/cli-live-provider-failure-smoke.json`; creates an isolated valid fixture, injects an intentionally invalid provider key into the child CLI environment, invokes the real CLI with `review clean.patch`, emits `codeagora.cli-clean-diff-smoke.v1`, passes only when the observed CLI process exit code is `3`, stdout is structured `codeagora.review.v1` JSON with `status: "error"`, the output includes a provider/API runtime diagnostic, records `sessionArtifact.state` as `present` when the CLI writes `.ca/sessions/{date}/{sessionId}/result.json` or `absent` with a reason otherwise, and writes the stdout/stderr transcript sidecar | Required before stable CLI provider runtime-failure behavior claims; uses an intentionally invalid provider key so it does not require or expose a real secret, but it remains live-provider evidence because it exercises provider runtime failure handling |
| CLI live timeout-runtime smoke | `.sisyphus/evidence/cli-live-timeout-runtime-smoke.json` and `.sisyphus/evidence/cli-live-timeout-runtime-smoke.transcript.txt` | live-only CLI runtime smoke | `pnpm smoke:cli-timeout-runtime -- --output .sisyphus/evidence/cli-live-timeout-runtime-smoke.json` with a provider key such as `OPENROUTER_API_KEY`; creates an isolated valid fixture, invokes the real CLI with `review clean.patch --timeout 1 --reviewer-timeout 1`, emits `codeagora.cli-clean-diff-smoke.v1`, passes only when the observed CLI process exit code is `3`, stdout is structured `codeagora.review.v1` JSON with `status: "error"`, the output includes a timeout diagnostic, records `sessionArtifact.state` as `present` when the CLI writes `.ca/sessions/{date}/{sessionId}/result.json` or `absent` with a reason otherwise, and writes the stdout/stderr transcript sidecar | Required before stable CLI timeout runtime-failure behavior claims; provider credentials are required because this exercises the live review timeout path, but stable release remains blocked until the artifact records pass status, transcript, exit code, and session-artifact state |
| Full live pipeline E2E | `src/tests/e2e-full-pipeline.test.ts` | live-only Vitest suite | `CODEAGORA_RUN_LIVE_E2E=1`, `GROQ_API_KEY` or `OPENROUTER_API_KEY`, and `claude` CLI in `PATH` | Required before stable live quality claims; non-blocking for deterministic beta gates |
| Golden-bug live benchmark | `.github/workflows/bench-fn.yml` / `pnpm bench:fn:run` | live-only workflow | provider credentials or GitHub Models `models: read` permission, selected fixture matrix, and optional rate-limit throttle | Required before stable accuracy or `latest` quality claims |
| Live GitHub Action PR smoke | external PR workflow run recorded by `pnpm evidence:github-action-pr-smoke` | live-only GitHub smoke | same-repo PR, fork PR, stale-head, oversized diff, provider-failure, and 422 scenarios; recorder must read the real `GITHUB_EVENT_PATH` `pull_request` payload plus CodeAgora Action outputs (`verdict`, `degraded`, `degraded-reason`, `head-sha`, and `base-sha`) and must pass base/head SHA consistency checks | Required before stable GitHub Action support claim |
| Desktop packaged-app launch | target platform and `.sisyphus/evidence/desktop-gate.log` | automated RC gate plus manual desktop smoke | `pnpm rc:desktop-gate`; launch Tauri shell, open trusted repo, review/cancel, session export, config validation, setup panels, secret redaction; attach `.sisyphus/evidence/desktop-evidence-manifest.json` | Required before RC handoff that includes official desktop claims |
| Desktop visual QA | `.sisyphus/evidence/desktop-visual-qa.json` plus screenshots | automated RC gate | `pnpm desktop:visual-qa` through `pnpm rc:desktop-gate` | Required before claiming release readiness for Desktop UI changes |
| Desktop RC macOS arm64 distribution | `.sisyphus/evidence/desktop-rc-distribution-evidence.json`, `.sisyphus/evidence/desktop-rc-distribution-gate.log`, `.sisyphus/evidence/desktop-rc-github-release-assets.json`, `latest-X.Y-rc.json`, signed DMG, updater app artifact, updater `.sig` | GitHub prerelease artifact evidence | Build only from `vX.Y.Z-rc.N`, publish npm packages under `rc`, require GitHub Environment approval, build macOS arm64 app and DMG bundles, verify Developer ID signature, `TeamIdentifier`, `codesign --verify --deep --strict`, `spctl --assess`, accepted notarization, stapled app and DMG tickets, updater signature content, and same-line `latest-X.Y-rc.json`; attach distribution artifacts to the versioned prerelease with fail-closed asset matching, update the derived line-scoped `desktop-X.Y-rc` prerelease with the static updater JSON, verify the actual GitHub Release asset lists, then run `pnpm evidence:manifest -- --require=rc` | Required before official Desktop RC distribution claims; stable updater channels, npm `latest`, and stable Desktop distribution claims remain out of scope |
| Desktop macOS arm64 signing and notarization | `.sisyphus/evidence/desktop-macos-arm64-signing-evidence.json` plus `.sisyphus/evidence/desktop-evidence-manifest.json` validation output | local signed-artifact evidence | Generate a release macOS arm64 DMG, capture sidecar evidence with schema `codeagora.desktop-macos-arm64-signing-evidence.v1`, matching artifact path and SHA-256, `codesign.status: "accepted"`, non-empty signing authority, team identifier, bundle identifier, hardened runtime, `notarization.status: "accepted"`, and `ticketStapled: true`; then run `pnpm desktop:evidence` to record the validation result | Required before stable macOS arm64 Desktop distribution claims |

Default `pnpm test` results must not be described as live E2E evidence. Release
notes should cite deterministic test counts separately from the live-only
register above.

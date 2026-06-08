# Release Evidence

This document defines the release-candidate evidence bundle. It separates
deterministic local/CI gates from live-only gates so stable claims cannot be
made from skipped provider or GitHub integration coverage.

## Evidence Manifest

Generate the manifest after capturing logs under `.sisyphus/evidence/`:

```bash
pnpm evidence:manifest -- --require=rc
```

The generated `.sisyphus/evidence/evidence-manifest.json` uses schema
`codeagora.release-evidence.v1` and records:

- command name and expected log filename
- required release tier (`beta`, `rc`, or `stable`)
- exit-code evidence availability through file presence
- file size and SHA-256 hash for present artifacts
- commit SHA and generation timestamp
- redaction status for each evidence artifact

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
| Desktop private-preview gate | `desktop-gate.log` | `pnpm rc:desktop-gate` | rc |
| Desktop evidence manifest | `desktop-evidence-manifest.json` | `pnpm desktop:evidence` | rc |
| Security regression gate | `security-regression.log` | `pnpm test:security` | rc |
| Live benchmark report | `live-benchmark-report.md` | `pnpm bench:fn:run` with provider secrets | stable |
| Live GitHub Action PR smoke | `live-github-action-pr-smoke.md` | manual same-repo/fork/stale-head Action matrix | stable |

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
| Full live pipeline E2E | `src/tests/e2e-full-pipeline.test.ts` | live-only Vitest suite | `CODEAGORA_RUN_LIVE_E2E=1`, `GROQ_API_KEY`, and `claude` CLI in `PATH` | Required before stable live quality claims; non-blocking for deterministic beta gates |
| Golden-bug live benchmark | `.github/workflows/bench-fn.yml` / `pnpm bench:fn:run` | live-only workflow | provider credentials or GitHub Models `models: read` permission, selected fixture matrix, and optional rate-limit throttle | Required before stable accuracy or `latest` quality claims |
| Live GitHub Action PR smoke | external PR workflow run | live-only manual smoke | same-repo PR, fork PR, stale-head, oversized diff, provider-failure, and 422 scenarios | Required before stable GitHub Action support claim |
| Desktop packaged-app launch | local preview platform and `.sisyphus/evidence/desktop-gate.log` | automated RC gate plus manual/private-preview smoke | `pnpm rc:desktop-gate`; launch Tauri shell, open trusted repo, review/cancel, session export, config validation, setup panels, secret redaction; attach `.sisyphus/evidence/desktop-evidence-manifest.json` | Required before RC handoff that includes desktop private-preview claims; not a stable public desktop launch |

Default `pnpm test` results must not be described as live E2E evidence. Release
notes should cite deterministic test counts separately from the live-only
register above.

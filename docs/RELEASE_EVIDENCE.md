# Release Evidence

This document defines the release-candidate evidence bundle. It separates
deterministic local/CI gates from live-only gates so stable claims cannot be
made from skipped provider or GitHub integration coverage.

## Evidence Manifest

Generate the manifest after capturing logs under `.sisyphus/evidence/`:

```bash
pnpm evidence:manifest -- --require=beta
```

The generated `.sisyphus/evidence/evidence-manifest.json` uses schema
`codeagora.release-evidence.v1` and records:

- command name and expected log filename
- required release tier (`beta`, `rc`, or `stable`)
- exit-code evidence availability through file presence
- file size and SHA-256 hash for present artifacts
- commit SHA and generation timestamp
- redaction status for each evidence artifact

Use `--require=rc` or `--require=stable` for stricter promotion checks. Live
artifacts are required only for stable claims that depend on live behavior.

## Stable Evidence Filenames

| Evidence | Filename | Command | Tier |
|----------|----------|---------|------|
| Typecheck | `typecheck.log` | `pnpm typecheck` | beta |
| Build | `build.log` | `pnpm build` | beta |
| Full deterministic tests | `test.log` | `pnpm test --no-file-parallelism` | beta |
| Cross-surface parity | `cross-surface-parity.log` | `pnpm vitest run src/tests/cross-surface-parity.test.ts` | rc |
| Deterministic benchmark gate | `bench-ci.log` | `pnpm bench:ci` | beta |
| Beta package and Action smoke | `beta-smoke.log` | `pnpm release:beta-smoke` | beta |
| Root package dry-run | `package-root-dry-run.log` | `pnpm pack --dry-run` | rc |
| MCP package dry-run | `package-mcp-dry-run.log` | `pnpm --filter @codeagora/mcp pack --dry-run` | rc |
| Action smoke bundle | `action-smoke.log` | `pnpm build:action && pnpm release:beta-smoke` | rc |
| MCP smoke | `mcp-smoke.log` | covered by `pnpm release:beta-smoke` | rc |
| Security regression gate | `security-regression.log` | `pnpm test:security` | rc |
| Live benchmark report | `live-benchmark-report.md` | `pnpm bench:fn:run` with provider secrets | stable |
| Live GitHub Action PR smoke | `live-github-action-pr-smoke.md` | manual same-repo/fork/stale-head Action matrix | stable |

## Skipped And Live-Only Register

| Gate | Location | Classification | Enablement | Stable impact |
|------|----------|----------------|------------|---------------|
| Full live pipeline E2E | `src/tests/e2e-full-pipeline.test.ts` | live-only Vitest suite | `CODEAGORA_RUN_LIVE_E2E=1`, `GROQ_API_KEY`, and `claude` CLI in `PATH` | Required before stable live quality claims; non-blocking for deterministic beta gates |
| Golden-bug live benchmark | `.github/workflows/bench-fn.yml` / `pnpm bench:fn:run` | live-only workflow | `OPENROUTER_API_KEY` secret and selected fixture matrix | Required before stable accuracy or `latest` quality claims |
| Live GitHub Action PR smoke | external PR workflow run | live-only manual smoke | same-repo PR, fork PR, stale-head, oversized diff, provider-failure, and 422 scenarios | Required before stable GitHub Action support claim |

Default `pnpm test` results must not be described as live E2E evidence. Release
notes should cite deterministic test counts separately from the live-only
register above.

# Release Checklist

This checklist records the completed `0.1.0-beta.1` prerelease gate and defines the repeatable evidence procedure for the next release-candidate or stable promotion review.

## Scope Guardrails

Readiness verification is separate from any future stable release, npm `latest` dist-tag promotion, marketplace publication, or GitHub Action stable-ref promotion.

Before any future tag is pushed, confirm the intended package versions, dist-tags, package contents, and npm token availability. Prerelease packages must publish under an explicit prerelease npm dist-tag (`beta` for beta versions, `rc` for release candidates), never `latest`.

## Release Surfaces

1. Root CLI package: `@codeagora/review`, including the `codeagora` and `agora` binaries.
2. MCP package: `@codeagora/mcp`, including the `codeagora-mcp` binary and package-local onboarding.
3. GitHub Action: repo-native composite Action backed by `dist/action.js`.
4. Desktop private preview: `@codeagora/desktop` Tauri app evidence only. It is not a stable public desktop support claim.

## Beta Gates

1. Confirm package version consistency between release notes, root `package.json`, supported workspace package manifests, and `packages/mcp/package.json`; note desktop private-preview metadata separately if touched.
2. Run `pnpm typecheck`.
3. Run `pnpm test --no-file-parallelism`.
4. Run `pnpm build`.
5. Run `pnpm bench:ci` to validate deterministic benchmark schema/reference gates without live providers.
6. Run `pnpm release:beta-smoke` to validate local package and Action smoke behavior without publishing.
7. Run root package pack dry-run and confirm runtime files for `codeagora`/`agora` are included while tests, `.env`, `bench-out*`, and `.sisyphus/evidence` are excluded.
8. Run `pnpm --filter @codeagora/mcp pack --dry-run` and confirm `dist/index.js`, `package.json`, and `README.md` are included while tests and secrets are excluded.
9. Run the GitHub Action smoke path through `pnpm build:action` and the release smoke script.
10. Confirm `.github/workflows/release.yml` computes the expected prerelease publish tag and runs npm publish with `--tag beta` for beta versions and `--tag rc` for release candidates.
11. Confirm `.github/workflows/npm-dist-tags.yml` offers `beta` and `rc`, and blocks assigning prerelease versions to `latest`.
12. Review README, CLI docs, MCP onboarding, `.env.example`, and Action docs for current install and secret requirements, including `bssm-oss/CodeAgora@v0.1.0-rc.1` for RC Action examples rather than legacy `@v2` or stable-looking refs.
13. Confirm release workflow publish jobs require the `npm-publish` environment, npm provenance, npm version preflight, and uploaded release evidence artifacts.
14. Open the PR and verify remote checks: CI Node 20/22, CodeAgora review or documented provider-only skip, and PR size label.
15. Confirm P6 beta readiness only after P4 deterministic benchmark gates and P5 security abuse gates pass.
16. For any RC after `0.1.0-beta.1`, run `pnpm rc:desktop-gate` and attach `.sisyphus/evidence/desktop-evidence-manifest.json` before RC handoff.

For `0.1.0-beta.1`, `0.1.0-beta.2`, and `0.1.0-rc.0`, the tags, prerelease GitHub Releases, and npm prerelease dist-tag publications are complete. For `0.1.0-rc.1`, keep stable promotion blocked until the `--require=rc` evidence manifest is complete and the live-only register is current.

Current RC handoff status: on 2026-05-12, `main` `d621b62` passed CI plus
`pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test --no-file-parallelism`,
`pnpm bench:ci`, `pnpm test:security`, `pnpm release:beta-smoke`,
`pnpm rc:desktop-gate`, and `pnpm evidence:manifest -- --require=rc`. The RC
candidate metadata is prepared, but tag creation, GitHub Release creation, and
npm publication are not complete until requested separately.

## Evidence

Capture command output under `.sisyphus/evidence/` for typecheck, test, build, `bench:ci`, `release:beta-smoke`, root package dry-run, MCP package dry-run, release-safety tests, and security regression tests.

Use the following stable filenames for locally captured release-candidate evidence:

| Evidence | Filename | Command |
|----------|----------|---------|
| Typecheck | `typecheck.log` | `pnpm typecheck` |
| Lint | `lint.log` | `pnpm lint` |
| Build | `build.log` | `pnpm build` |
| Full deterministic tests | `test.log` | `pnpm test --no-file-parallelism` |
| Cross-surface parity | `cross-surface-parity.log` | `pnpm vitest run src/tests/cross-surface-parity.test.ts` |
| Deterministic benchmark gate | `bench-ci.log` | `pnpm bench:ci` |
| Beta package and Action smoke | `beta-smoke.log` | `pnpm release:beta-smoke` |
| Root package dry-run | `package-root-dry-run.log` | `pnpm pack --dry-run` |
| MCP package dry-run | `package-mcp-dry-run.log` | `pnpm --filter @codeagora/mcp pack --dry-run` |
| Action smoke bundle | `action-smoke.log` | `pnpm build:action && pnpm release:beta-smoke` |
| MCP smoke | `mcp-smoke.log` | covered by `pnpm release:beta-smoke` |
| Desktop private-preview gate | `desktop-gate.log` | `pnpm rc:desktop-gate` |
| Desktop evidence manifest | `desktop-evidence-manifest.json` | `pnpm desktop:evidence` |
| Security regression gate | `security-regression.log` | `pnpm test:security` |
| Live benchmark report | `live-benchmark-report.md` | `pnpm bench:fn:run` with provider credentials or GitHub Models |
| Live GitHub Action PR smoke | `live-github-action-pr-smoke.md` | same-repository PR smoke plus degraded-path evidence |
| Evidence manifest | `evidence-manifest.json` | generated or filled during release prep |

`cross-surface-parity.log` must show the deterministic CLI/MCP/GitHub Action parity fixture passing. `beta-smoke.log` remains the provider-free packed CLI/MCP/Action runtime smoke.

`desktop-gate.log` must show desktop typecheck, desktop smoke, Tauri check,
backend app E2E, macOS WebDriver E2E on macOS preview hardware, desktop evidence
generation, and bundle smoke passing. Desktop signing, notarization, updater,
and public distribution remain deferred private-preview decisions recorded in
`docs/DESKTOP_PREVIEW.md` and `desktop-evidence-manifest.json`.

Generate the RC manifest after the logs are captured:

```bash
pnpm evidence:manifest -- --require=rc
```

See `docs/RELEASE_EVIDENCE.md` for the skipped/live-only register and stricter
`--require=rc` / `--require=stable` promotion checks.

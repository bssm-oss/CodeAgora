# Beta Release Checklist

This checklist verifies `0.1.0-beta.0` release readiness and keeps publish operations behind an explicit final approval stop.

## Scope Guardrails

The beta readiness gate itself does not create GitHub tags, create GitHub Releases, publish npm packages, promote npm dist-tags, publish to marketplaces, or promote the GitHub Action release ref. Those operations are intentionally separate from readiness verification.

Before the final `v0.1.0-beta.0` tag is pushed, confirm the intended package versions, dist-tags, package contents, and npm token availability. Prerelease packages must publish under the `beta` npm dist-tag, never `latest`.

## Release Surfaces

1. Root CLI package: `@codeagora/review`, including the `codeagora` and `agora` binaries.
2. MCP package: `@codeagora/mcp`, including the `codeagora-mcp` binary and package-local onboarding.
3. GitHub Action: repo-native composite Action backed by `dist/action.js`.

## Beta Gates

1. Confirm package version consistency between release notes, root `package.json`, workspace package manifests, desktop metadata, and `packages/mcp/package.json`.
2. Run `pnpm typecheck`.
3. Run `pnpm test --no-file-parallelism`.
4. Run `pnpm build`.
5. Run `pnpm bench:ci` to validate deterministic benchmark schema/reference gates without live providers.
6. Run `pnpm release:beta-smoke` to validate local package and Action smoke behavior without publishing.
7. Run root package pack dry-run and confirm runtime files for `codeagora`/`agora` are included while tests, `.env`, `bench-out*`, and `.sisyphus/evidence` are excluded.
8. Run `pnpm --filter @codeagora/mcp pack --dry-run` and confirm `dist/index.js`, `package.json`, and `README.md` are included while tests and secrets are excluded.
9. Run the GitHub Action smoke path through `pnpm build:action` and the release smoke script.
10. Confirm `.github/workflows/release.yml` computes a prerelease publish tag and runs npm publish with `--tag beta` for beta versions.
11. Confirm `.github/workflows/npm-dist-tags.yml` offers `beta` and blocks assigning prerelease versions to `latest`.
12. Review README, CLI docs, MCP onboarding, `.env.example`, and Action docs for current install and secret requirements.
13. Open the PR and verify remote checks: CI Node 20/22, CodeAgora review or documented provider-only skip, and PR size label.
14. Confirm P6 beta readiness only after P4 deterministic benchmark gates and P5 security abuse gates pass.

## Evidence

Capture command output under `.sisyphus/evidence/` for typecheck, test, build, `bench:ci`, `release:beta-smoke`, root package dry-run, MCP package dry-run, release-safety tests, and security regression tests.

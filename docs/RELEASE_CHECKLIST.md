# Beta Release Checklist

This checklist verifies P4-P6 beta readiness without publishing anything.

## Scope Guardrails

The beta gate does not perform npm publish, npm dist-tag promotion, GitHub tag creation, GitHub Release creation, marketplace publication, or Action release promotion. Those operations remain out of scope until a separate release approval.

## Release Surfaces

1. Root CLI package: `@codeagora/review`, including the `codeagora` and `agora` binaries.
2. MCP package: `@codeagora/mcp`, including the `codeagora-mcp` binary and package-local onboarding.
3. GitHub Action: repo-native composite Action backed by `dist/action.js`.

## Beta Gates

1. Confirm package version consistency between release notes, root `package.json`, and `packages/mcp/package.json`.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Run `pnpm build`.
5. Run `pnpm bench:ci` to validate deterministic benchmark schema/reference gates without live providers.
6. Run `pnpm release:beta-smoke` to validate local package and Action smoke behavior without publishing.
7. Run root package pack dry-run and confirm runtime files for `codeagora`/`agora` are included while tests, `.env`, `bench-out*`, and `.sisyphus/evidence` are excluded.
8. Run `pnpm --filter @codeagora/mcp pack --dry-run` and confirm `dist/index.js`, `package.json`, and `README.md` are included while tests and secrets are excluded.
9. Run the GitHub Action smoke path through `pnpm build:action` and the release smoke script.
10. Review README, CLI docs, MCP onboarding, `.env.example`, and Action docs for current install and secret requirements.
11. Open the PR and verify remote checks: CI Node 20/22, CodeAgora review, and PR size label.
12. Confirm P6 beta readiness only after P4 deterministic benchmark gates and P5 security abuse gates pass.

## Evidence

Capture command output under `.sisyphus/evidence/` for typecheck, test, build, `bench:ci`, `release:beta-smoke`, root package dry-run, MCP package dry-run, and security regression tests.

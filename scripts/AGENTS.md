<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-14 -->

# scripts/

## Purpose
Repository automation for action bundles, release/package smoke, evidence manifests, model snapshots, and benchmark runs.

## Where To Look
| Task | File | Notes |
|---|---|---|
| Bundle GitHub Action | `build-action.mjs` | Source is `packages/github/src/action.ts`; output is `dist/action.js`. |
| Package/release smoke | `beta-smoke.mjs` | Verifies package dry-run, CLI help, MCP initialize/tools-list, and Action bundle path. |
| Evidence manifest | `evidence-manifest.mjs` | Reads `.sisyphus/evidence/` logs and enforces beta/rc/stable tiers. |
| Live Action PR smoke evidence | `github-action-pr-smoke-recorder.mjs` | Records the stable live PR smoke markdown from an actual `pull_request` event payload and CodeAgora Action outputs. |
| Package contents | `verify-package-contents.mjs` | Checks root/MCP package file sets and runtime data paths. |
| Golden-bug benchmark | `bench-fn*.ts`, `bench-reference-check.ts` | Keep deterministic validation separate from live provider runs. |
| Model snapshots | `update-models-snapshot.ts` | Treat provider/model lineup data as time-sensitive. |

## Conventions
- Scripts are narrow entrypoints; do not turn them into runtime package APIs.
- Prefer structured parsing and explicit exits over log scraping.
- Keep generated artifacts out of source unless the release process explicitly requires them.
- If a script changes release evidence, update the related docs under `docs/archived/RELEASE_EVIDENCE.md` or current rc evidence notes.

## Action-Source Change Checklist

If action source or bundled dependencies change, expected local verification is:

```bash
pnpm build:action
git diff -- dist/action.js
pnpm release:beta-smoke
pnpm evidence:github-security
```

`pnpm build:action` is required after edits that affect `packages/github/src/action.ts`, `packages/github/src/**` code reachable from the Action bundle, `packages/core/src/**`, `packages/shared/src/**`, `action.yml`, or `scripts/build-action.mjs`. Review the `dist/action.js` diff intentionally; do not silently rewrite it.

## Evidence Boundaries

- `pnpm release:beta-smoke` is provider-free package/MCP/Action runtime smoke coverage.
- `pnpm bench:ci` is deterministic benchmark/reference validation, not live provider evidence.
- `pnpm evidence:github-security` records token/fork/security policy evidence for RC manifests.
- `pnpm evidence:github-action-pr-smoke` is valid live Action evidence only from an actual GitHub Actions `pull_request` context with CodeAgora Action outputs.
- Do not use deterministic tests, skipped provider paths, or local dry-runs as stable live-provider or live-GitHub-posting evidence. Stable or RC promotion claims must follow `docs/archived/RELEASE_EVIDENCE.md`.

## Anti-Patterns
- Do not make live provider/network evidence a substitute for `pnpm bench:ci`.
- Do not publish or promote dist-tags from ad hoc scripts without the release workflow safeguards.
- Do not silently rewrite `dist/action.js`; action-source edits require `pnpm build:action` and an intentional bundle diff.

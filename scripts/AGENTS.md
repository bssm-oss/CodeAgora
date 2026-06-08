<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# scripts/

## Purpose
Repository automation for action bundles, release/package smoke, evidence manifests, model snapshots, and benchmark runs.

## Where To Look
| Task | File | Notes |
|---|---|---|
| Bundle GitHub Action | `build-action.mjs` | Source is `packages/github/src/action.ts`; output is `dist/action.js`. |
| Package/release smoke | `beta-smoke.mjs` | Verifies package dry-run, CLI help, MCP initialize/tools-list, and Action bundle path. |
| Evidence manifest | `evidence-manifest.mjs` | Reads `.sisyphus/evidence/` logs and enforces beta/rc/stable tiers. |
| Package contents | `verify-package-contents.mjs` | Checks root/MCP package file sets and runtime data paths. |
| Golden-bug benchmark | `bench-fn*.ts`, `bench-reference-check.ts` | Keep deterministic validation separate from live provider runs. |
| Model snapshots | `update-models-snapshot.ts` | Treat provider/model lineup data as time-sensitive. |

## Conventions
- Scripts are narrow entrypoints; do not turn them into runtime package APIs.
- Prefer structured parsing and explicit exits over log scraping.
- Keep generated artifacts out of source unless the release process explicitly requires them.
- If a script changes release evidence, update the related docs under `docs/archived/RELEASE_EVIDENCE.md` or current rc evidence notes.

## Anti-Patterns
- Do not make live provider/network evidence a substitute for `pnpm bench:ci`.
- Do not publish or promote dist-tags from ad hoc scripts without the release workflow safeguards.
- Do not silently rewrite `dist/action.js`; action-source edits require `pnpm build:action` and an intentional bundle diff.

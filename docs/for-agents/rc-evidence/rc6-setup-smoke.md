<!-- Parent: ../PRODUCTION_READINESS_ROADMAP.md -->

# RC.6 Setup And Usability Smoke

Generated: 2026-06-05

## Purpose

`0.1.0-rc.6` is the setup and usability hardening pass for CodeAgora's stable
surfaces: CLI, GitHub Action, and MCP. Desktop remains private preview.

This note is the evidence ledger for closing the current dirty worktree without
expanding product scope.

## Environment

| Item | Value |
| --- | --- |
| Repo | `/Users/justn/Workspaces/orgs/bssm-oss/main/justn-hyeok/CodeAgora` |
| Mode | Source checkout, dirty local rc.6 worktree |
| Package manager | pnpm |
| Session | `codex:019e94e9-9f27-7980-8e65-5b08833539ff` |
| Stable surfaces in scope | CLI, GitHub Action, MCP |
| Explicitly private preview | Desktop |

## Dirty-Cluster Ownership

The boundary check was performed before any rc.6 source edits in this
start-work session. Existing dirty files were treated as user/prior-agent work
until classified.

| Cluster | Files | Classification | Reason | Required verification |
| --- | --- | --- | --- | --- |
| CLI first-run UX | `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/register-init.ts`, `packages/cli/src/commands/review.ts`, `packages/cli/src/formatters/review-output.ts`, `packages/cli/src/tests/register-init.test.ts`, `src/tests/cli-commands.test.ts`, `src/tests/cli-error-handling.test.ts`, `src/tests/review-output-advanced.test.ts` | `rc6-owned` | Adds human-readable next steps for init, doctor, dry-run JSON stability, review footer, and matching tests. No intended JSON/NDJSON contract expansion beyond stripping text-only readiness from dry-run JSON. | `pnpm vitest run packages/cli/src/tests/register-init.test.ts src/tests/cli-commands.test.ts src/tests/cli-error-handling.test.ts src/tests/review-output-advanced.test.ts src/tests/cli-output-formats.test.ts src/tests/cli-review-options.test.ts`; tmux clean-repo CLI smoke. |
| Core dry-run preflight | `packages/core/src/pipeline/dryrun.ts`, `src/tests/pipeline-dryrun.test.ts` | `rc6-owned` | Adds `ready`/`blocked`/`risky` readiness classification and next actions for human text output. | `pnpm vitest run src/tests/pipeline-dryrun.test.ts`; tmux dry-run blocked/ready/risky transcript. |
| MCP agent retry guidance | `packages/mcp/src/tools/*.ts`, `packages/mcp/src/tests/tool-handlers.test.ts`, `packages/mcp/src/tests/tools.test.ts`, `packages/mcp/README.md` | `rc6-owned` | Improves tool descriptions, `repo_path` descriptions, invalid diff guidance, structured error details, and README examples without renaming tools or removing existing fields. | `pnpm vitest run packages/mcp/src/tests/tool-handlers.test.ts packages/mcp/src/tests/tools.test.ts`; MCP startup/tools-list or package smoke plus invalid `repo_path` artifact. |
| GitHub Action degraded guidance | `packages/github/src/action.ts`, `packages/github/src/action-policy.ts`, `packages/github/src/poster.ts`, `packages/github/src/tests/github-poster.test.ts`, `src/tests/github-action-parse-args.test.ts`, `action.yml`, `dist/action.js` | `rc6-owned` | Adds actionable warning messages and stable degraded-reason help while keeping Action inputs/outputs stable; bundle appears intentionally regenerated. | `pnpm vitest run src/tests/github-action-parse-args.test.ts packages/github/src/tests/github-poster.test.ts`; `pnpm build:action`; docs/action wording review. |
| User docs | `docs/for-users/5_GITHUB_INTEGRATION.md`, `docs/for-users/GITHUB_ACTIONS_SETUP.md`, `docs/for-users/PROVIDERS.md`, `docs/for-users/TROUBLESHOOTING.md`, `docs/for-users/EXTENSIONS.md` | `rc6-owned` | Documents Action degraded reasons, provider setup, MCP retry guidance, and companion agent workflow boundaries for the setup/recovery theme. | Docs mismatch review against Action/MCP source and current `@rc` path. |
| Desktop fallback and i18n copy | `packages/desktop/src/api/desktop-fallbacks.ts`, `packages/shared/src/i18n/locales/en.json`, `packages/shared/src/i18n/locales/ko.json` | `rc6-owned-with-private-preview-boundary` | Desktop fallback demo data and localized error hints support private-preview/local UX; this must not become a stable desktop release claim. | If behavior remains touched, run `pnpm rc:desktop-gate`; otherwise document as private-preview evidence. |
| RC.6 roadmap draft | `ROADMAP-for-rc6.md` | `split-later` | Useful planning input, but `.omo/plans/codeagora-current-work-and-completion-plan.md` is the active execution plan. Avoid creating two normative rc.6 roadmaps unless folded deliberately. | Leave unstaged or fold later into release/evidence docs by explicit decision. |
| Demo review JSON examples | `examples/mock-review-result.json`, `examples/review-result-demo.json` | `split-later` | Useful desktop/MCP demo artifacts, but not required to close first-run CLI/GitHub/MCP usability unless a later desktop/private-preview smoke needs them. | Leave untouched for now; decide during desktop/i18n scope step. |
| Init-deep scoped guidance | `AGENTS.md`, `packages/AGENTS.md`, `packages/mcp/AGENTS.md`, `packages/desktop/AGENTS.md`, `scripts/AGENTS.md`, `benchmarks/AGENTS.md`, `packages/core/src/pipeline/analyzers/AGENTS.md`, `packages/desktop/src/AGENTS.md`, `packages/desktop/src-tauri/AGENTS.md` | `planning/tooling-owned` | Created by the preceding `omo:init-deep` task, not rc.6 product implementation. Keep separate from rc.6 release evidence and staging decisions. | `git diff --check` already passed for this cluster during init-deep. |
| Start-work state | `.omo/boulder.json`, `.omo/start-work/ledger.jsonl`, `.omo/plans/codeagora-current-work-and-completion-plan.md` | `planning/tooling-owned` | Required by `omo:start-work` to track checkboxes and continuation state. | Boulder state has `codex:` session id; ledger entries appended per completed checkbox. |

## Scope Decision

Proceed with rc.6 usability hardening for CLI, dry-run, MCP, GitHub Action, and
supporting user docs. Keep desktop as private-preview evidence only. Do not start
rc.7 team automation, rc.8 stable promotion, new product surfaces, or L0-L3
review semantics changes in this work session.

## Evidence To Fill

- CLI success path: PASS.
  - Automated: `pnpm vitest run packages/cli/src/tests/register-init.test.ts src/tests/cli-commands.test.ts src/tests/cli-error-handling.test.ts src/tests/review-output-advanced.test.ts src/tests/cli-output-formats.test.ts src/tests/cli-review-options.test.ts`
  - Result: 7 test files passed, 165 tests passed.
  - Manual source-mode smoke: `.omo/ulw-loop/evidence/rc6-cli-first-run.txt`.
  - Observable: clean temp repo created `.ca/config.json`, `agora init --yes` printed `Next steps`, `agora doctor` grouped warnings/ready checks and printed `Next steps`, and `agora review --dry-run change.patch` exited 0.
- CLI failure recovery path: PASS.
  - Observable: dry-run with missing `GROQ_API_KEY` reported `Readiness: blocked`, reason `blocked: no usable provider credentials`, and next action `export GROQ_API_KEY=<your-key> for groq`.
  - Note: an initial `pnpm dev` smoke was intentionally retained as `.omo/ulw-loop/evidence/rc6-cli-first-run-pnpm-dev-failed.txt`; it showed `pnpm --filter @codeagora/cli dev` runs with `packages/cli` as cwd, so source-mode QA uses the direct `tsx .../packages/cli/src/index.ts` entrypoint to preserve the temp repo cwd.
- Dry-run preflight: PASS.
  - Automated: `pnpm vitest run src/tests/pipeline-dryrun.test.ts`
  - Result: 2 test files passed, 25 tests passed; readiness classification and next-action coverage are pinned in the dry-run test suite.
  - Manual tmux smoke: `.omo/ulw-loop/evidence/rc6-dry-run-preflight.txt`.
  - Observable: empty diff returned `Empty diff — nothing to review.` with exit 2; `agora review --dry-run ready.patch` printed `Pipeline Dry Run Report`, `Readiness: blocked`, the reason `blocked: no usable provider credentials`, and next actions including `agora doctor`, `agora review --staged`, `agora review --quick <diff.patch>`, and `export GROQ_API_KEY=<your-key> for groq`.
  - Hung/long-command probe: `.omo/ulw-loop/evidence/rc6-dry-run-preflight-hung-init.txt` captured an overly broad smoke that stalled after re-running `init --yes` following auto-config; the passing smoke narrowed the surface to dry-run behavior and all tmux/temp resources were cleaned up.
- MCP startup/tool/retry guidance: PASS.
  - Automated: `pnpm vitest run packages/mcp/src/tests/tool-handlers.test.ts packages/mcp/src/tests/tools.test.ts`
  - Result: 2 test files passed, 68 tests passed.
  - Build: `pnpm --filter @codeagora/mcp build`
  - Manual tmux smoke: `.omo/ulw-loop/evidence/rc6-mcp-retry-guidance.txt`.
  - Observable: stdio server initialized as `codeagora` `0.1.0-rc.5`; `tools/list` exposed updated tool descriptions and `repo_path` schema guidance; invalid `repo_path: "/etc"` returned `INVALID_REPO_PATH`, `isError: true`, and next steps to omit `repo_path`, pass the exact repository root, or keep paths inside the MCP boundary.
- GitHub Action setup/degraded guidance: PASS.
  - Automated: `pnpm vitest run src/tests/github-action-parse-args.test.ts packages/github/src/tests/github-poster.test.ts packages/github/src/tests/critical-github-errors.test.ts`
  - Result: 3 test files passed, 48 tests passed.
  - Bundle: `pnpm build:action` completed with `dist/action.js built (0 errors, 0 warnings)`.
  - Manual/docs review: `.omo/ulw-loop/evidence/rc6-action-guidance.txt`.
  - Observable: source, generated `dist/action.js`, `action.yml`, and user docs all mention the stable degraded reasons and why/next-step guidance for missing token, missing provider secrets, fork secret limits, disabled posting, oversized diff, config load failure, stale head, posting failure, and SARIF write failure.
- Desktop private-preview note: PARTIAL PASS, private-preview only.
  - Scope decision: `packages/desktop/src/api/desktop-fallbacks.ts` is kept as private-preview fallback/demo support, not as a stable desktop launch claim.
  - Gate attempt: `pnpm rc:desktop-gate`.
  - Result: after `cargo clean` fixed stale Rust target artifacts, approved rerun passed desktop typecheck, smoke, `tauri:check`, app e2e, macOS webdriver e2e, and evidence manifest generation.
  - Evidence: `.omo/ulw-loop/evidence/rc6-desktop-private-preview.txt`; manifest at `.sisyphus/evidence/desktop-evidence-manifest.json`.
  - Known limit: final `bundle:smoke` failed during DMG bundling after producing `CodeAgora.app` and an intermediate `rw.*.dmg`; this remains a private-preview packaging blocker and does not change the stable CLI/GitHub Action/MCP scope.
- Package smoke status: PASS with rerun note.
  - Final gate: `pnpm typecheck` passed.
  - Final gate: `pnpm build:action` passed.
  - Final gate: `env npm_config_cache=/private/tmp/codeagora-npm-cache pnpm release:beta-smoke` passed after network approval.
  - Rerun note: the first default-cache attempt failed because `/Users/justn/.npm` contained root-owned cache files; the isolated-cache sandbox attempt then reached `npm install` but failed with registry `ENOTFOUND`; the approved network rerun passed package dry-run contents, CLI help/init/runtime smoke, MCP tools/config/dry-run/review_quick smoke, root postinstall smoke, and tarball-installed CLI/MCP smokes.
- Docs mismatch table:
  | Area | Result |
  | --- | --- |
  | CLI init/doctor/dry-run guidance | Source tests and tmux transcripts match the new next-step wording. |
  | MCP `repo_path` guidance | README/schema/tool output all tell agents to omit `repo_path`, pass the exact repo root, or stay inside the boundary. |
  | GitHub Action degraded reasons | Source, generated `dist/action.js`, `action.yml`, and user docs list the stable degraded reasons and next-step guidance. |
  | Desktop | Evidence manifest explicitly marks `releaseChannel` as `private-preview`, `publicDesktopLaunch` as `false`, and signing/notarization/updater as deferred/disabled. |
- Known limits and next RC:
  - Desktop remains private preview. The final DMG bundle step failed during `bundle_dmg.sh` after `.app` creation and an intermediate `rw.*.dmg`; do not treat desktop as stable release evidence until this packaging blocker is closed.
  - `pnpm dev` is not a clean temp-repo CLI smoke because `pnpm --filter @codeagora/cli dev` uses `packages/cli` as cwd; source-mode QA used the direct `tsx .../packages/cli/src/index.ts` entrypoint and release smoke covered tarball-installed CLI behavior.
  - Next required RC work remains rc.4/rc.5 evidence reconciliation, then rc.7 real/sandbox team automation trial before rc.8 stable-candidate decisions.

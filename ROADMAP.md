# CodeAgora Roadmap

## Purpose

This roadmap is the root-level readiness queue for CodeAgora. It collects the concrete supplementation work found during the current repository completeness assessment and turns it into an execution plan from beta toward stable production readiness.

This document is not a product wishlist. It focuses on correctness blockers, packaging/API contract gaps, public-surface accuracy, evidence quality, and release confidence for the supported surfaces.

After `v0.1.0-beta.1`, the Tauri desktop private-preview production track is closed for release-candidate handoff. RC work can proceed only while desktop, CLI/GitHub/MCP, package, security, benchmark, and live-only evidence stay refreshed against the integrated product shape.

## Scope

In scope:

- CLI review flows, setup, config defaults, output contracts, and session behavior.
- GitHub Action PR review, posting, status checks, SARIF behavior, and degraded/fork paths.
- MCP server tool parity, package startup, schema validation, and structured errors.
- Tauri desktop private-preview evidence before the next RC: CLI bridge, repository/session browsing, progress streaming, config studio, provider setup, MCP setup, GitHub Action setup, local evidence views, and packaging smoke.
- Package contents, entrypoints, generated types, published-package smoke tests, and release evidence.
- Benchmark credibility, live evidence artifacts, docs accuracy, and stable-readiness claims.

Out of scope before stable:

- Hosted service, billing, teams, or enterprise admin features.
- Public desktop launch or stable desktop support claims before desktop graduation gates are closed.
- Reintroducing retired web dashboard, TUI, or notification package surfaces.
- Accuracy claims not backed by benchmark evidence.
- Broad product expansion beyond CLI, GitHub Action, MCP, and the pre-RC Tauri private preview.

## Relationship To Existing Docs

- `docs/PRODUCTION_READINESS_ROADMAP.md` remains the detailed production gate definition.
- `docs/BETA_READINESS_P4_P6.md` remains the current beta-readiness evidence summary.
- `docs/RELEASE_CHECKLIST.md` remains the release procedure and approval-stop checklist.
- This root roadmap is the short operational queue: what must be fixed, proven, or clarified next.

## Current Position

CodeAgora has cleared the cautious beta line for CLI, GitHub Action, and MCP feedback. Local deterministic gates are strong: typecheck, build, tests, benchmark schema/reference gate, and beta smoke all pass in the latest assessment.

Stable production readiness is not complete yet. The main remaining work is no longer broad CLI/GitHub/MCP feature development or desktop implementation; it is re-running package, release, security, benchmark, and live-evidence checks with the desktop private-preview surface included in the RC story.

## Readiness Snapshot

| Area | Current state | Stable gap |
|------|---------------|------------|
| Core pipeline | Implemented and covered through deterministic readiness gates | Keep contract and live-quality evidence green through a release-candidate cycle |
| CLI | Primary supported surface; setup, input handling, docs/help parity, package smoke, and config mutation gates closed | Keep packed/global smoke evidence current for release candidates |
| GitHub Action | Bundled Action, live small-PR smoke, oversized-diff behavior, degraded/output contracts, and SARIF handoff are documented | Fork/stale-head/provider-failure scenarios remain release-candidate regression checks |
| MCP | 9 advertised tools implemented with parity evidence, structured errors, package smoke, and runtime data coverage | Keep published-package startup smoke current for release candidates |
| Desktop | Private-preview gates closed on 2026-05-06; `pnpm rc:desktop-gate` covers typecheck, smoke, `tauri:check`, Rust app E2E, macOS WebDriver E2E, evidence manifest, and bundle smoke | Keep private-preview evidence green during RC; no stable public desktop support until signing/notarization/updater/public distribution decisions are revisited |
| Packaging | Root/MCP package dry-run, entrypoint/type contracts, runtime data paths, and provenance gates are aligned | Re-run package dry-runs before publish approval |
| Benchmarks | Deterministic 20-fixture gate and 2026-05-04 live stable-candidate report exist | Re-run live benchmark when model pools, severity semantics, or stable wording change |
| Docs | Release, Action, SARIF, desktop-preview, evidence, and roadmap drift gates are aligned | Keep docs synchronized before each release candidate |

## How To Use This Roadmap

Treat each item as a gate, not a suggestion. A gate is closed only when all of these are true:

1. The gap has a regression test, smoke command, docs consistency check, or live evidence artifact.
2. The implementation or docs change is complete.
3. The listed evidence command or artifact exists.
4. The relevant public surface has been exercised through its real entrypoint, not only by reading source.
5. Any changed release claim is reflected in README, release notes, and the authoritative docs listed above.

## Master Checklist

This checklist is the working queue. Keep the detailed sections below as the
evidence and implementation notes, but use this list to decide what is actually
closed.

### P0 Correctness And Package Contracts

- [x] Fix default config generation and validate generated defaults.
- [x] Validate user-facing config mutations and backend/schema parity.
- [x] Make review caching sound across review-meaning inputs.
- [x] Define and test the versioned session artifact contract.
- [x] Fix or narrow core/shared package entrypoint and type contracts.
- [x] Prove generated setup paths and packed CLI/MCP runtime data paths.

### P1 Public Surface Accuracy

- [x] Make scoped CLI review input handling non-mutating.
- [x] Keep CLI help and CLI reference docs in lockstep.
- [x] Align README, init workflow templates, and release docs on the beta Action ref.
- [x] Wire and document Action `config-path`, skip/default/output, and degraded contracts.
- [x] Clarify SARIF as generated output with caller-owned Code Scanning upload.
- [x] Prove GitHub Action 422 retry safety and no duplicate posting side effects.
- [x] Normalize degraded reason codes across CLI, Action, MCP, and session artifacts.
- [x] Make every MCP tool return contract-compliant structured errors.

### P2 Evidence And Stable Claims

- [x] Run and capture a representative live GitHub Action PR smoke.
- [x] Produce a fresh stable-candidate live benchmark report with full metadata.
- [x] Add deterministic CLI/MCP/Action cross-surface parity evidence.
- [x] Classify skipped and live-only tests in release evidence.
- [x] Standardize release evidence filenames and add an evidence manifest.
- [x] Align CI/release/lint/runtime-matrix gates.
- [x] Harden release automation with approval, provenance, and prepublish checks.
- [x] Upload release evidence artifacts automatically.
- [x] Promote the security regression suite to a named stable gate.

### P3 Scope Hygiene

- [x] Keep desktop explicitly private preview across public docs.
- [x] Clean public TODO/draft signals and mark research TODOs as non-release backlog.
- [x] Prevent roadmap drift by syncing completed gates back to authoritative docs.

## Status Notes

- 2026-05-04: P0/P1 local correctness and public-surface gates were closed with regression coverage and docs updates. The final P2 live evidence gates were later closed with GitHub Action PR smoke and a stable-candidate live benchmark artifact.
- 2026-05-04: Live GitHub Action evidence was captured in PR #532 (`review` run 25317789874, review 4219826536, verdict `ACCEPT`) and oversized-diff behavior was captured in PR #531 (`review` run 25317537322).
- 2026-05-04: Stable-candidate live benchmark evidence was captured in run 25317360402 with 20/20 successful fixtures, 87.5% recall, 82.4% precision, 84.8% F1, and 0/6 FP regressions.
- 2026-05-04: Release evidence, skipped/live-only classification, security regression, CI/release/provenance, and artifact-upload gates were synced into `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_EVIDENCE.md`, CI/release workflows, and dedicated readiness tests.
- 2026-05-04: Desktop scope hygiene was re-checked across README, changelog, release docs, architecture docs, extension docs, and postinstall messaging. Desktop remains a private preview outside stable CLI/GitHub/MCP release gates.
- 2026-05-06: `v0.1.0-beta.1` is published as a GitHub prerelease and npm `beta` dist-tag release. Stable promotion remains blocked until the RC evidence manifest, live-only register, package smokes, and release wording are current.
- 2026-05-06: PRs #534-#536 merged the desktop release surface, core correctness fixes, and full evidence output fixes onto `origin/main` at `1075f81`. Post-merge `pnpm rc:desktop-gate`, `pnpm test:security`, and `pnpm evidence:manifest -- --require=rc` passed; the next RC gate is full release evidence regeneration and live-only freshness, not desktop implementation.

## Desktop Production Track Before RC

This track is now the pre-RC product queue. It does not make desktop a stable public surface by itself. It makes the Tauri app good enough to include in the release-candidate evidence cycle without inventing desktop-only review semantics.

Desktop must stay a host for the existing CodeAgora system:

- Reviews run through the same CLI/core/MCP contracts as supported surfaces.
- Config files validate against the same core schemas.
- Sessions are read from the same versioned artifact contract.
- Desktop state may cache UI preferences, but it must not fork verdict, issue, cost, provider, or session truth.
- Any desktop claim in README, release notes, docs, or UI must be backed by a smoke command or captured artifact.

### Desktop Master Checklist

- [x] D0: Freeze desktop contract and command boundary.
- [x] D1: Implement repository/workspace opening and trust model.
- [x] D2: Bridge review execution to CLI/core without duplicating orchestration.
- [x] D3: Stream progress, logs, cancellation, and degraded states.
- [x] D4: Build a session explorer over the versioned `.ca/sessions` contract.
- [x] D5: Build diff, finding, verdict, cost, and export views.
- [x] D6: Build config studio with schema validation and rollback-safe writes.
- [x] D7: Build provider/model setup and health views.
- [x] D8: Build MCP manager for install, startup, tools, and smoke checks.
- [x] D9: Build GitHub Action setup and workflow validation views.
- [x] D10: Build local benchmark/evidence viewer for release artifacts.
- [x] D11: Add security, privacy, permissions, and redaction boundaries.
- [x] D12: Add export/integration flows without changing canonical artifacts.
- [x] D13: Add packaging, signing/notarization/update-channel plan, and app smoke.
- [x] D14: Close desktop RC gates with automated and manual evidence.
- [x] D15: Add RC handoff gate so CLI/GitHub/MCP evidence refresh runs only after desktop gates close.

### D0: Desktop contract and command boundary

**Finding:** The desktop app can become expensive to stabilize if it grows a second review engine, config model, or session format.

**Required work:**

- Define the desktop as a UI host over existing CLI/core/MCP contracts.
- Inventory every Tauri command and classify it as read-only, mutation, process execution, or external integration.
- Version the desktop command payloads that cross the frontend/Tauri boundary.
- Add a command-permission matrix for repository access, config writes, process spawning, and network/provider checks.
- Decide the minimum private-preview promise: local repo open, review run, session browse, config edit, provider setup, MCP setup, GitHub Action setup, and packaged app smoke.

**Likely files:**

- `packages/desktop/src-tauri/src/main.rs`
- `packages/desktop/src-tauri/tauri.conf.json`
- `packages/desktop/src/`
- `docs/DESKTOP_PREVIEW.md`
- `docs/AGENT_CONTRACT.md`

**Evidence:**

- Tauri command contract doc exists.
- `pnpm --filter @codeagora/desktop typecheck` passes.
- `pnpm --filter @codeagora/desktop tauri:check` passes.

### D1: Repository and workspace layer

**Finding:** Desktop cannot be useful until it opens real repositories safely and understands CodeAgora workspace state without guessing.

**Required work:**

- Implement repository picker/open-recent flow with clear current workspace state.
- Detect `.git`, branch, head SHA, changed files, `.ca/`, config files, `.reviewignore`, and `.reviewrules`.
- Show repository trust state before running review commands or reading broad file content.
- Handle empty repos, non-git folders, nested worktrees, detached HEAD, large diffs, and missing config.
- Keep recent repositories in desktop UI state only; do not mutate project files until the user edits config or starts a review.

**Likely files:**

- `packages/desktop/src/`
- `packages/desktop/src-tauri/src/main.rs`
- `packages/cli/src/commands/status.ts`
- `packages/core/src/session/queries.ts`

**Evidence:**

- Smoke opens a temp git repo and a non-git folder.
- UI shows branch/head/diff/config/session state from real commands.
- No project file changes occur during read-only open.

### D2: Review execution engine bridge

**Finding:** Desktop-triggered review must produce the same verdict, findings, sessions, and degraded metadata as CLI review for the same diff/config.

**Required work:**

- Invoke the existing CLI/core review path through a controlled Tauri process bridge or shared package API.
- Sanitize all spawned arguments with the same standards used by CLI code.
- Support review modes required for preview: current diff, staged diff, patch file, quick mode, no-discussion, JSON/NDJSON, provider-free dry-run where available.
- Persist sessions in the canonical `.ca/sessions` layout.
- Record command, cwd, package version, config path, base/head refs, and cache/degraded metadata.

**Likely files:**

- `packages/desktop/src-tauri/src/main.rs`
- `packages/desktop/src/`
- `packages/cli/src/commands/review.ts`
- `packages/core/src/pipeline/orchestrator.ts`
- `packages/core/src/session/manager.ts`

**Evidence:**

- Desktop review smoke and CLI review smoke run against the same fixture diff and produce matching verdict/finding counts.
- Cancellation leaves a readable degraded or cancelled session artifact.
- Argument-injection fixture fails safely.

### D3: Progress, logs, cancellation, and degraded states

**Finding:** A desktop app that only shows final output is not production-quality for long multi-model reviews.

**Required work:**

- Stream reviewer, analyzer, debate, head verdict, cost, cache, and degraded events into the UI.
- Add cancel/stop behavior that terminates spawned children and records final state.
- Separate user-facing progress from raw logs.
- Show provider failures, missing secrets, oversized diffs, timeouts, and partial reviewer failures as structured states.
- Keep raw logs available for export without exposing secrets in the main UI.

**Likely files:**

- `packages/desktop/src/`
- `packages/desktop/src-tauri/src/main.rs`
- `packages/core/src/pipeline/orchestrator.ts`
- `packages/cli/src/formatters/ndjson.ts`

**Evidence:**

- Progress smoke captures at least start, analyzer, reviewer, verdict, and complete events.
- Cancellation smoke confirms no orphan child process remains.
- Degraded fixture renders a structured reason code, not a stack trace.

### D4: Session explorer

**Finding:** Desktop should make existing sessions inspectable; it must not introduce a parallel history format.

**Required work:**

- List sessions from `.ca/sessions` with verdict, date, branch, head SHA, provider, cost, issue counts, and degraded state.
- Open a session and render metadata, result, report, findings, trace, costs, and telemetry when present.
- Handle old/best-effort sessions gracefully.
- Add search/filter by verdict, severity, file, branch, provider, and date.
- Link from a completed desktop review directly into its saved session.

**Likely files:**

- `packages/desktop/src/`
- `packages/core/src/session/queries.ts`
- `packages/cli/src/commands/sessions.ts`
- `docs/AGENT_CONTRACT.md`

**Evidence:**

- Session explorer fixture reads normal, cache-hit, empty-diff, quick, degraded, and old-session artifacts.
- CLI `sessions show` and desktop session detail agree on core metadata.

### D5: Diff, finding, verdict, cost, and export views

**Finding:** The desktop UI needs a review workspace, not just a text dump.

**Required work:**

- Render file tree, diff hunks, inline findings, severity, confidence, evidence quote, model provenance, and final verdict.
- Provide triage states local to UI: unread, accepted, ignored, needs follow-up. These must not rewrite canonical review findings unless exported explicitly.
- Show cost, token, duration, model, cache, and degraded summaries.
- Export markdown, JSON, SARIF, and copied GitHub-ready summaries from canonical artifacts.
- Preserve exact file paths and line ranges from session output.

**Likely files:**

- `packages/desktop/src/`
- `packages/cli/src/formatters/review-output.ts`
- `packages/github/src/sarif.ts`
- `packages/core/src/session/queries.ts`

**Evidence:**

- Fixture with more than five findings proves no UI truncation changes export content.
- Exported JSON/SARIF/markdown match CLI output for the same session.

### D6: Config studio

**Finding:** Config editing is a production risk because invalid writes can break CLI, MCP, and GitHub Action flows.

**Required work:**

- Read `.ca/config.{json,yml,yaml}` and show provider, backend, models, thresholds, personas, rules, language, and output settings.
- Validate every edit against the core config schema before writing.
- Write atomically and preserve a rollback copy on failure.
- Support generated defaults and `agora init` compatibility.
- Surface schema errors with field-level messages.
- Avoid desktop-only config keys inside canonical CodeAgora config; keep desktop UI preferences separate.

**Likely files:**

- `packages/desktop/src/`
- `packages/desktop/src-tauri/src/main.rs`
- `packages/core/src/config/loader.ts`
- `packages/core/src/config/validator.ts`
- `packages/cli/src/commands/config-set.ts`

**Evidence:**

- Invalid edit leaves previous config unchanged.
- CLI review accepts a config written by desktop.
- Desktop can load configs generated by `agora init --yes`.

### D7: Provider and model operations

**Finding:** Users need to know whether providers and selected models are usable before launching a long review.

**Required work:**

- Detect provider env vars without printing secret values.
- Show configured provider/backend/model selection and supported/experimental status.
- Add provider health checks that are explicit, cancellable, and redacted.
- Show pricing/model metadata from the same runtime data used by CLI/MCP.
- Provide a safe setup path for local environment guidance without storing API keys in project files by default.

**Likely files:**

- `packages/desktop/src/`
- `packages/core/src/l0/model-registry.ts`
- `packages/core/src/pipeline/cost-estimator.ts`
- `packages/core/src/types/config.ts`
- `docs/PROVIDERS.md`

**Evidence:**

- Health-check smoke covers missing key, invalid provider, and provider-free dry-run paths.
- Pricing/model data visible in desktop matches CLI model/cost output.
- Secret redaction test proves keys are not displayed or exported.

### D8: MCP manager

**Finding:** MCP is a first-class CodeAgora surface, so desktop should help install and verify it without hiding the underlying contract.

**Required work:**

- Show MCP package/version, server command, tool list, and configured client snippets.
- Start the MCP server in a controlled smoke mode and call `tools/list`.
- Exercise at least one provider-free MCP tool path where available.
- Render structured MCP errors and schema validation failures.
- Export MCP config snippets for common clients without writing external app config unless explicitly requested.

**Likely files:**

- `packages/desktop/src/`
- `packages/desktop/src-tauri/src/main.rs`
- `packages/mcp/src/server.ts`
- `packages/mcp/src/tools/`
- `docs/MCP_SERVER.md`

**Evidence:**

- Desktop MCP smoke starts server, lists all advertised tools, and closes cleanly.
- Tool list matches docs and package smoke output.
- Invalid MCP input renders structured errors.

### D9: GitHub Action manager

**Finding:** Desktop should reduce setup mistakes for the GitHub Action, but it must not claim live PR behavior until the workflow path is actually tested.

**Required work:**

- Detect existing `.github/workflows` CodeAgora configuration.
- Generate or preview Action workflow snippets that match current beta/stable wording.
- Validate `config-path`, permissions, checkout depth, PR events, skip labels, and `fail-on-reject` choices.
- Explain SARIF handoff as generated artifact or upload step according to current docs.
- Show last known evidence run links only when they are current and captured.

**Likely files:**

- `packages/desktop/src/`
- `packages/cli/src/commands/init.ts`
- `action.yml`
- `docs/5_GITHUB_INTEGRATION.md`
- `docs/RELEASE_EVIDENCE.md`

**Evidence:**

- Generated workflow snippet matches README/action docs.
- Workflow validation fixture catches missing permissions and invalid config path.
- Desktop does not imply PR posting is verified without linked Action evidence.

### D10: Quality and benchmark lab

**Finding:** The desktop app should expose evidence and benchmark state, not create new unverified accuracy claims.

**Required work:**

- List local benchmark reports and release evidence manifests.
- Render recall, precision, F1, false-positive regression, fixture count, model pool, and run metadata.
- Mark stale evidence when package version, model pool, severity semantics, or stable wording changes.
- Provide run buttons only for existing benchmark scripts or clearly label commands as manual.
- Link benchmark results back to docs evidence files.

**Likely files:**

- `packages/desktop/src/`
- `scripts/benchmark-ci.mjs`
- `docs/RELEASE_EVIDENCE.md`
- `docs/live-benchmark-report.md`
- `.sisyphus/evidence/`

**Evidence:**

- Desktop renders the current live benchmark artifact and detects stale package/version metadata.
- Benchmark view numbers match the source report exactly.

### D11: Security, privacy, and permissions

**Finding:** A local desktop app can read repositories, spawn commands, and display logs. Production readiness needs explicit boundaries.

**Required work:**

- Add allowlisted Tauri commands and path-scoped file access.
- Require explicit workspace trust before review execution or broad file scanning.
- Redact API keys, tokens, Authorization headers, and provider secrets from UI logs and exports.
- Prevent command injection through repo paths, config paths, branch names, and patch paths.
- Document local-only storage and what is written under project `.ca/` versus desktop app state.

**Likely files:**

- `packages/desktop/src-tauri/src/main.rs`
- `packages/desktop/src-tauri/tauri.conf.json`
- `packages/desktop/src/`
- `docs/DESKTOP_PREVIEW.md`
- `docs/SECURITY.md`

**Evidence:**

- Security regression suite includes desktop command/path/secret-redaction cases.
- Manual smoke confirms app does not display raw provider secrets.
- Desktop docs list file writes and process spawning behavior.

### D12: Export and integration flows

**Finding:** Desktop output should be useful in real workflows while keeping canonical artifacts unchanged.

**Required work:**

- Export current session as markdown, JSON, SARIF, and evidence bundle.
- Copy GitHub-ready PR summary from session data.
- Open session folder and report files from the UI.
- Support re-run/replay entrypoints only through existing CLI/core semantics.
- Make exports deterministic enough for release evidence.

**Likely files:**

- `packages/desktop/src/`
- `packages/desktop/src-tauri/src/main.rs`
- `packages/cli/src/commands/replay.ts`
- `packages/cli/src/formatters/review-output.ts`

**Evidence:**

- Export fixture compares desktop export with CLI formatter output.
- Evidence bundle includes session id, version, command metadata, and artifact manifest.

### D13: Packaging, signing, updater, and app smoke

**Finding:** `tauri:check` proves Rust/TypeScript integration compiles, but production RC needs package-level app behavior.

**Required work:**

- Define supported desktop platforms for private preview.
- Add app icon, bundle metadata, entitlement/capability settings, and updater-channel decision.
- Decide whether signing/notarization is required for private preview or only for public desktop launch.
- Add packaged app smoke for launch, repo open, config read, session read, and provider-free dry-run where available.
- Keep desktop package artifacts outside stable/latest release claims until private-preview signoff.

**Likely files:**

- `packages/desktop/src-tauri/tauri.conf.json`
- `packages/desktop/src-tauri/Cargo.toml`
- `packages/desktop/package.json`
- `packages/desktop/src/`
- `.github/workflows/`
- `docs/RELEASE_CHECKLIST.md`

**Evidence:**

- `pnpm --filter @codeagora/desktop tauri:check` passes.
- `pnpm --filter @codeagora/desktop smoke` passes as the package-equivalent private-preview app smoke.
- `pnpm --filter @codeagora/desktop evidence` writes `.sisyphus/evidence/desktop-evidence-manifest.json`.
- `pnpm --filter @codeagora/desktop macos:webdriver-e2e` passes on macOS preview hardware.
- `pnpm --filter @codeagora/desktop bundle:smoke` validates the generated private-preview bundle shape.
- `docs/DESKTOP_PREVIEW.md` and the desktop evidence manifest record signing/notarization/updater decisions as deferred until public desktop launch.

### D14: Desktop release gates

**Finding:** Desktop should not enter RC by assumption. It needs the same kind of explicit gate closure used for CLI/GitHub/MCP beta readiness.

**Required work:**

- Add a desktop evidence manifest with command outputs, screenshots where useful, app version, OS, architecture, and package source.
- Add automated smoke commands for read-only open, config load/edit validation, session browse, review dry-run, MCP tools/list, export, and cancellation.
- Add manual smoke checklist for first-run UX, provider setup, large diff handling, degraded state display, and app restart persistence.
- Sync desktop claims across README, changelog, release notes, `docs/DESKTOP_PREVIEW.md`, and release checklist.
- Document known limitations as private-preview limitations, not stable guarantees.

**Likely files:**

- `scripts/desktop-smoke.mjs`
- `docs/DESKTOP_PREVIEW.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/RELEASE_EVIDENCE.md`
- `README.md`
- `CHANGELOG.md`

**Evidence:**

- Desktop evidence manifest exists for the RC candidate.
- Automated desktop smoke passes from a packaged or package-equivalent app.
- `pnpm rc:desktop-gate` passes and captures `desktop-gate.log` plus `.sisyphus/evidence/desktop-evidence-manifest.json`.
- Manual smoke checklist is documented in `docs/DESKTOP_PREVIEW.md` and must be signed off before an RC branch/tag.

### D15: RC handoff after desktop

**Finding:** Once desktop gates close, CLI/GitHub/MCP evidence must be refreshed because release claims and package shape may have changed.

**Required work:**

- Re-run package dry-runs and tarball-installed CLI/MCP smokes.
- Re-run CI, build, typecheck, unit tests, benchmark CI, beta smoke, and desktop smoke.
- Refresh live-only evidence where stable or RC wording depends on it: GitHub Action PR smoke, oversized diff/degraded behavior, and live benchmark report.
- Ensure npm dist-tags, GitHub prerelease state, release notes, and docs avoid stable/latest wording until RC promotion is approved.
- Create RC evidence bundle only after desktop and existing supported surfaces are green.

**Evidence:**

- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm bench:ci`
- `pnpm release:beta-smoke`
- `pnpm --filter @codeagora/desktop typecheck`
- `pnpm --filter @codeagora/desktop build`
- `pnpm --filter @codeagora/desktop tauri:check`
- `pnpm --filter @codeagora/desktop app:e2e`
- `pnpm --filter @codeagora/desktop macos:webdriver-e2e`
- `pnpm --filter @codeagora/desktop smoke`
- `pnpm --filter @codeagora/desktop evidence`
- `pnpm --filter @codeagora/desktop bundle:smoke`
- `pnpm rc:desktop-gate`
- Current release evidence manifest with package, desktop, Action, MCP, CLI, benchmark, and skipped/live-only classifications.

## P0: Release-Blocking Correctness

### Fix default config generation

**Finding:** `buildDefaultConfig('groq')` currently fails schema validation because generated defaults do not satisfy required `supporters.pool`, `supporters.devilsAdvocate`, `supporters.personaPool`, and `discussion.registrationThreshold` fields.

**Surface:** CLI first-run, inline setup, no-config review path.

**Required work:**

- Add a regression test that calls `buildDefaultConfig()` and validates the result.
- Make generated defaults satisfy the current `ConfigSchema` without weakening the schema.
- Exercise the no-config provider-detection path that writes or uses this default.
- Confirm minimal generated config still preserves intended L2 behavior: supporter pool, devil's advocate, persona assignment, moderator, and thresholds.

**Likely files:**

- `packages/core/src/config/loader.ts`
- `packages/core/src/types/config.ts`
- `packages/cli/src/utils/inline-setup.ts`
- `packages/cli/src/commands/review.ts`
- `src/tests/config-loader-functions.test.ts`
- `packages/cli/src/tests/cli-review.test.ts`

**Evidence:**

- `pnpm test` includes the regression.
- `pnpm typecheck` passes.
- Manual smoke covers a no-config CLI setup/review path.

### Fix package entrypoint and type declaration contracts

**Finding:** `packages/core/package.json` and `packages/shared/package.json` point bare package imports to `dist/index.js` and, for shared, `dist/index.d.ts`, but these packages intentionally use subpath imports and do not currently build root `src/index.ts` barrels or declarations.

**Surface:** Published package correctness, workspace API contract, downstream import behavior.

**Required work:**

- Decide whether `@codeagora/core` and `@codeagora/shared` expose bare package entrypoints.
- If yes, add explicit public `src/index.ts` barrels and generated declarations.
- If no, remove or correct bare `exports['.']`, `main`, and `types` fields so package metadata matches supported subpaths.
- Add package-shape tests that verify supported import paths from packed artifacts, not only source aliases.
- Document the supported import policy so future code does not rely on accidental package internals.

**Likely files:**

- `packages/core/package.json`
- `packages/shared/package.json`
- `packages/core/tsup.config.ts`
- `packages/shared/tsup.config.ts`
- `scripts/verify-package-contents.mjs`
- `src/tests/package-contents.test.ts`

**Evidence:**

- Root and MCP package dry-runs pass.
- Packed-package import smoke passes for every documented public import.
- `scripts/verify-package-contents.mjs` or equivalent checks entrypoint/type files.

### Make review caching sound or opt-in

**Finding:** Review cache correctness depends on more than diff content and config. A stale cache can hide changed `.reviewignore`, `.reviewrules`, learned suppressions, source context, analyzer behavior, or CodeAgora version changes.

**Surface:** Core pipeline cache, CLI `--no-cache`, session output, benchmark/review trust.

**Required work:**

- Decide whether cache is safe by default or should become opt-in until invalidation is proven.
- Include all context-affecting inputs in cache keys: `.reviewignore`, `.reviewrules`, learned patterns, review context, relevant source snippets, analyzer/version identifiers, and CodeAgora version.
- Add tests proving cache invalidates when rules, ignore patterns, learned suppressions, or relevant source context changes.
- Surface cache hits in JSON/NDJSON, MCP, GitHub summaries, and session metadata so users know when output was reused.

**Likely files:**

- `packages/core/src/pipeline/cache-manager.ts`
- `packages/core/src/pipeline/orchestrator.ts`
- `packages/core/src/rules/loader.ts`
- `packages/core/src/learning/store.ts`
- `src/tests/pipeline-cache.test.ts`

**Evidence:**

- Cache tests cover every input class that changes review meaning.
- Cache-hit metadata is visible in machine-readable output and session artifacts.

### Define stable session artifact contract

**Finding:** Agent-facing session JSON is documented, but pipeline terminal paths and session readers/writers can diverge on artifact names and required files. Stable explain/replay/sessions/costs/trace behavior needs a versioned session artifact contract.

**Surface:** `.ca/sessions`, CLI sessions/explain/replay/trace/costs, MCP explain/session tools, desktop session browsing.

**Required work:**

- Define versioned required artifacts such as `metadata.json`, `result.json`, verdict/report markdown, telemetry, and optional raw logs.
- Require every terminal path to persist compatible artifacts: normal review, quick/skip-head, cache hit, empty diff, auto-approve, degraded/error.
- Add session contract tests for `sessions list/show`, `explain`, `replay`, `trace`, `costs`, and MCP explain. Desktop session browsing remains private-preview validation and must not block stable CLI/GitHub/MCP release gates until desktop graduates into the supported surface.
- Document migration behavior for old sessions or mark old sessions best-effort only.

**Likely files:**

- `packages/core/src/session/manager.ts`
- `packages/core/src/session/queries.ts`
- `packages/core/src/l3/writer.ts`
- `packages/core/src/pipeline/orchestrator.ts`
- `packages/core/src/pipeline/cache-manager.ts`
- `packages/cli/src/commands/explain.ts`
- `packages/cli/src/commands/sessions.ts`
- `packages/cli/src/commands/replay.ts`
- `packages/desktop/src-tauri/src/main.rs`
- `docs/AGENT_CONTRACT.md`

**Evidence:**

- Every terminal pipeline path produces a session readable by CLI, MCP, and desktop readers.
- Session schema version is documented and tested.

### Validate config mutations and backend contracts

**Finding:** Roadmap coverage for generated config does not cover user-facing config mutations. `config-set` and language commands can rewrite config files, and strict backend validation can drift from the backend schema/executor.

**Surface:** CLI config editing, backend selection, schema/validator consistency.

**Required work:**

- Validate config files after every user-facing mutation before writing or commit the old file back on failure.
- Add tests proving invalid `config set` mutations are rejected without corrupting existing config.
- Align `BackendSchema`, backend executor support, strict config validation, provider docs, and init model selection.
- Add a schema/validator parity test for every backend listed as supported or experimental.

**Likely files:**

- `packages/cli/src/commands/config-set.ts`
- `packages/cli/src/commands/language.ts`
- `packages/core/src/types/config.ts`
- `packages/core/src/config/validator.ts`
- `packages/core/src/l1/backend.ts`
- `docs/PROVIDERS.md`
- `src/tests/config-strict.test.ts`
- `packages/cli/src/tests/cli-config-set.test.ts`

**Evidence:**

- Invalid mutations leave the previous config unchanged.
- Strict validation and backend execution agree on supported backend names.
- JSON and YAML mutation limitations are documented and tested.

### Prove config/setup paths with real artifacts

**Finding:** Existing tests are broad, but config defaults, generated init files, and packed-package behavior need explicit end-to-end protection because they are easy to regress while source tests still pass.

**Surface:** CLI setup, generated `.ca/config.*`, release package contents.

**Required work:**

- Add regression coverage for `agora init --yes` output validity.
- Add coverage for JSON and YAML config generated by templates/presets.
- Add packed CLI smoke that uses the built CLI rather than only source imports.
- Verify first-run behavior in an empty temporary repository and in a repository with existing `.ca/config.*`.

**Likely files:**

- `packages/cli/src/commands/init.ts`
- `packages/cli/src/commands/register-init.ts`
- `packages/core/src/config/templates.ts`
- `scripts/beta-smoke.mjs`
- `src/tests/cli-init-ci.test.ts`
- `src/tests/config-templates.test.ts`

**Evidence:**

- Generated config validates with `validateConfig`.
- `pnpm release:beta-smoke` covers the packed CLI path.
- Clean checkout run records package dry-run contents.

### Exercise packaged lazy runtime data paths

**Finding:** Current package smoke starts binaries and lists MCP tools, but some runtime paths lazy-read pricing/model data. A package can pass help/tools-list smoke while later review/model/cost paths fail after publish.

**Surface:** CLI/MCP packaged runtime, model registry, cost estimation, benchmark/report commands.

**Required work:**

- Add tarball install smoke that runs a command touching model registry and pricing data.
- Add MCP package smoke beyond `tools/list`, using `dry_run` or another provider-free review path that loads core runtime data.
- Ensure packaged files include any JSON/data assets required outside bundled code, or ensure bundling inlines them reliably.
- Add regression coverage for packaged `models`, `costs`, `dry-run`, and MCP `dry_run` where feasible.

**Likely files:**

- `scripts/beta-smoke.mjs`
- `scripts/verify-package-contents.mjs`
- `packages/core/src/pipeline/cost-estimator.ts`
- `packages/core/src/l0/model-registry.ts`
- `packages/mcp/package.json`
- `package.json`

**Evidence:**

- Tarball-installed CLI can run `agora --help` plus at least one provider-free command that reads model/pricing data.
- Tarball-installed MCP can initialize, list tools, and execute a provider-free tool path.

## P1: Public Surface Accuracy

### Make review input processing non-mutating

**Finding:** Review commands must not modify user-supplied patch files while preparing filtered input. Stable CLI behavior should treat explicit diff files as read-only inputs unless a command is clearly documented as an editor/mutator.

**Surface:** CLI `agora review <diff>`, `--scope`, patch-file workflows, agent automation.

**Required work:**

- Ensure scope filtering writes to a temporary diff or passes filtered content in memory.
- Add regression tests proving explicit diff files are unchanged after scoped review.
- Document whether scoped review applies only to review input or also to persisted session diff artifacts.
- Include the bad-input path: invalid scope should fail without modifying the original diff.

**Likely files:**

- `packages/cli/src/commands/review.ts`
- `packages/cli/src/options/review-options.ts`
- `src/tests/cli-review-options.test.ts`
- `packages/cli/src/tests/cli-review.test.ts`
- `docs/CLI_REFERENCE.md`

**Evidence:**

- `agora review changes.diff --scope ...` leaves `changes.diff` byte-for-byte unchanged.
- Session artifacts record the filtered diff separately from the original input path.

### Keep CLI help and reference docs in lockstep

**Finding:** The CLI reference can drift from implemented command options and generated help text. Stable CLI support requires users, agents, and CI systems to see the same options in code, help, and docs.

**Surface:** CLI help, `docs/CLI_REFERENCE.md`, agent contract, command tests.

**Required work:**

- Add a parity test or docs check for `agora review --help` versus `docs/CLI_REFERENCE.md` for stable options.
- Ensure options such as failure gates, scope selection, output modes, timeout controls, quick/no-discussion modes, and PR review options are documented consistently.
- Mark beta-changing presentation formats separately from stable JSON/NDJSON contracts.

**Likely files:**

- `packages/cli/src/commands/review.ts`
- `packages/cli/src/commands/help-text.ts`
- `docs/CLI_REFERENCE.md`
- `docs/AGENT_CONTRACT.md`
- `src/tests/cli-review-options.test.ts`

**Evidence:**

- Help output and CLI reference expose the same supported stable options.
- Tests fail when a stable CLI option is added without docs.

### Align README and Action versioning

**Finding:** README examples still show `uses: bssm-oss/CodeAgora@v2` while the current package line is `@codeagora/review@0.1.0-beta.1` and docs position `codeagora@2.x` as legacy.

**Surface:** README, Action onboarding, release notes.

**Required work:**

- Decide the beta Action ref users should install from.
- Update README and Action docs so legacy and beta guidance cannot be confused.
- State clearly whether `v2` is legacy, beta-compatible, or only an example placeholder.
- Add a release-note rule: prerelease examples must not imply `latest` or stable support.

**Likely files:**

- `README.md`
- `docs/CLI_REFERENCE.md`
- `docs/EXTENSIONS.md`
- `docs/RELEASE_CHECKLIST.md`
- `action.yml`
- `.github/workflows/release.yml`

**Evidence:**

- README, `docs/CLI_REFERENCE.md`, `docs/EXTENSIONS.md`, `docs/RELEASE_CHECKLIST.md`, and `action.yml` agree on install/version language.

### Align Action skip, output, and blocking contracts

**Finding:** Public Action behavior has multiple contract edges: README promises `review:skip`; generated workflows implement skip labels; the composite Action itself does not. Action output docs omit `SKIPPED`; default blocking behavior differs between `action.yml` and generated init workflows.

**Surface:** GitHub Action onboarding, generated workflows, Action outputs, merge-blocking behavior.

**Required work:**

- Decide whether label-based skip belongs in the composite Action or only in caller workflows, then document it consistently.
- Wire and test every advertised Action input end-to-end, especially `config-path`.
- Include every possible `verdict` output value, including skipped/degraded cases, in `action.yml` and docs.
- Align `fail-on-reject` defaults across README, generated init workflows, and Action metadata, or explicitly explain why they differ.
- Add tests for Action argument parsing/output mapping for skipped, custom config, invalid config, and degraded scenarios.

**Likely files:**

- `README.md`
- `action.yml`
- `packages/github/src/action.ts`
- `packages/github/src/poster.ts`
- `packages/cli/src/commands/init.ts`
- `docs/5_GITHUB_INTEGRATION.md`
- `src/tests/github-action-parse-args.test.ts`
- `src/tests/github-actions-runtime.test.ts`
- `packages/github/src/tests/github-poster.test.ts`

**Evidence:**

- Users can predict whether a PR will be skipped or merge-blocked from README alone.
- `config-path` changes the runtime config or fails/degrades explicitly when invalid.
- Action metadata includes all output enum values actually emitted.

### Clarify SARIF behavior

**Finding:** GitHub integration code can generate SARIF output, but current Action behavior should not imply automatic Code Scanning upload unless the Action actually uploads or documents the handoff.

**Surface:** GitHub Action, docs, release claims.

**Required work:**

- Decide whether the Action should upload SARIF itself or only write a SARIF file.
- If uploading, add an Action step or documented workflow using GitHub CodeQL upload.
- If not uploading, revise docs to say SARIF is generated for downstream upload.
- Verify path validation for user-provided SARIF output paths remains enforced.

**Likely files:**

- `packages/github/src/sarif.ts`
- `packages/github/src/action.ts`
- `action.yml`
- `docs/5_GITHUB_INTEGRATION.md`
- `src/tests/github-sarif.test.ts`
- `src/tests/github-action-sarif-path.test.ts`

**Evidence:**

- Action smoke verifies the chosen SARIF path.
- Docs include exact artifact path or upload step.

### Align SARIF content across CLI, MCP, and Action

**Finding:** Even if SARIF generation/upload is clarified, stable readiness also needs the SARIF content contract to match across surfaces. A renderer that only emits summarized/top issues can disagree with GitHub Action output that uses full evidence.

**Surface:** CLI `--output sarif`, MCP `output_format: "sarif"`, GitHub Action SARIF artifacts.

**Required work:**

- Decide whether SARIF output is a full findings artifact or a presentation summary.
- Ensure CLI, MCP, and Action SARIF use the same source issue set or clearly document intentional differences.
- Add regression tests with more than five findings so truncation or summary-only behavior is visible.
- Keep SARIF marked beta-changing unless the content contract is versioned.

**Likely files:**

- `packages/cli/src/formatters/review-output.ts`
- `packages/github/src/sarif.ts`
- `packages/github/src/action.ts`
- `docs/CLI_REFERENCE.md`
- `docs/AGENT_CONTRACT.md`
- `src/tests/github-sarif.test.ts`
- `src/tests/cli-output-formats.test.ts`

**Evidence:**

- CLI/MCP/Action SARIF fixture outputs agree on finding count and severity mapping, or docs explicitly mark the differences.

### Prove live GitHub Action behavior

**Finding:** Static code and local smoke support the Action path, but stable readiness needs real PR evidence across normal and degraded conditions.

**Surface:** GitHub Action, PR comments, commit status, fork safety.

**Required work:**

- Run a representative same-repo PR smoke with posting enabled.
- Run or simulate fork PR/missing-secret behavior and confirm no secret leakage.
- Verify stale-head/force-push handling blocks or clearly marks outdated results.
- Verify oversized diff behavior and retained-priority metadata.
- Capture screenshots or copied PR comment/status output when possible so the user-facing surface is auditable.

**Scenario matrix:**

| Scenario | Expected result |
|----------|-----------------|
| Same-repo PR with secrets | Review posts summary, inline comments, status, and session output |
| Fork PR without secrets | Review skips or degrades clearly without exposing secrets |
| Force-pushed PR | Stale `headSha` output is blocked or marked degraded |
| Oversized diff | Review explains truncation and retained priority files |
| Provider failure | Action produces structured degraded output, not raw stack traces |
| Invalid inline position / 422 | Retry path is side-effect safe: no duplicate probe reviews/comments, dropped comment count is surfaced |

**Evidence:**

- Linked workflow run IDs or stored `.sisyphus/evidence/` logs.
- Captured Action outputs: `verdict`, `review-url`, `session-id`, `degraded`, `degraded-reason`, `head-sha`, `base-sha`.
- 422 retry evidence proves fallback does not create duplicate review side effects.

### Improve degraded diagnostics and observability

**Finding:** Core layers intentionally degrade through skipped pre-analysis, partial reviewer failures, suggestion-verifier failures, supporter failures, and L3 fallback. That is good for resilience, but users need structured visibility when review quality degraded.

**Surface:** CLI JSON/NDJSON, GitHub summary, MCP responses, session artifacts.

**Required work:**

- Normalize degraded reason codes across CLI, Action, MCP, and sessions.
- Include provider failure, missing key, timeout, skipped analyzer, stale SHA, oversized diff, and suggestion-verification failure in structured output.
- Keep human text concise while preserving machine-readable diagnostics.
- Add a small reason-code registry so docs, tests, and implementation cannot drift independently.

**Candidate reason codes:**

```txt
missing_config
missing_secret
provider_auth_failed
provider_rate_limited
provider_timeout
reviewer_forfeited
preanalysis_skipped
suggestion_verification_failed
stale_head_sha
large_diff_truncated
sarif_write_failed
posting_degraded
```

**Evidence:**

- Tests assert degraded fields and reason codes for each supported surface.
- Manual CLI and MCP smoke show degraded paths without raw provider exceptions.

### Make MCP all-tool errors contract-compliant

**Finding:** The agent contract promises structured MCP errors, but stable readiness must cover every MCP tool, not just review tools. Non-review tools should not return ad-hoc text errors or unversioned `{ "error": ... }` shapes when callers expect stable `status`, `code`, `message`, and optional `details`.

**Surface:** MCP `explain_session`, `get_stats`, `get_leaderboard`, `config_get`, `config_set`, and review tools.

**Required work:**

- Define shared MCP error helpers for all tools.
- Give every tool stable error codes and tests for invalid input, missing session/config, inaccessible repo path, and write failures.
- Keep compact success output separate from structured error output.
- Update `docs/AGENT_CONTRACT.md` and `packages/mcp/README.md` with all stable tool error codes.

**Likely files:**

- `packages/mcp/src/tools/*.ts`
- `packages/mcp/src/tools/shared-response.ts`
- `packages/mcp/src/tests/tool-handlers.test.ts`
- `packages/mcp/src/tests/critical-errors.test.ts`
- `docs/AGENT_CONTRACT.md`
- `packages/mcp/README.md`

**Evidence:**

- Every MCP tool has tests for both success and structured failure.
- No MCP tool returns plain `Error: ...` text for a stable error path.

## P2: Evidence And Stable Claims

### Separate deterministic gates from live quality evidence

**Finding:** `pnpm bench:ci` is strong as a provider-free schema/reference gate, but it does not replace fresh live review evidence for stable accuracy claims.

**Surface:** Benchmarks, README claims, release notes.

**Required work:**

- Keep `pnpm bench:ci` as the deterministic release gate.
- Produce at least one fresh stable-candidate live benchmark report before stable wording or `latest` promotion.
- Record provider/model set, config, fixture list, TP/FP/FN, precision, recall, F1, latency, cost/token availability, and provider failure notes.
- Keep composite or targeted reruns labeled as such.
- Include at least one clean-diff or FP-regression fixture in any public quality claim so recall does not hide false positives.

**Minimum report fields:**

```txt
run_id
commit_sha
config_path
provider_model_set
fixtures_run
recall_fixtures
fp_regression_fixtures
tp/fp/fn
precision/recall/f1
recall@3/5/10
latency_wall_ms
backend_latency_ms
cost_or_token_usage
provider_failures
known_limitations
artifact_path
```

**Evidence:**

- Updated benchmark report under `docs/`.
- Live result directory uploaded as CI/release artifact, not committed as `bench-out*`.

### Add cross-surface parity evidence

**Finding:** CLI, GitHub Action, and MCP all route through shared code, but stable readiness needs explicit proof that the same diff/config produces equivalent decisions and issue shapes.

**Surface:** CLI, GitHub Action, MCP.

**Required work:**

- Add parity fixtures for CLI JSON, MCP JSON, and Action session output.
- Assert stable schema version, verdict, issue count, severity mapping, session IDs, and degraded fields.
- Keep exact prose out of snapshots where LLM output is nondeterministic.
- Prefer fixture diffs and mock backends so parity tests remain deterministic and provider-free.

**Parity contract:**

- Same verdict class for equivalent inputs.
- Same active issue identities after dedup/filtering.
- Same severity ordering and confidence ranges.
- Same degraded reason codes for equivalent failure modes.
- Same redaction behavior for secrets in outward-facing output.

**Evidence:**

- `pnpm test` includes deterministic parity tests.
- Manual smoke covers at least one real CLI and MCP run from built artifacts.

### Account for skipped and live-only tests

**Finding:** The default test suite can pass while live E2E tests remain skipped. Stable readiness needs an explicit skipped-test register and a separate manual/live workflow so skipped live coverage is not mistaken for completed product evidence.

**Surface:** Vitest suite, live provider/CLI integration, beta/stable evidence.

**Required work:**

- Maintain a short skipped-test register for release candidates: file, reason, enabling env/secrets, and whether it blocks stable.
- Add a manual workflow or documented command for live E2E runs with required secrets/tools.
- Keep deterministic CI counts separate from live E2E evidence in release notes.
- Fail stable promotion if a skipped test is not classified as non-blocking, live-only, or intentionally future work.

**Likely files:**

- `src/tests/e2e-full-pipeline.test.ts`
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/bench-fn.yml`
- `docs/BETA_READINESS_P4_P6.md`
- `docs/RELEASE_CHECKLIST.md`

**Evidence:**

- Release evidence names skipped tests and live-only gates explicitly.
- Live E2E run artifacts are linked when stable claims depend on them.

### Tighten release evidence capture

**Finding:** Release docs require evidence under `.sisyphus/evidence/`, but release readiness should make evidence capture repeatable and easy to audit.

**Surface:** Release workflow, local release preparation, maintainer process.

**Required work:**

- Standardize filenames for typecheck, build, tests, benchmark gate, beta smoke, package dry-run, MCP smoke, Action smoke, and live benchmark reports.
- Document which evidence is required for beta, release candidate, and stable.
- Ensure evidence artifacts exclude secrets and provider raw responses unless redacted.
- Add a release evidence manifest that lists command, exit code, timestamp, commit SHA, artifact path, and redaction status.

**Suggested evidence names:**

```txt
typecheck.log
build.log
test.log
bench-ci.log
beta-smoke.log
package-root-dry-run.log
package-mcp-dry-run.log
action-smoke.log
mcp-smoke.log
live-benchmark-report.md
evidence-manifest.json
```

**Evidence:**

- Release checklist links expected evidence names.
- CI artifacts or local logs can be mapped to each gate.

### Align CI, release, lint, and runtime matrix gates

**Finding:** CI and release workflows exercise different command sets and only run on Ubuntu. Stable CLI/MCP/package claims need an explicit matrix policy, including whether lint is a release gate and which OS/Node combinations are supported evidence.

**Surface:** CI, release workflow, lint, Node/OS support, package smoke.

**Required work:**

- Decide whether `pnpm build` and lint are required in PR CI, release CI, or both.
- Add a root `pnpm lint` script or explicitly document package-local lint as non-gating.
- Add macOS and Windows smoke jobs or document Ubuntu-only release evidence as a beta limitation.
- Keep Node support evidence aligned with `engines.node >=20` and Action runtime Node 20.
- Ensure release workflow runs `typecheck` or explicitly proves `build` covers the same failures.

**Likely files:**

- `package.json`
- `eslint.config.js`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `docs/RELEASE_CHECKLIST.md`

**Evidence:**

- Stable release notes name the tested OS/Node matrix.
- CI and release gates are intentionally aligned rather than accidentally different.

### Harden release automation, provenance, and pre-publish checks

**Finding:** Release operations are irreversible, but stable readiness should require workflow-level safeguards, not only human checklist text. Tag-triggered publish should prove approval, provenance, and version uniqueness before publishing.

**Surface:** Release workflow, npm publishing, GitHub Releases, dist-tags.

**Required work:**

- Add protected GitHub environment or equivalent manual approval for publish-capable jobs.
- Add preflight checks for existing npm versions/tags before `npm publish`.
- Decide whether to use npm provenance/Trusted Publishing and configure `id-token: write` if adopted.
- Keep prerelease versions blocked from `latest` and stable versions blocked from `beta` unless explicitly requested.
- Record publish command, dist-tag, package version, and npm response in release evidence.

**Likely files:**

- `.github/workflows/release.yml`
- `.github/workflows/npm-dist-tags.yml`
- `docs/RELEASE_CHECKLIST.md`
- `docs/BETA_READINESS_P4_P6.md`

**Evidence:**

- A release dry-run or preflight fails before publish when package versions already exist.
- Publish-capable workflow requires an explicit approval boundary.

### Upload release evidence artifacts automatically

**Finding:** Local `.sisyphus/evidence/` logs are useful, but stable release candidates need CI artifacts that maintainers and users can audit without local machine access.

**Surface:** CI, release workflow, benchmark workflow, release evidence manifest.

**Required work:**

- Upload typecheck/build/test/bench/beta-smoke/package/action/MCP evidence as GitHub Actions artifacts for release-candidate workflows.
- Attach or link evidence manifest from GitHub Release notes.
- Redact secrets before upload and document which logs are safe to publish.
- Keep live benchmark result directories uploaded as artifacts instead of committed.

**Likely files:**

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/bench-fn.yml`
- `scripts/beta-smoke.mjs`
- `docs/RELEASE_CHECKLIST.md`

**Evidence:**

- Release candidate workflow has downloadable evidence artifacts for every stable gate.
- Evidence manifest references artifact names and redaction status.

### Promote security regression suite to a named stable gate

**Finding:** Security boundaries are covered in beta docs and tests, but the root roadmap should name the stable security gate explicitly so redaction/path/fork/large-diff protections cannot regress while general tests still pass.

**Surface:** Security tests, path validation, secret redaction, fork PR behavior, untrusted model output.

**Required work:**

- Define a named security regression command or test subset.
- Include redaction, path traversal, config path, GitHub diff path, SARIF path, MCP repo path, prompt-injection boundary, and large-diff priority tests.
- Require the suite in release-candidate evidence.

**Likely files:**

- `src/tests/redaction-boundaries.test.ts`
- `src/tests/config-path-security.test.ts`
- `src/tests/github-action-diff-path-security.test.ts`
- `src/tests/github-action-sarif-path.test.ts`
- `src/tests/large-diff-security-priority.test.ts`
- `packages/core/src/tests/prompt-injection-boundaries.test.ts`
- `packages/mcp/src/tests/critical-errors.test.ts`

**Evidence:**

- Security regression suite passes and is linked from release evidence.

## P3: Scope Hygiene And Documentation Cleanup

### Keep desktop explicitly private preview

**Finding:** Desktop code exists and builds, but docs correctly state it is outside the stable support surface. That public-support boundary must stay clear, while the Tauri private-preview track is now a required pre-RC product gate.

**Surface:** README, `packages/desktop`, docs, postinstall messaging.

**Required work:**

- Keep desktop out of beta/stable support claims until private-preview graduation evidence exists.
- Ensure postinstall, README, and extension docs do not imply desktop is a released integration.
- When desktop graduates, require session browsing, config round-trip, and CLI parity evidence first.
- Keep desktop packaging, signing, updater, and distribution work separate from CLI/GitHub/MCP semantics, but complete the private-preview production gates before RC.
- Keep progress, cost visibility, local review controls, and notifications aligned with the desktop production gates above, or soften public docs that imply those capabilities are part of the preview.

**Graduation gates:**

- Desktop can browse sessions generated by the CLI without migration.
- Desktop config edits validate against the same schemas as CLI and MCP.
- Desktop-triggered review produces the same verdict/issues as CLI for the same diff/config.
- Desktop progress, cost visibility, local review controls, and notifications match the public preview claims.
- Desktop packaging and updater are documented with clear private-preview limits before RC.

**Evidence:**

- Public docs consistently describe desktop as private preview or planned local UI until graduation.
- Release checklist makes desktop private-preview production gates a pre-RC requirement without claiming desktop stable support.

### Clean up public TODO/draft signals

**Finding:** Several research/paper docs still contain TODO sections. This is acceptable for research, but public release docs should not look unfinished or imply missing product implementation.

**Surface:** `docs/papers/*`, README, CHANGELOG, release notes.

**Required work:**

- Label paper TODOs as research backlog, evidence-needed, or archived draft.
- Remove or resolve user-facing placeholder comments such as missing demo assets if they are visible in release materials.
- Keep archived docs clearly non-normative.
- Add a short note to draft research docs explaining whether they are design background, active roadmap, or historical reference.

**Cleanup rule:**

Public release pages should not contain unresolved placeholders unless they are explicitly marked as non-blocking future work. Research drafts may keep TODO sections only if they are clearly outside the release contract.

**Evidence:**

- `rg -n "TODO|FIXME|placeholder|planned" docs README.md CHANGELOG.md` has only intentional matches for release candidates.

### Prevent roadmap drift

**Finding:** The repository already has detailed production, beta, and release docs. The root roadmap should not become a parallel spec that silently diverges.

**Surface:** Documentation maintenance.

**Required work:**

- Keep this file as an operational queue, not a second production spec.
- Move completed details back into the authoritative docs when gates close.
- Review links before each release candidate.
- Add a dated status note when a priority group is completed, rather than silently deleting historical context.

**Evidence:**

- Root roadmap, production roadmap, beta readiness, release checklist, README, and architecture docs agree on supported surfaces and release status.

## Execution Batches

Use these batches to keep work reviewable. Do not mix unrelated batches unless a single test or release gate proves both.

### Batch A: Core correctness and setup safety

Close P0 default config, cache soundness, session artifact contract, and generated setup coverage first. This batch should be small and should not change public docs except release notes if needed.

**Exit:** `buildDefaultConfig()` validates, cache invalidates on all context-changing inputs, every terminal path writes readable session artifacts, `agora init --yes` generated config validates, and packed CLI smoke still passes.

### Batch B: Package contract cleanup

Resolve core/shared entrypoint/type metadata before any stable package claims. This batch should decide the supported import policy and enforce it with package-shape tests.

**Exit:** Packed artifacts contain every documented entrypoint/type file, lazy runtime data paths work from tarball installs, and unsupported imports are not advertised.

### Batch C: Public docs, CLI input, and Action behavior

Align CLI input handling, README/Action/SARIF wording, then prove Action behavior with at least one real PR smoke.

**Exit:** CLI patch input is non-mutating, public docs agree on beta/stable status, Action advertised inputs are wired, and Action outputs are captured from a real run.

### Batch D: Evidence, parity, and CI/release hardening

Add cross-surface parity tests, produce stable-candidate live benchmark evidence, classify skipped/live-only tests, and align CI/release/security/provenance gates.

**Exit:** CLI/MCP/Action parity is deterministic, live benchmark evidence is attached with complete metadata, security regressions are named, release artifacts are uploaded, and publish-capable workflows have preflight/approval boundaries.

### Batch E: Desktop private-preview production and scope hygiene

Keep the completed desktop private-preview production track green, clean public TODO/draft signals, and keep desktop stable-support claims separate from CLI/GitHub/MCP supported-surface claims.

**Exit:** Release-facing docs have no accidental placeholders, desktop private-preview evidence is attached, and desktop remains outside stable support wording until its own graduation gates are met.

## Verification Strategy

Every item should start with evidence before fixes:

1. Add or identify a failing regression test, smoke command, package import check, docs consistency check, or live evidence artifact.
2. Make the smallest change that closes the gap.
3. Run the narrowest relevant verification first.
4. Re-run the release gates appropriate to the surface.

Default verification set for readiness work:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm bench:ci
pnpm release:beta-smoke
pnpm --filter @codeagora/desktop typecheck
pnpm --filter @codeagora/desktop build
pnpm --filter @codeagora/desktop tauri:check
```

For RC handoff, replace the individual desktop subset above with the full gate:

```bash
pnpm rc:desktop-gate
pnpm test:security
pnpm evidence:manifest -- --require=rc
```

Additional verification for stable candidates:

```bash
pnpm exec node scripts/verify-package-contents.mjs
pnpm --filter @codeagora/mcp pack --dry-run
pnpm build:action
```

Stable candidates also need explicit answers for:

- Is lint a release gate? If yes, run it in CI and release; if no, document why.
- Which OS/Node matrix is release evidence? At minimum, name every tested OS and Node version.
- Are package smokes run from built files, packed tarballs, or published packages? Stable evidence should include tarballs or published packages.
- Which tests are skipped, and are they non-blocking or live-only?
- Are publish workflows protected by approval, version preflight, and dist-tag policy?

Manual or live evidence required before stable claims:

- Built CLI smoke from packed or globally installed artifact.
- MCP startup and `tools/list` from package command.
- GitHub Action run on a representative PR.
- Tauri desktop private-preview smoke from packaged or package-equivalent app.
- Live benchmark report with provider/model/cost/latency/failure metadata.

## Execution Order

Steps 0-14 are closed as of `origin/main` `1075f81`; the active RC work starts
at step 15.

```txt
0. Fix default config generation and add regression coverage.
1. Make cache invalidation sound and define the session artifact contract.
2. Validate config mutations and backend schema/validator parity.
3. Fix non-mutating CLI review input handling.
4. Fix or explicitly narrow core/shared package entrypoint/type contracts.
5. Add package-shape, tarball install, lazy data path, and generated-config smoke checks.
6. Align CLI help/reference docs, README, Action docs, SARIF wording/content, and release notes.
7. Normalize Action input/skip/default/output contracts, 422 retry safety, and MCP all-tool error contracts.
8. Run live GitHub Action smoke and capture evidence.
9. Produce fresh stable-candidate live benchmark evidence and classify skipped/live-only tests.
10. Add cross-surface parity tests for CLI, MCP, and Action output.
11. Align CI/release/security/provenance/artifact gates.
12. Freeze desktop command contract and repository/session/config boundaries.
13. Implement desktop repo open, review execution bridge, progress/cancel, session explorer, diff/finding views, config studio, provider setup, MCP manager, GitHub Action manager, evidence view, security/privacy layer, export flows, and package smoke.
14. Close desktop private-preview release gates and attach desktop evidence.
15. Re-run CLI/GitHub/MCP package, live, benchmark, and release evidence after desktop integration.
16. Clean public TODO/draft signals and keep desktop scoped as private preview until graduation.
17. Only then consider RC wording, stable wording, or npm latest dist-tag promotion.
```

## Stable Promotion Rule

Do not promote a stable release or `latest` npm dist-tag until all P0 items are closed, P1 public-surface accuracy is verified, P2 evidence is attached, the desktop private-preview production track is closed, and this status remains green through a release-candidate cycle.

A stable candidate must have all of the following attached or linked from release notes:

- Passing deterministic gates: `typecheck`, `build`, `test`, `bench:ci`, `release:beta-smoke`.
- Desktop evidence: desktop typecheck/build/`tauri:check`, packaged or package-equivalent app smoke, session/config/review/MCP/export smoke, security/redaction evidence, and private-preview limitations.
- Package evidence: root package dry-run, MCP package dry-run, tarball-installed CLI smoke, tarball-installed MCP startup/tools-list plus provider-free tool smoke, and lazy runtime data path smoke.
- GitHub evidence: Action bundle build and at least one representative PR smoke with outputs captured.
- CI/release evidence: named OS/Node matrix, lint policy, skipped-test register, release artifact uploads, security regression suite, publish preflight, and approval/provenance policy.
- Quality evidence: fresh live benchmark report with full metadata and known limits.
- Contract evidence: CLI JSON/NDJSON schema, non-mutating CLI input behavior, cache/session artifact contracts, MCP all-tool output/error contracts, GitHub Action inputs/outputs/defaults, SARIF content behavior, and config defaults/mutations documented and tested.
- Docs evidence: README, production roadmap, beta readiness, desktop preview docs, release checklist, and this roadmap agree on supported surfaces, desktop private-preview limits, and release status.

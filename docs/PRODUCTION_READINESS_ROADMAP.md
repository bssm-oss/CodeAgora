<!-- Parent: AGENTS.md -->
<!-- Generated: 2026-05-01 | Updated: 2026-05-01 -->

# Production Readiness Roadmap

## Purpose

This roadmap defines what must be true before CodeAgora can be treated as production-ready for real users and CI pipelines.

It is intentionally narrower than a product wishlist. The goal is not to add more surfaces; it is to make the supported surfaces boring, observable, secure, and repeatable.

## Readiness Definition

CodeAgora is production-ready when all of these are true:

- The CLI can review local diffs, staged diffs, patch files, and GitHub PRs with stable contracts and predictable exit codes.
- The GitHub Action can run safely on normal PRs, fork PRs, large diffs, missing-secret scenarios, and provider failures.
- The MCP server exposes the same review behavior as the CLI through schema-validated tools and structured errors.
- Benchmark evidence proves the current reviewer stack catches seeded high-value bugs while keeping false positives bounded.
- Packaging, installation, first-run setup, docs, and release workflows work from a clean checkout.
- Security boundaries hold for prompt injection, untrusted model output, secret redaction, filesystem paths, and GitHub token permissions.

## Supported Surfaces

The supported product surfaces remain CLI, GitHub Actions, MCP, and the private/upcoming desktop app.

Production readiness gates apply to these automation and agent surfaces only:

```txt
CLI
GitHub Actions
MCP
```

The desktop app remains outside the production gate for this roadmap. It should consume stable core/CLI behavior after the gates below are green; it should not define new review semantics, config formats, or release promises during this roadmap.

Retired surfaces remain out of scope:

```txt
web dashboard
terminal TUI
notification package
```

## Phase 0: Surface Freeze And Baseline

### Objective

Freeze the production target so reliability work does not keep expanding sideways.

### Work

- Declare CLI, GitHub Actions, and MCP as the production gates.
- Keep desktop documented as the private/upcoming human-facing local UI outside the production gate.
- Inventory commands, action inputs, MCP tools, config files, output formats, and environment variables.
- Mark every undocumented or unsupported behavior as either production scope or explicitly non-goal.

### Acceptance Gate

- `README.md`, `docs/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md`, `docs/ARCHITECTURE.md`, and this roadmap agree on supported surfaces.
- Every supported command/tool/action input has documented behavior, failure behavior, and ownership.
- No root or docs page describes retired web/TUI/notification surfaces as current production surfaces.

## Phase 1: Core CLI Reliability

### Objective

Make the CLI the stable executable contract that all other surfaces can rely on.

### Work

- Harden diff ingestion for stdin, patch files, staged changes, branch ranges, and PR fetches.
- Make config loading deterministic across `.ca/config.json`, `.ca/config.yaml`, defaults, and invalid config cases.
- Normalize provider failure behavior: missing keys, auth failure, rate limits, transient network failure, model failure, timeout, and reviewer forfeits.
- Preserve stable `codeagora.review.v1` JSON and NDJSON behavior.
- Ensure text output remains useful without breaking machine-readable modes.
- Redact secrets from logs, errors, session artifacts, and provider diagnostics.

### Acceptance Gate

- CLI fixtures cover empty diff, malformed diff, ignored files, large diff, provider outage, missing API key, invalid config, and successful review.
- `agora review --output json` and `agora review --json-stream` emit only valid contract output in machine-readable modes.
- Exit codes match `docs/AGENT_CONTRACT.md` for success, review gate failure, setup error, and runtime failure.
- No unhandled promise rejection or raw provider exception reaches users in targeted failure tests.
- Manual QA verifies `agora review --help`, stdin review, patch-file review, invalid config, and missing-key behavior through the real CLI.

## Phase 2: GitHub Action Production Path

### Objective

Make PR automation safe enough to be the default real-user workflow.

### Work

- Verify PR diff acquisition for same-repo PRs, fork PRs, rebased PRs, and force-pushed PRs.
- Keep fetched `baseSha`, `headSha`, repository names, and fork metadata attached to review sessions and posting decisions.
- Harden permission behavior for `GITHUB_TOKEN` scopes, read-only fork contexts, missing secrets, and disabled posting.
- Ensure review comments, summary comments, commit statuses, SARIF, and check output are deduplicated and head-SHA-safe.
- Make large-diff truncation transparent through priority-file, oversized-hunk, and token-budget metadata.

### Acceptance Gate

- Action smoke workflow passes on a representative PR with comments/status enabled.
- Fork PR test path does not leak secrets and produces a clear skipped/degraded result when secrets are unavailable.
- Force-push or rebase changes the recorded `headSha`; stale posting is blocked or clearly marked.
- Large-diff dry run exposes retained priority files and truncation decisions.
- Action bundle build and clean checkout action execution are verified before release.

## Phase 3: MCP Stability And Parity

### Objective

Keep MCP as a thin agent/IDE adapter over the same review engine, not a divergent product path.

### Work

- Validate every MCP tool input with zod schemas and return structured errors.
- Keep filesystem access bounded to explicit repository paths.
- Align MCP compact output with the CLI contract when `output_format: "json"` is requested.
- Add parity fixtures comparing CLI and MCP behavior for the same diff/config.
- Exercise MCP startup, tool listing, quick review, full review, PR review, dry run, config get, and config set.

### Acceptance Gate

- MCP server starts from the published package command: `npx -y @codeagora/mcp`.
- Each MCP tool has documented parameters, output shape, and failure behavior.
- Parity tests prove CLI and MCP reach equivalent decisions/issues for fixture diffs under the same config.
- Invalid tool input and inaccessible repo paths return structured errors without crashing the server.

## Phase 4: Benchmark Evidence And Regression Gates

### Objective

Make quality claims evidence-based instead of anecdotal.

### Work

- Maintain a labeled benchmark corpus with recall fixtures and false-positive regression fixtures.
- Include security bugs, logic bugs, API-contract bugs, clean diffs, generated/noisy files, large diffs, and multi-file interaction cases.
- Track TP, FP, FN, precision, recall, F1, recall@3/@5/@10, FP clean-rate, latency, and cost when available.
- Keep ambiguous-case research separate from production pass/fail gates.
- Require benchmark deltas before changing severity semantics, L2/L3 behavior, model pools, or large-diff strategy.

### Acceptance Gate

- Benchmark methodology and latest production candidate results are published in docs.
- High-severity seeded findings meet the agreed recall threshold before release.
- FP regression fixtures remain clean within the agreed tolerance.
- No accepted production candidate fabricates files, line ranges, or code quotes in benchmark output.
- CI blocks benchmark schema regressions and flags material quality regressions with `pnpm bench:ci`, a provider-free gate that validates fixture schemas and the 20-fixture reference file.

## Phase 5: Security And Abuse Resistance

### Objective

Treat model output, repository contents, PR text, and external inputs as untrusted data.

### Work

- Preserve untrusted-data wrapping across L1->L2, supporter->moderator, and L2->L3 prompt paths.
- Test delimiter spoofing, role override, output-format manipulation, JSON breakout, hidden-prompt requests, and premature verdict injection.
- Redact API keys, tokens, repo credentials, and provider auth errors in logs and sessions.
- Bound path access for config, diff context, MCP repo paths, and session reads.
- Keep GitHub token permissions minimal and document fork-secret behavior.

### Acceptance Gate

- Prompt-injection boundary tests pass for every LLM-to-LLM handoff.
- Secret redaction tests cover CLI logs, JSON output, session files, GitHub comments, and MCP responses.
- Path traversal tests cover diff context reads, session reads, config edits, and MCP repo paths.
- Security-sensitive large-diff files are prioritized before non-sensitive files.

## Phase 6: Packaging, Release, And Onboarding

### Objective

Make install, first run, upgrade, and release boring.

### Work

- Finalize `@codeagora/review` package metadata, files list, bin paths, and npm publish workflow.
- Verify `@codeagora/mcp` package startup independently.
- Keep GitHub Action examples aligned with the published package and bundled action entrypoint.
- Update `README.md`, `docs/CLI_REFERENCE.md`, `docs/CONFIGURATION.md`, `docs/PROVIDERS.md`, `docs/TROUBLESHOOTING.md`, and `.env.example` for first-run success.
- Add a release checklist for clean checkout install, build, test, package dry-run, CLI smoke, MCP smoke, and action smoke.

### Acceptance Gate

- Clean checkout: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm bench:ci` pass.
- Package dry-run includes only intended files and working binaries.
- Global install smoke runs `agora --help`, `agora init --yes`, and a minimal review path.
- MCP smoke starts via package command and lists tools.
- GitHub Action smoke validates bundled action execution.
- Changelog and release notes state production status, known limits, and migration path from `codeagora@2.x`.

## Phase 7: Desktop App After Core Readiness

### Objective

Add a human-facing local UI only after the core product can stand on its own.

### Work

- Keep desktop read-only at first: session browsing, review history, result exploration, model/cost visibility.
- Reuse core session files, config schemas, and CLI/MCP contracts.
- Avoid new review semantics, new config formats, or desktop-only execution behavior until CLI/GitHub/MCP are stable.
- Add local notifications only inside desktop, not as a separate package surface.

### Acceptance Gate

- Desktop can browse sessions generated by the CLI without migration.
- Desktop config editing round-trips through the same schemas used by CLI and MCP.
- Desktop does not change review outcomes compared with CLI for the same diff/config.

## Release Candidate Gate

A production release candidate requires all of the following:

- Phase 0 through Phase 6 acceptance gates complete.
- `pnpm typecheck`, `pnpm build`, `pnpm test`, and action bundle build pass on clean checkout.
- CLI, GitHub Action, and MCP manual QA pass through their real user surfaces.
- Latest benchmark report is linked from README or release notes, and live `bench:fn:run` result directories are treated as uploaded artifacts rather than committed `bench-out*` directories.
- Known limits are documented, especially provider nondeterminism, cost variance, language coverage, and fork-secret behavior.
- No retired surface is required for setup, review execution, or result inspection.

## Non-Goals Before Production Readiness

- Hosted service, billing, teams, or enterprise admin features.
- Desktop-first product launch.
- Reintroducing web dashboard, TUI, or notification package surfaces.
- Broad language-expansion claims beyond demonstrated benchmark coverage.
- Public claims of reviewer accuracy without benchmark evidence.
- Major provider abstraction rewrites unless current provider handling blocks the gates above.

## Main Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM nondeterminism | Flaky quality and hard-to-debug CI results | Use labeled benchmarks, structured contracts, confidence gates, and regression thresholds instead of exact prose snapshots |
| CI secret exposure | Token/API key leakage in fork PRs or logs | Redact secrets, document fork behavior, minimize GitHub token permissions, and test missing-secret paths |
| Surface drift | CLI, GitHub Action, and MCP produce different behavior | Keep shared core APIs and add cross-surface parity fixtures |
| Benchmark overfitting | Good scores without real utility | Keep clean-diff FP fixtures, multi-file cases, large diffs, and periodic live PR dogfooding |
| Packaging drift | Published package differs from repository behavior | Require package dry-run, global-install smoke, MCP package smoke, and action bundle smoke before release |

## Execution Order

```txt
0. Surface freeze
1. CLI reliability
2. GitHub Action path
3. MCP parity
4. Benchmark gates
5. Security hardening
6. Packaging and onboarding
7. Desktop MVP
```

Phases 4 and 5 should run continuously once Phase 1 is stable enough to measure. Phase 7 should not block the first production-ready CLI/GitHub/MCP release.

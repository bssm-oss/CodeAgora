<!-- Parent: ../ROADMAP.md -->

# Beta.2 To RC Quality Plan

## Purpose

This plan defines the path from `0.1.0-beta.2` to the first release candidate.
It intentionally treats `0.1.0-beta.2` as the next public prerelease even if the
current local gates are green. The post-`0.1.0-beta.1` changes are broad enough
that they need one beta feedback cycle before the project freezes release
contracts for `0.1.0-rc.0`.

The plan covers:

- publishing `0.1.0-beta.2` under the npm `beta` dist-tag
- validating install, runtime, and public surface behavior after publish
- reviewing actual review quality, not only test pass/fail status
- deciding whether the next version is `0.1.0-rc.0` or another beta

Stable release wording, npm `latest` promotion, and public desktop support remain
out of scope for this plan.

## Current Position

`0.1.0-beta.1` is the latest published beta. Since that release, the repository
has accumulated meaningful runtime and release-surface changes:

- desktop private-preview RC gates and bundle smoke
- runtime option, timeout, and reviewer selection fixes
- full evidence output fixes
- GitHub Action bundle refresh
- release evidence, package smoke, and manifest tooling updates

Those changes are appropriate for `0.1.0-beta.2`. They are not enough by
themselves to justify `0.1.0-rc.0`, because RC means the supported contracts are
ready to freeze.

## Phase 1: Publish Beta.2

Goal: publish the accumulated post-beta.1 work as a feedback-ready prerelease.

Required work:

1. Confirm package versions are bumped from `0.1.0-beta.1` to `0.1.0-beta.2`.
2. Update release-facing docs and changelog entries for the beta.2 scope.
3. Keep examples and release notes on prerelease wording; do not imply stable
   support or npm `latest`.
4. Rebuild the GitHub Action bundle.
5. Run the deterministic release gates:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test --no-file-parallelism
pnpm bench:ci
pnpm release:beta-smoke
pnpm build:action
pnpm test:security
pnpm rc:desktop-gate
pnpm evidence:manifest -- --require=rc
```

6. Tag and publish `v0.1.0-beta.2` as a GitHub prerelease.
7. Publish npm packages under the `beta` dist-tag.
8. Verify the published artifacts from a clean temporary install:

```bash
npm view @codeagora/review@0.1.0-beta.2 version
npm view @codeagora/mcp@0.1.0-beta.2 version
npm view @codeagora/review dist-tags --json
npm view @codeagora/mcp dist-tags --json
```

Beta.2 is complete only after both npm packages resolve, the GitHub Release is a
prerelease, and the `beta` dist-tags point at `0.1.0-beta.2`.

## Phase 2: Published Runtime Smoke

Goal: prove the published beta.2 artifacts work outside the repository checkout.

Validate:

- `codeagora` and `agora` binaries start from a clean npm install
- CLI review works for local diff, staged diff, patch file, and stdin diff
- CLI JSON and NDJSON output remain parseable
- `--config-path`, output options, timeout options, reviewer count, and reviewer
  name selection behave as documented
- degraded results are structured and predictable when providers fail or timeout
- `@codeagora/mcp` starts from the published tarball and lists all supported tools
- MCP tool outputs and structured errors match `docs/AGENT_CONTRACT.md`
- the GitHub Action bundle executes the current beta.2 code path
- desktop private-preview smoke remains a private-preview validation surface, not
  a stable public support claim

Any install, binary, package-content, or bundled Action regression should block
RC and usually produce `0.1.0-beta.3`.

## Phase 3: Review Quality QA

Goal: evaluate whether CodeAgora produces useful reviews, not merely whether it
executes successfully.

Quality dimensions:

- Recall: seeded or real high-severity defects are found.
- Precision: documentation-only, type-only, and harmless refactor changes do not
  produce noisy findings.
- Severity calibration: `HARSHLY_CRITICAL`, `CRITICAL`, `WARNING`, and
  `SUGGESTION` are not exaggerated or under-called.
- Evidence quality: file paths, line ranges, quoted code, and reasoning are
  grounded in the reviewed diff.
- Consensus quality: duplicate findings are merged, independent reviewer
  agreement is counted correctly, and disagreement is explainable.
- Degraded quality: timeout, provider failure, and partial reviewer failure
  produce clear degraded output instead of silently weak verdicts.
- Reviewer selection quality: `reviewer_count`, named reviewers, declarative
  reviewers, and model routing change the run shape in expected ways.
- Human usefulness: CLI, GitHub Action, and MCP outputs help a maintainer decide
  what to fix, ignore, or escalate.

Minimum QA set:

1. Run the deterministic benchmark gate:

```bash
pnpm bench:ci
```

2. Run a fresh live benchmark with the intended beta.2 model/provider set.
   Capture provider/model metadata, TP/FP/FN, latency, token or cost information,
   and provider failure notes.
3. Review at least five real or representative PRs:

- small bug fix
- large refactor
- documentation-only change
- security-sensitive change
- tests-only change

4. For each sampled run, classify findings:

- valid actionable finding
- false positive
- missed high-severity issue
- severity over-call
- severity under-call
- evidence mismatch
- duplicate or weak consensus
- degraded but acceptable result

5. Summarize the quality readout in release evidence or a QA note. The summary
   should name the reviewed inputs, model/provider set, run mode, notable misses,
   notable false positives, and whether the result blocks RC.

RC is blocked if quality QA finds a critical miss, severe evidence fabrication,
systemic false positives on benign changes, or unstable output contracts.

## Phase 4: Runtime Feedback Window

Goal: let beta.2 absorb real usage before freezing contracts.

Observe:

- npm installation reports
- provider rate limits and model failures
- GitHub Action permission, fork PR, stale-head, 422, duplicate comment, and
  oversized diff behavior
- MCP client compatibility
- desktop private-preview launch, repository trust, config studio, review/cancel,
  session export, and secret redaction behavior
- discrepancies between README, CLI help, Action docs, MCP docs, and actual
  behavior

This window does not need to be long, but it must include enough real workflow
coverage to justify contract freeze. If a contract or review semantics change is
needed, cut another beta instead of RC.

## Phase 5: RC Freeze Decision

Goal: decide whether the next version is `0.1.0-rc.0` or another beta.

Freeze candidates:

- CLI JSON and NDJSON schemas
- CLI exit codes
- documented config behavior
- MCP tool outputs and structured error shapes
- GitHub Action inputs, outputs, degraded reasons, and posting behavior
- release evidence manifest schema
- package contents and runtime data paths
- desktop private-preview boundary

RC remains blocked while any of the following are true:

- stable or npm `latest` wording is needed
- public desktop support is implied
- a new review semantic or config format is still planned before stable
- live-only evidence is stale
- review quality QA has unresolved critical misses or severe false positives
- published package smoke is not current
- Action, MCP, or CLI contracts still need breaking changes

Decision rule:

- packaging or install regression: fix and cut `0.1.0-beta.3`
- CLI, MCP, or Action contract change required: fix and cut `0.1.0-beta.3`
- review quality blocker: fix and cut `0.1.0-beta.3`
- docs-only wording issue: fix before RC; beta.2 may remain current
- beta.2 stable in runtime, quality, and contracts: prepare `0.1.0-rc.0`

## Phase 6: Prepare RC.0

Goal: cut `0.1.0-rc.0` only after beta.2 has cleared runtime and quality review.

Required work:

1. Bump target versions to `0.1.0-rc.0`.
2. Decide npm prerelease tag policy. Prefer an `rc` dist-tag for RC packages;
   never publish RC packages as `latest`.
3. Refresh release notes with explicit RC wording: release candidate, not stable.
4. Refresh live benchmark evidence.
5. Refresh live GitHub Action PR smoke evidence, including same-repo PR, fork PR,
   stale head, oversized diff, provider failure, and 422 scenarios.
6. Re-run deterministic release gates against the RC target version.
7. Rebuild the Action bundle.
8. Generate `pnpm evidence:manifest -- --require=rc`.
9. Attach or link the review quality QA summary.
10. Publish `v0.1.0-rc.0` as a GitHub prerelease.
11. Verify npm and GitHub release metadata after publish.

`0.1.0-rc.0` should mean the project is ready to freeze public contracts for the
supported CLI, GitHub Action, and MCP surfaces while desktop remains a
private-preview surface included in evidence, not in stable public support.

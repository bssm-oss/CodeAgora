<!-- Parent: ../ROADMAP.md -->

# RC.3 To RC.8 Prerelease Roadmap

## Purpose

This roadmap turns the post-`0.1.0-rc.2` release-candidate sequence into a
concrete validation plan. The goal is to move from an RC that is mechanically
green to a stable candidate that has been exercised against real repositories,
real PR workflows, and real onboarding paths.

Short version:

```txt
rc.3  real repository testing
rc.4  false-positive / noise reduction
rc.5  cost / speed optimization
rc.6  three-minute setup
rc.7  team project automatic review
rc.8  stable candidate
```

## Table Of Contents

- [Purpose](#purpose)
- [Scope Guardrails](#scope-guardrails)
- [Operating Rules](#operating-rules)
- [Current Baseline](#current-baseline)
- [How To Execute This Roadmap](#how-to-execute-this-roadmap)
- [TDD-Style RC Workflow](#tdd-style-rc-workflow)
- [Shared Metrics](#shared-metrics)
- [Classification Rubrics](#classification-rubrics)
- [Evidence Artifact Conventions](#evidence-artifact-conventions)
- [Owner Checklist Template](#owner-checklist-template)
- [Artifact Templates](#artifact-templates)
- [Global Command Matrix](#global-command-matrix)
- [RC Sequence](#rc-sequence)
- [RC.3: Real Repository Testing](#rc3-real-repository-testing)
- [RC.4: False-Positive / Noise Reduction](#rc4-false-positive--noise-reduction)
- [RC.5: Cost / Speed Optimization](#rc5-cost--speed-optimization)
- [RC.6: Three-Minute Setup](#rc6-three-minute-setup)
- [RC.7: Team Project Automatic Review](#rc7-team-project-automatic-review)
- [RC.8: Stable Candidate](#rc8-stable-candidate)
- [Go / No-Go Process](#go--no-go-process)
- [Cross-RC Risk Register](#cross-rc-risk-register)
- [Evidence Register](#evidence-register)
- [Stable-Promotion Boundary](#stable-promotion-boundary)

## Scope Guardrails

These release candidates are prerelease-only milestones. They do not imply npm
`latest` promotion, a stable GitHub Action ref, or stable release wording.

Stable-readiness work remains limited to the supported automation and agent
surfaces:

```txt
CLI
GitHub Action
MCP
```

The desktop app remains a private-preview surface. It may contribute RC evidence
through `pnpm rc:desktop-gate`, but it must not be described as stable public
desktop support before signing, notarization, updater, packaging, and public
support decisions are revisited.

Retired surfaces stay retired:

```txt
web dashboard
terminal TUI
notification package
```

## Operating Rules

These rules apply to every RC in this roadmap.

| Rule | Operational meaning |
|------|---------------------|
| Evidence before confidence | Do not close an RC from intuition, screenshots alone, or local memory. Close it from commands, artifacts, run URLs, and classification notes. |
| Same inputs before/after | When tuning quality, speed, or noise, rerun the same samples before claiming improvement. |
| Deterministic first | Provider-free gates run before live-only claims so basic regressions are caught cheaply. |
| Live claims need live evidence | If release copy mentions real review quality, GitHub Action behavior, or team automation, attach current live evidence. |
| Stable contracts stay stable | JSON/NDJSON, MCP JSON output, exit codes, Action degraded reasons, config behavior, and session artifact semantics must not change silently. |
| Desktop stays preview | Desktop evidence can support RC handoff, but not stable public desktop support. |
| No hidden expansion | Do not add hosted service, billing, teams product features, public desktop launch, or retired surfaces as part of this RC sequence. |
| Raw sensitive artifacts stay out of git | Sanitize private repo examples, provider transcripts, secrets, and business context before writing docs. |
| Regression anchor for repeatable failure | A repeatable miss, false positive, package failure, setup failure, or posting bug needs a test, fixture, benchmark item, or documented smoke case. |
| Go/no-go is explicit | Every RC handoff records `pass`, `blocked`, or `needs another RC`. |

## Current Baseline

`0.1.0-rc.2` has already established the main release-candidate foundation:

- CLI, GitHub Action, and MCP are the supported stable-readiness surfaces.
- `codeagora.review.v1` is the machine-readable JSON/NDJSON contract marker.
- The deterministic benchmark gate is provider-free through `pnpm bench:ci`.
- Live benchmark and GitHub Action smoke evidence are documented separately from
  deterministic test evidence.
- Desktop is documented as private preview only.

The remaining prerelease work should focus on quality, noise, cost, speed,
onboarding, and team workflow proof instead of expanding product surface area.

## How To Execute This Roadmap

Each RC should follow the same evidence-first loop:

1. Select the inputs before tuning anything.
2. Capture the baseline run and preserve the command, config, model/provider set,
   and artifact location.
3. Classify failures using the shared metrics in this document.
4. Fix or tune only against grounded evidence.
5. Add a regression anchor when the issue is repeatable.
6. Re-run the same input set plus the deterministic gates.
7. End the RC with one of three states: `pass`, `blocked`, or `needs another RC`.

No RC should close because the code "looks good". It closes when the evidence
answers that RC's primary question.

## TDD-Style RC Workflow

Treat each RC as a test plan for the product, not as a vague milestone. The test
is the release question; the implementation work is only valid when it makes the
release question pass without breaking earlier guarantees.

| Step | Action | Output |
|------|--------|--------|
| 1. Define expectation | Write the expected behavior for each sample before running or tuning. | Sample matrix with expected outcome. |
| 2. Capture baseline | Run the current RC candidate with unchanged config where possible. | Baseline logs, run URLs, output files, timings. |
| 3. Classify result | Label every finding, miss, failure, and degradation with the rubrics below. | Finding classification table. |
| 4. Decide blocker class | Mark each failure as release blocker, RC blocker, follow-up, or known limit. | Blocker table. |
| 5. Anchor regression | Add or identify the test, fixture, command, or smoke path that will catch it again. | Regression anchor reference. |
| 6. Retest fixed path | Run the same sample again, then run the deterministic gates. | Before/after evidence. |
| 7. Record decision | Decide `pass`, `blocked`, or `needs another RC`. | Go/no-go summary. |

### Blocker Classes

| Class | Meaning | Required response |
|-------|---------|-------------------|
| Release blocker | Unsafe or misleading behavior that would make a prerelease untrustworthy. | Stop RC progression, fix, retest, and record evidence. |
| RC blocker | The current RC objective is not met, but the issue is bounded to that RC's theme. | Repeat current RC focus or cut another targeted RC. |
| Follow-up | Valuable but not required for the current RC's primary question. | Add to next RC queue or backlog with evidence. |
| Known limit | Acceptable limitation that must be documented before release claims. | Document in evidence/release notes; do not silently ignore. |

### Required Regression Anchor Types

| Failure type | Acceptable anchor |
|--------------|-------------------|
| False positive | FP-regression fixture, scorer/filter unit test, or repeated real-repo smoke case. |
| False negative | Recall fixture, targeted benchmark case, or documented live benchmark sample. |
| Evidence fabrication | Hallucination-filter/parser test or real-repo reproduction note. |
| Package/runtime failure | Package dry-run test, smoke script, or clean install transcript. |
| Action posting failure | GitHub package test, Action smoke, or live PR evidence. |
| MCP schema failure | MCP tool handler test, format parity test, or MCP startup smoke. |
| Setup confusion | CLI init/doctor test, setup smoke, or docs correction with command transcript. |

### RC Decision States

| State | Meaning | Required note |
|-------|---------|---------------|
| `pass` | The RC objective is met and the next RC can begin. | Evidence links, residual risks, and known limits. |
| `blocked` | A release-blocking issue prevents progress. | Blocking issue, owner role, required fix, and retest command. |
| `needs another RC` | The objective is partially met but still needs another prerelease loop. | Why the current RC should not advance and what narrows the next RC. |

### Owner Roles

Use roles rather than individual names in the plan and evidence notes:

| Role | Responsibility |
|------|----------------|
| Release owner | Version, dist-tag policy, release notes, evidence manifest, final go/no-go summary. |
| Quality owner | Real-repo QA, benchmark interpretation, FP/FN classification, severity calibration. |
| Runtime owner | CLI, MCP, GitHub Action, package smoke, degraded behavior, timing/cost capture. |
| Docs owner | README, CLI docs, Action docs, MCP docs, setup docs, stable/prerelease wording. |
| Desktop preview owner | Private-preview desktop gates and wording, without stable desktop claims. |

A single maintainer may hold multiple roles, but the evidence notes should still
name the role responsible for each decision.

## Shared Metrics

Use the same vocabulary across all RCs so the trend from `rc.3` to `rc.8` is
visible.

| Area | Metric | Definition |
|------|--------|------------|
| Quality | `TP` | Expected actionable issue found and grounded. |
| Quality | `FP` | Reported issue that should not have been reported. |
| Quality | `FN` | Expected issue missed or not surfaced usefully. |
| Quality | Precision | `TP / (TP + FP)` when the sample has labeled expectations. |
| Quality | Recall | `TP / (TP + FN)` when the sample has labeled expectations. |
| Quality | FP clean-rate | Share of clean/benign samples with zero reported issues. |
| Severity | Over-call | Finding severity is higher than the evidence supports. |
| Severity | Under-call | Finding severity is lower than the expected risk. |
| Grounding | Invalid file | Finding references a file outside the reviewed diff or repo boundary. |
| Grounding | Invalid line | Finding points outside a valid hunk or useful surrounding context. |
| Grounding | Fabricated quote | Quoted code does not exist in the reviewed diff/context. |
| Grounding | Duplicate | Same issue is repeated instead of grouped or deduplicated. |
| Runtime | Wall time | End-to-end command or Action duration. |
| Runtime | Backend latency | Provider/model call latency when available. |
| Runtime | Degraded count | Number of reviewer, provider, posting, or setup degradations. |
| Cost | Tokens | Prompt/completion/total tokens when provider reports them. |
| Cost | Known cost | Provider-reported or estimated cost when available. |
| Cost | Unknown cost note | Explicit note when the provider does not report cost. |
| Adoption | Setup time | Time from clean start to first useful review. |
| Adoption | Failed setup step | First step where a new user gets blocked. |
| Adoption | Maintainer action | Fix, ignore, ask human, disable tool, or keep enabled. |

## Classification Rubrics

Use these labels in RC evidence notes. Keep labels stable so trend reports can be
compared across RCs.

### Finding Labels

| Label | Meaning | Release impact |
|-------|---------|----------------|
| `TP-actionable` | Correct, grounded finding that a maintainer should fix. | Positive evidence. |
| `TP-verify` | Plausible and grounded finding that needs human confirmation. | Acceptable if it does not block automatically. |
| `TP-low-value` | Correct but too minor or noisy for PR automation. | Presentation or threshold tuning candidate. |
| `FP-noise` | Incorrect, irrelevant, or unhelpful finding. | `rc.4` tuning candidate. |
| `FP-blocking` | False positive that would block merge or request changes. | Release blocker until fixed or safely downgraded. |
| `FN-critical` | Missed expected high-severity bug. | Release blocker unless out of declared scope. |
| `FN-noncritical` | Missed expected medium/low issue. | Quality follow-up or benchmark tuning candidate. |
| `severity-overcall` | Finding is real but risk is exaggerated. | Calibration issue; blocker if it blocks benign PRs. |
| `severity-undercall` | Finding is real but risk is understated. | Calibration issue; blocker if high-severity risk is hidden. |
| `grounding-failure` | Bad file path, line range, quote, or unsupported evidence. | Release blocker if must-fix or blocking. |
| `duplicate` | Same issue repeated in multiple comments or groups. | Noise issue; usually not release-blocking alone. |
| `acceptable-degraded` | Degraded state is explicit, safe, and actionable. | Non-blocking evidence of resilience. |

### Evidence Quality Labels

| Label | Meaning | Required action |
|-------|---------|-----------------|
| `grounded` | File, line, quote, and reasoning are all supported by reviewed input. | Keep as positive evidence. |
| `line-imprecise` | File and issue are right, but line/hunk placement is not ideal. | Improve mapper or wording if repeated. |
| `quote-missing` | Claim may be right, but quoted code is absent or paraphrased as code. | Treat as grounding issue. |
| `context-missing` | Claim needs context outside diff that was not available. | Route to verify or improve context strategy. |
| `speculative` | Claim uses weak language without concrete evidence. | Downgrade or suppress unless risk is high. |
| `contradicted` | Claim is contradicted by diff, tests, or static evidence. | Treat as false positive. |

### Degraded Labels

| Label | Meaning | Expected user-facing behavior |
|-------|---------|-------------------------------|
| `missing-provider-secret` | Provider key unavailable in local or CI environment. | Clear setup error or skipped/degraded result. |
| `fork-missing-provider-secrets` | Fork PR cannot access provider secrets. | Safe skip/degraded output, no secret leakage. |
| `provider-timeout` | One or more providers timed out. | Partial result or error with forfeited reviewer details. |
| `all-reviewers-failed` | No usable reviewer result. | Error/degraded result, never pretend success. |
| `oversized-diff` | Diff exceeds configured limits. | Structured skip/degraded output with size details. |
| `stale-head` | PR head changed before posting. | Block stale posting or clearly mark target mismatch. |
| `github-posting-422` | GitHub rejects review/comment shape or approval action. | Safe fallback without duplicate probe comments. |
| `config-load-failed` | Config path or schema invalid. | User-actionable setup error. |
| `mcp-invalid-repo-path` | MCP repo path fails boundary validation. | Structured MCP error with stable code. |

### Maintainer Action Labels

| Label | Meaning |
|-------|---------|
| `fixed` | Maintainer changed code because of the finding. |
| `verified-existing-safe` | Maintainer checked and decided the code is safe. |
| `ignored-noise` | Maintainer ignored as false positive or low value. |
| `needs-human` | Maintainer needed manual judgement beyond CodeAgora output. |
| `blocked-merge` | Finding or Action status blocked merge. |
| `disabled-tool` | Team disabled or would disable CodeAgora because of behavior. |
| `kept-enabled` | Team would keep CodeAgora enabled after trial. |

## Evidence Artifact Conventions

Use `docs/RELEASE_EVIDENCE.md` for canonical evidence filenames and release-tier
requirements. This roadmap may add short RC-specific QA notes, but it should not
replace the release evidence manifest.

Recommended RC-specific notes:

| RC | Suggested note | Contents |
|----|----------------|----------|
| `rc.3` | `docs/rc-evidence/rc3-real-repo-qa.md` | Sampled repos/PRs, findings classification, misses, noisy patterns queued for `rc.4`. |
| `rc.4` | `rc4-noise-regression.md` | FP patterns, regression anchors, before/after noise results, remaining noise. |
| `rc.5` | `rc5-cost-speed-table.md` | Mode comparison, timing, cost, quality deltas, recommended defaults. |
| `rc.6` | `rc6-setup-smoke.md` | Clean install paths, setup timing, failure messages, docs mismatches. |
| `rc.7` | `rc7-team-review-smoke.md` | Team PR runs, degraded paths, maintainer actions, keep/disable decision. |
| `rc.8` | `rc8-stable-candidate-summary.md` | Evidence freshness, blockers closed, contract freeze status, stable decision inputs. |

Raw provider transcripts, `bench-out*` directories, and sensitive private-repo
artifacts should not be committed. Prefer links to GitHub Actions artifacts,
sanitized summaries, or local `.sisyphus/evidence/` manifests.

## Owner Checklist Template

Each RC evidence note should include this checklist:

```md
## Owner Checklist

- [ ] Inputs selected before tuning
- [ ] Baseline captured
- [ ] Deterministic gates run
- [ ] Live-only evidence captured if the RC makes a live claim
- [ ] Findings classified with TP/FP/FN or equivalent labels
- [ ] Regression anchor added for repeatable failures
- [ ] Docs updated for any changed user-facing behavior
- [ ] Release blocker decision recorded
- [ ] Next RC recommendation recorded
```

## Artifact Templates

Copy these into RC-specific evidence notes. Keep raw logs in files or artifacts;
use these templates as summaries.

### RC Evidence Note Template

```md
# RC Evidence Note

- RC:
- Date:
- Commit SHA:
- Package versions:
- Owner roles:
- Decision state: pass / blocked / needs another RC
- Primary question:
- Inputs:
- Commands run:
- Live artifacts:
- Model/provider set:
- Metrics summary:
- Blocking issues:
- Known limits:
- Regression anchors:
- Next RC recommendation:
```

### Finding Classification Table

```md
| Input | Surface | Finding | Label | Severity | Evidence quality | Maintainer action | Follow-up |
|-------|---------|---------|-------|----------|------------------|-------------------|-----------|
```

### Command Result Table

```md
| Command | Environment | Result | Log/artifact | Notes |
|---------|-------------|--------|--------------|-------|
```

### Live Artifact Table

```md
| Artifact | Source | Date/SHA | Covers | Fresh enough? | Notes |
|----------|--------|----------|--------|---------------|-------|
```

### Blocker Table

```md
| Blocker | Class | Evidence | Owner role | Required fix | Retest command/artifact | Status |
|---------|-------|----------|------------|--------------|-------------------------|--------|
```

### Go / No-Go Summary

```md
| Role | Decision | Blockers | Required follow-up |
|------|----------|----------|--------------------|
| Release owner | go/no-go | | |
| Quality owner | go/no-go | | |
| Runtime owner | go/no-go | | |
| Docs owner | go/no-go | | |
| Desktop preview owner | go/no-go | | |
```

## Global Command Matrix

This matrix says which commands normally apply to each RC. It does not replace
`docs/RELEASE_CHECKLIST.md` or `docs/RELEASE_EVIDENCE.md`.

| Command or artifact | Type | Applies to | Required when |
|---------------------|------|------------|---------------|
| `pnpm typecheck` | deterministic | all RCs | Any RC handoff. |
| `pnpm lint` | deterministic | all RCs | Docs/source-facing RC handoff. |
| `pnpm build` | deterministic | all RCs | Any package or release-candidate handoff. |
| `pnpm test --no-file-parallelism` | deterministic | all RCs | Full deterministic RC evidence refresh. |
| `pnpm test:security` | deterministic | `rc.4`, `rc.8`, security-touched RCs | Noise/security/release-candidate gates. |
| `pnpm bench:ci` | deterministic | all RCs | Provider-free quality gate. |
| `pnpm release:beta-smoke` | package smoke | `rc.6`, `rc.8`, package-touched RCs | Packed CLI/MCP/Action runtime smoke. |
| `pnpm pack --dry-run` | package smoke | `rc.6`, `rc.8` | Root package content verification. |
| `pnpm --filter @codeagora/mcp pack --dry-run` | package smoke | `rc.6`, `rc.8` | MCP package content verification. |
| `pnpm build:action` | Action smoke | `rc.6`, `rc.7`, `rc.8` | Action bundle changed or release evidence refreshed. |
| `pnpm rc:desktop-gate` | private-preview only | desktop-touched RCs, `rc.8` | Desktop evidence, not stable desktop support. |
| `pnpm evidence:manifest -- --require=rc` | evidence | `rc.8`, RC handoff bundles | RC evidence manifest. |
| Live benchmark report | live-only | `rc.3`, `rc.4`, `rc.5`, `rc.8` | Quality, FP, cost, speed, or stable-candidate claims. |
| Live GitHub Action PR smoke | live-only | `rc.7`, `rc.8` | GitHub Action support or team automation claims. |
| Clean temporary install smoke | manual/package | `rc.6`, `rc.8` | Onboarding and published package claims. |
| MCP startup/tools list smoke | manual/package | `rc.6`, `rc.8` | MCP package startup claims. |

## RC Sequence

| RC | Korean label | English label | Primary question |
|----|--------------|---------------|------------------|
| `0.1.0-rc.3` | 실제 레포 테스트 | Real repository testing | Does CodeAgora produce useful reviews on realistic repositories and PRs? |
| `0.1.0-rc.4` | 오탐 / 노이즈 줄이기 | False-positive / noise reduction | Can the tool stay helpful without annoying maintainers? |
| `0.1.0-rc.5` | 비용 / 속도 최적화 | Cost / speed optimization | Can the default modes meet practical latency and budget expectations? |
| `0.1.0-rc.6` | 3분 세팅 | Three-minute setup | Can a new user install, initialize, and get a first useful run quickly? |
| `0.1.0-rc.7` | 팀 프로젝트 자동 리뷰 | Team project automatic review | Can the GitHub Action run continuously on a real team project? |
| `0.1.0-rc.8` | Stable 후보 | Stable candidate | Is the project ready for stable review, not automatic stable publication? |

## RC.3: Real Repository Testing

### Objective

Evaluate review quality against realistic repositories and PR shapes instead of
only deterministic fixtures and synthetic diffs.

The RC answers one question: when CodeAgora reviews real code, does it help a
maintainer decide what to fix?

### Workstreams

- Select a small initial set from `docs/REVIEW_BENCHMARK_REPO_SET.md` or real
  internal repositories.
- Run CodeAgora against at least five representative PR categories:
  - small bug fix
  - large refactor
  - documentation-only change
  - security-sensitive change
  - tests-only change
- Capture CLI, GitHub Action, and MCP behavior where practical.
- Manually label findings as actionable, false positive, missed issue, severity
  over-call, severity under-call, evidence mismatch, duplicate, or acceptable
  degraded result.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: Sample selection | Choose realistic repositories and PR shapes before running anything. | Sample matrix has repo label, PR type, expected behavior, surface, and artifact target. |
| Phase 2: Baseline runs | Capture current behavior without tuning against results. | CLI/Action/MCP runs are saved with commands, config, model/provider set, and output. |
| Phase 3: Manual classification | Convert raw review output into release evidence. | Every finding and miss has a label from the classification rubrics. |
| Phase 4: Blocker triage | Decide which failures block progression. | Blocker table names release blockers, RC blockers, follow-ups, and known limits. |
| Phase 5: RC.4 queue | Turn noisy patterns into the next RC's input queue. | Every meaningful FP/noise pattern has a proposed regression anchor. |

### Real-Repo Sample Matrix

Use this matrix in `rc3-real-repo-qa.md` before the first baseline run:

| Repo label | PR shape | Surface | Expected behavior | Artifact | Result label |
|------------|----------|---------|-------------------|----------|--------------|
| | Small bug fix | CLI / Action | Find real bug or stay quiet if fixed cleanly. | | |
| | Large refactor | CLI | Avoid behavior speculation unless evidence supports it. | | |
| | Docs-only | CLI / Action | No blocking findings. | | |
| | Security-sensitive | Full pipeline | Catch auth/token/path/SQL/sandbox risk when present. | | |
| | Tests-only | CLI / MCP | Avoid production-risk over-calls. | | |

### Sampling Plan

Minimum sample:

| Sample | Required shape | Surface |
|--------|----------------|---------|
| Small bug fix | One localized behavior change with a plausible bug. | CLI or GitHub Action |
| Large refactor | Multi-file movement or rename with minimal semantic change. | CLI |
| Documentation-only | README/docs-only change that should stay quiet. | CLI or GitHub Action |
| Security-sensitive | Auth, token, SQL, file path, sandbox, or webhook change. | Full pipeline |
| Tests-only | Test helper or fixture change with low production risk. | CLI or MCP |

Preferred extended sample:

- 2 to 3 repositories, not just one codebase.
- At least one run through the real CLI command.
- At least one run through the GitHub Action posting or dry-posting path.
- At least one MCP `review_quick`, `review_full`, or `dry_run` call where an MCP
  client path is practical.
- At least one clean or benign sample expected to produce no blocking findings.

### Metrics

Record these for each sampled run:

| Metric | Why it matters |
|--------|----------------|
| Actionable findings | Shows whether the tool adds real review value. |
| False positives | Shows annoyance and merge-blocking risk. |
| Missed high-severity issues | Blocks trust and stable quality claims. |
| Evidence mismatch | Catches invalid files, invalid lines, and fabricated quotes. |
| Severity mismatch | Catches over-blocking or under-reporting. |
| Duplicate rate | Shows whether grouping/dedup remains useful on real PRs. |
| Degraded result | Shows provider, timeout, config, or posting robustness. |
| Maintainer action | Records whether a human would fix, ignore, or disable. |

### Evidence Artifacts

Recommended artifact: `docs/rc-evidence/rc3-real-repo-qa.md`.

It should include:

- repo or sanitized repo label
- PR/diff description
- command or Action run URL
- config path and reviewer/model/provider set
- output mode
- findings table with labels
- false positives queued for `rc.4`
- missed issues queued for fixture or benchmark work
- final state: `pass`, `blocked`, or `needs another RC`

### Evidence Gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test --no-file-parallelism`
- `pnpm bench:ci`
- Real-repo QA note naming reviewed inputs, model/provider set, run mode, useful
  findings, misses, false positives, and whether any result blocks the next RC.

### Pass / Fail Criteria

Pass if:

- At least five realistic review runs are manually assessed.
- No severe evidence fabrication survives as a must-fix finding.
- No critical miss is accepted without a follow-up fixture or documented blocker.
- Every noisy pattern with real maintainer impact is queued for `rc.4`.

Fail if:

- A hallucinated file, line, or quote survives as a blocking issue.
- A known critical issue is missed and not explainable by scope or config.
- Documentation-only or tests-only changes produce blocking findings.
- The outputs are not useful enough for a maintainer to make a decision.

### Owner Checklist

- [ ] Quality owner selects sample repos and PR categories.
- [ ] Runtime owner records commands, configs, and model/provider sets.
- [ ] Quality owner labels findings with TP/FP/FN or equivalent labels.
- [ ] Docs owner records sanitized results and links to artifacts.
- [ ] Release owner decides whether `rc.4` may begin.

### Main Risks

- Sample is too biased toward one language, framework, or maintainer style.
- Private repository evidence leaks sensitive code or business context.
- Synthetic samples are mistaken for real-repo proof.
- Manual labels are inconsistent across reviewers.

### Rollback Rule

If real-repo QA finds systemic false positives, severe grounding failures, or
critical misses, cut another quality-focused RC before moving to cost or speed
work.

## RC.4: False-Positive / Noise Reduction

### Objective

Turn the noisy or irritating findings discovered during `rc.3` into measurable
regression cases, then tune the pipeline to reduce false positives without hiding
real high-severity issues.

This RC answers one question: can CodeAgora stay useful without annoying
maintainers or blocking harmless PRs?

### Workstreams

- Convert observed false-positive patterns into benchmark fixtures or focused
  unit tests.
- Tune hallucination filtering, finding-class priors, corroboration scoring,
  duplicate grouping, and severity calibration.
- Improve evidence wording so maintainers can distinguish must-fix items from
  verify/ignore items.
- Review presentation output for unnecessary noise in CLI, GitHub comments, and
  MCP compact responses.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: FP inventory | List every noisy pattern from `rc.3`. | Each pattern has source input, finding text, label, and suspected root cause. |
| Phase 2: Before-run | Reproduce noise on unchanged candidate behavior. | Baseline output proves the pattern still exists or is marked non-reproducible. |
| Phase 3: Noise tuning evidence | Apply only evidence-backed tuning. | Before/after table shows the finding removed, downgraded, or rerouted. |
| Phase 4: Recall safety check | Prove tuning did not hide real bugs. | High-severity recall fixtures and security tests still pass. |
| Phase 5: Residual noise list | Decide what remains acceptable. | Remaining noise is labeled known limit, follow-up, or blocker. |

### FP Pattern Matrix

Use this matrix in `rc4-noise-regression.md`:

| Pattern | Source input | Root cause | Before result | Regression anchor | After result | Residual risk |
|---------|--------------|------------|---------------|-------------------|--------------|---------------|
| | | Evidence mismatch | | | | |
| | | Severity over-call | | | | |
| | | Duplicate grouping | | | | |
| | | Speculative finding class | | | | |
| | | Presentation noise | | | | |

### Sampling Plan

Minimum sample:

| Sample | Expected behavior |
|--------|-------------------|
| `rc.3` false-positive cases | Noise should be removed, downgraded, or routed to verify/ignore. |
| Docs-only change | Zero blocking findings. |
| Tests-only change | Zero production-risk over-calls unless test behavior is actually broken. |
| Type-only import/refactor | No runtime-risk speculation. |
| Stable sorting / harmless refactor trap | No performance or correctness claim without evidence. |
| Security recall fixture | High-severity seeded bug still found. |

For every new FP pattern, decide whether it belongs in:

- a golden-bug FP-regression fixture
- a unit test around scorer/filter logic
- a parser/formatter regression test
- a docs-only known limit

### Metrics

Record these before and after tuning:

| Metric | Target direction |
|--------|------------------|
| FP clean-rate | Increase. |
| Blocking findings on benign diffs | Decrease to zero in sampled benign cases. |
| Severity over-call rate | Decrease. |
| Duplicate rate | Decrease. |
| Recall on high-severity fixtures | Must not regress. |
| Evidence mismatch count | Must not regress. |

### Evidence Artifacts

Recommended artifact: `rc4-noise-regression.md`.

It should include:

- each FP pattern observed in `rc.3`
- root cause classification
- regression anchor location
- before/after output summary
- remaining unresolved noise
- explicit recall check proving high-severity findings were not hidden

### Evidence Gates

- `pnpm test:security`
- `pnpm bench:ci`
- Targeted regression tests for new FP fixtures or scorer changes.
- Before/after QA summary for the `rc.3` noisy cases.

### Pass / Fail Criteria

Pass if:

- Every high-signal `rc.3` false-positive pattern has a regression anchor.
- Benign documentation-only, tests-only, type-only, and refactor changes do not
  produce blocking findings in sampled runs.
- High-severity seeded findings remain detectable after noise tuning.
- Severity labels are conservative enough for real PR automation.

Fail if:

- Tuning suppresses a known high-severity bug.
- Noise reduction works only for one hand-picked example.
- The tool still blocks benign PR categories without strong evidence.
- Dismissed or downgraded findings disappear without an auditable reason.

### Owner Checklist

- [ ] Quality owner maps every `rc.3` noisy pattern to a root cause.
- [ ] Runtime owner runs before/after samples with the same configs.
- [ ] Quality owner confirms recall fixtures still pass.
- [ ] Docs owner records remaining known noise and limits.
- [ ] Release owner decides whether cost/speed work may begin.

### Main Risks

- Overfitting to the first real-repo sample.
- Hiding real security, auth, or data-loss bugs under soft confidence penalties.
- Making triage too permissive so users miss important verify items.
- Optimizing presentation wording while leaving noisy scoring intact.

### Rollback Rule

If FP reduction suppresses known high-severity bugs, revert or narrow the tuning
and cut another noise-focused RC.

## RC.5: Cost / Speed Optimization

### Objective

Make review modes practical for regular use without deleting the core multi-agent
architecture.

This RC answers one question: can CodeAgora be fast and affordable enough to run
regularly while keeping the full mode trustworthy?

### Workstreams

- Measure quick, no-discussion, full, and selected-reviewer runs on the same
  fixture set.
- Tune reviewer count defaults, timeouts, model routing, cache behavior, chunking,
  and discussion thresholds.
- Keep quality comparisons attached to cost and latency changes.
- Document recommended modes for local quick checks, CI PR checks, and deeper
  manual audits.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: Fixed input set | Freeze the comparison inputs before measuring modes. | Same small, medium, large, recall, and clean inputs are used for all modes. |
| Phase 2: Mode matrix | Run each mode against each input. | Quick, no-discussion, full, named-reviewer, timeout, and no-cache rows are filled. |
| Phase 3: Timing/cost capture | Capture wall time, provider latency, tokens, and known/unknown cost. | Every row has runtime/cost data or an explicit unavailable note. |
| Phase 4: Quality delta review | Compare faster/cheaper modes against full mode. | Recall delta, FP delta, and decision delta are recorded. |
| Phase 5: Mode recommendation | Decide default, local quick, CI, and deep audit recommendations. | Recommendations include quality tradeoffs and known limits. |

### Cost / Speed Matrix

Use this matrix in `rc5-cost-speed-table.md`:

| Input | Mode | Wall time | Backend latency | Tokens | Known cost | Unknown cost note | Recall delta | FP delta | Decision delta | Recommendation |
|-------|------|-----------|-----------------|--------|------------|-------------------|--------------|----------|----------------|----------------|
| Small diff | Quick | | | | | | | | | |
| Small diff | Full | | | | | | | | | |
| Medium PR | No discussion | | | | | | | | | |
| Medium PR | Full | | | | | | | | | |
| Large diff | Full | | | | | | | | | |
| Clean fixture | Quick / Full | | | | | | | | | |
| Recall fixture | Quick / Full | | | | | | | | | |

### Sampling Plan

Use the same input set across all modes so comparisons are meaningful:

| Mode | Command shape | Purpose |
|------|---------------|---------|
| Quick | `agora review --quick` | Local fast feedback and MCP quick scan. |
| No discussion | `agora review --no-discussion` | Parallel review without L2 overhead. |
| Full | `agora review` | Default quality path. |
| Named reviewers | `agora review --reviewers r1,r2` | Predictable reviewer routing. |
| Timeout-constrained | `agora review --timeout ... --reviewer-timeout ...` | Degraded behavior under budget. |
| No cache | `agora review --no-cache` | Fresh provider behavior. |

The sample should include:

- one small diff
- one medium real PR
- one large or chunked diff
- one known high-severity fixture
- one clean FP-regression fixture

### Metrics

Record for each mode/input pair:

| Metric | Required note |
|--------|---------------|
| Wall time | End-to-end local or CI duration. |
| Backend latency | Per-reviewer/provider latency when available. |
| Reviewer count | Actual reviewers that ran. |
| Forfeited reviewers | Timeout or provider failure count. |
| Token usage | Prompt/completion/total when reported. |
| Known cost | Estimated or provider-reported cost. |
| Unknown cost | Provider did not report cost; name provider. |
| Recall delta | Difference from full mode on known-bug inputs. |
| FP delta | Difference from full mode on clean inputs. |
| Decision delta | ACCEPT/REJECT/NEEDS_HUMAN differences between modes. |

### Evidence Artifacts

Recommended artifact: `rc5-cost-speed-table.md`.

It should include:

- mode comparison table
- recommended default mode
- recommended quick/local mode
- recommended CI mode
- measured quality tradeoffs
- cost unknowns and provider caveats
- any changed timeout or reviewer defaults

### Evidence Gates

- `pnpm bench:ci`
- Live or replayed timing/cost table for representative diffs.
- CLI smoke for `--quick`, `--no-discussion`, `--reviewers`, `--timeout`,
  `--reviewer-timeout`, `--no-cache`, and `--output json`.

### Pass / Fail Criteria

Pass if:

- Default PR review latency and cost have explicit targets and measured results.
- Quick mode is fast enough for local pre-review use while clearly labeled as a
  reduced-depth path.
- Full mode preserves the quality behavior proven in `rc.3` and `rc.4`.
- Cost or speed optimizations do not change stable JSON/NDJSON contracts.

Fail if:

- Speed gains come mainly from removing the architecture without an explicit mode.
- Cheaper defaults materially reduce high-severity recall.
- Timeout behavior silently weakens verdicts without degraded output.
- Cost claims are made without token/cost data or an unknown-cost note.

### Owner Checklist

- [ ] Runtime owner selects identical inputs for all mode comparisons.
- [ ] Runtime owner records timing, token, and cost data.
- [ ] Quality owner records quality deltas against full mode.
- [ ] Docs owner updates mode guidance if defaults or recommendations change.
- [ ] Release owner decides whether onboarding work may begin.

### Main Risks

- Optimizing by deleting debate/model diversity instead of exposing clear modes.
- Provider cost blind spots due to missing token or price reporting.
- Local timing not matching GitHub Actions timing.
- Fast mode being mistaken for the stable quality claim.

### Rollback Rule

If speed work materially reduces recall or destabilizes contracts, prefer slower
safe defaults and move aggressive tuning behind explicit options.

## RC.6: Three-Minute Setup

### Objective

Prove that a new user can install CodeAgora, initialize a project, validate
configuration, and run the first useful review without handholding.

This RC answers one question: can a new maintainer go from zero to useful review
in about three minutes on at least one low-friction path?

### Workstreams

- Test clean global install and clean `npx` paths for the CLI and MCP package.
- Exercise `agora init`, `agora init --yes`, `agora init --ci`, and
  `agora doctor` from a fresh repository.
- Improve first-run errors for missing provider secrets, invalid config,
  unsupported Node versions, and GitHub Action setup mistakes.
- Align README, CLI reference, configuration docs, `.env.example`, MCP README,
  and GitHub Action examples.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: Clean environment | Start outside the repo checkout with no hidden dev dependencies. | Temporary project and install method are recorded. |
| Phase 2: Stopwatch setup path | Time the happy path from install to first useful review/dry-run. | Elapsed time, commands, and first useful output are recorded. |
| Phase 3: Failure-path setup | Exercise missing keys, invalid config, and unsupported setup states. | Errors are classified and checked for concrete next actions. |
| Phase 4: Docs alignment | Compare actual setup commands to README/docs/examples. | Mismatches are fixed or queued as blockers. |
| Phase 5: Package smoke decision | Decide whether package/install behavior is safe enough for team automation. | Package dry-runs and startup smokes are green. |

### Setup Stopwatch Matrix

Use this matrix in `rc6-setup-smoke.md`:

| Flow | Install method | Start point | First useful output | Elapsed time | First failure | Docs mismatch | Pass/fail |
|------|----------------|-------------|---------------------|--------------|---------------|---------------|-----------|
| Global CLI | `npm i -g` | Empty temp repo | | | | | |
| `npx` CLI | `npx -y` | Empty temp repo | | | | | |
| Config wizard | `agora init` | Empty temp repo | | | | | |
| Non-interactive init | `agora init --yes` | Empty temp repo | | | | | |
| GitHub Action setup | `agora init --ci` or docs copy | Test repo | | | | | |
| MCP startup | package command | MCP client/test shell | | | | | |

### Sampling Plan

Run setup from clean temporary directories, not the repository checkout:

| Flow | Required steps |
|------|----------------|
| Global CLI | Install package, run `agora --help`, run `agora init --yes`, run first review or dry run. |
| `npx` CLI | Run package command without global install and confirm startup/help. |
| Config wizard | Run interactive or scripted init path and inspect generated `.ca/config.*`. |
| Doctor | Run `agora doctor` and, where safe, `agora doctor --live`. |
| GitHub Action template | Generate or copy workflow and verify prerelease refs/secrets guidance. |
| MCP startup | Start published or packed MCP package and list tools. |

Measure at least one happy path from a clean project:

```txt
install -> init -> doctor -> first review/dry-run
```

### Metrics

Record:

| Metric | Definition |
|--------|------------|
| Time to first useful review | Start from install command; stop when review/dry-run output is usable. |
| Failed setup step | First step where a new user gets blocked. |
| Error clarity | Whether the message names the fix. |
| Docs mismatch | Any command or requirement missing from docs. |
| Package-content issue | Missing binary, runtime data, README, or MCP file. |
| Secret guidance issue | Confusing or unsafe API key/GitHub secret guidance. |

### Evidence Artifacts

Recommended artifact: `rc6-setup-smoke.md`.

It should include:

- machine/environment summary
- package version and install method
- stopwatch timing or command timestamps
- setup transcript summary, not raw secrets
- first failure point if any
- docs corrections made or queued
- package dry-run summary

### Evidence Gates

- `pnpm release:beta-smoke`
- Root package dry-run and MCP package dry-run.
- Clean temporary install smoke for `agora --help`, `agora init --yes`,
  `agora doctor`, and a minimal review path.
- Documentation review for prerelease wording and setup consistency.

### Pass / Fail Criteria

Pass if:

- A fresh user path can be completed in roughly three minutes for at least one
  free or low-friction provider setup.
- Setup failures point to concrete next actions instead of raw stack traces.
- Published package contents include required runtime data and exclude tests,
  secrets, `bench-out*`, and `.sisyphus/evidence` artifacts.
- Docs do not imply stable release, stable desktop support, or npm `latest`.

Fail if:

- CLI binary startup fails from the packed or published package.
- MCP package startup fails outside the repo checkout.
- First-run setup requires undocumented manual steps.
- Missing-secret or invalid-config errors are confusing or unsafe.
- Docs recommend a stable ref or stable wording before approval.

### Owner Checklist

- [ ] Runtime owner runs clean install and package smoke paths.
- [ ] Docs owner verifies setup docs against actual commands.
- [ ] Runtime owner verifies MCP startup and tool listing.
- [ ] Release owner verifies dist-tag and package-content guardrails.
- [ ] Desktop preview owner verifies desktop wording remains private preview only.

### Main Risks

- Local maintainer machine hides missing package files.
- Setup works only because repository dev dependencies are present.
- Prerelease docs accidentally imply stable installation or Action refs.
- Three-minute path ignores provider key friction and therefore overclaims ease.

### Rollback Rule

If install, binary startup, or package contents regress, cut another onboarding
or packaging RC before team automation work.

## RC.7: Team Project Automatic Review

### Objective

Run CodeAgora continuously on a real team project so PR automation behavior is
validated across normal collaboration patterns.

This RC answers one question: would a real team keep CodeAgora enabled on PRs?

### Workstreams

- Attach the GitHub Action to a real team repository or representative private
  project.
- Observe normal PRs, rebased PRs, force-pushed PRs, oversized diffs, missing
  provider secrets, provider failures, and duplicate posting scenarios.
- Confirm review output is useful to maintainers and not just mechanically valid.
- Track whether findings actually lead to fixes, ignores, or documented false
  positives.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: Team repo setup | Install the Action in a real or representative team project. | Workflow, config, secrets model, and branch policy are recorded. |
| Phase 2: Normal PR trial | Observe normal same-repo PRs. | Review output, comments, statuses, and maintainer actions are recorded. |
| Phase 3: Degraded-path trial | Exercise unsafe or constrained scenarios. | Fork/missing-secret, stale-head, oversized, provider-failure, and 422 behavior are recorded. |
| Phase 4: Maintainer feedback | Decide whether output is useful enough to keep. | Maintainer actions are labeled: fixed, ignored, disabled, or kept-enabled. |
| Phase 5: Keep/disable decision | Make the team automation go/no-go call. | Evidence note says keep enabled, keep with config changes, or block stable candidate. |

### Team PR Matrix

Use this matrix in `rc7-team-review-smoke.md`:

| Scenario | PR/run | Posting result | Status/check result | Degraded reason | Maintainer action | Blocker? |
|----------|--------|----------------|---------------------|-----------------|-------------------|----------|
| Normal same-repo PR | | | | | | |
| Follow-up push | | | | | | |
| Force-push or rebase | | | | `stale-head` if applicable | | |
| Oversized diff | | | | `oversized-diff` | | |
| Missing provider secret | | | | `missing-provider-secret` | | |
| Fork PR without secrets | | | | `fork-missing-provider-secrets` | | |
| Provider/API failure | | | | `provider-timeout` or related | | |
| GitHub posting fallback | | | | `github-posting-422` if applicable | | |
| Benign PR | | | | | | |
| Risky PR | | | | | | |

### Sampling Plan

Minimum live/team matrix:

| Scenario | Required observation |
|----------|----------------------|
| Normal same-repo PR | Review runs, posts, and records session/head/base SHA. |
| Follow-up push | New run supersedes or coexists safely without stale comments. |
| Force-push or rebase | Stale head is detected or posting targets the latest head only. |
| Oversized diff | Review skips or degrades with a structured reason. |
| Missing provider secret | Action skips/degrades safely without pretending to review. |
| Provider/API failure | Output is structured and actionable. |
| Benign PR | No noisy blocking behavior. |
| Risky PR | High-value finding appears or miss is recorded. |

Preferred additional observations:

- PR where maintainers accept a CodeAgora finding and fix code.
- PR where maintainers intentionally ignore a finding and classify why.
- PR where CodeAgora should stay silent.
- PR where MCP or CLI is used alongside Action output for follow-up.

### Metrics

Record:

| Metric | Definition |
|--------|------------|
| Useful comments | Findings maintainers considered actionable or worth checking. |
| Ignored comments | Findings maintainers ignored as irrelevant/noisy. |
| Blocking false positives | False positives that would block merge or waste review time. |
| Duplicate/stale comments | Comments repeated or attached to stale head/diff. |
| Degraded-path correctness | Whether degraded reason matched the actual scenario. |
| Secret safety | No provider key/token appears in logs/comments/artifacts. |
| Maintainer decision | Keep enabled, disable, restrict mode, or continue trial. |

### Evidence Artifacts

Recommended artifact: `rc7-team-review-smoke.md`.

It should include:

- repository/project label, sanitized if private
- PR matrix with links or redacted identifiers
- Action run URLs or local artifact references
- degraded reason codes observed
- maintainer feedback summary
- finding action summary: fixed, ignored, disputed, missed
- decision: keep enabled, keep with config changes, or block stable candidate

### Evidence Gates

- Live GitHub Action PR smoke for same-repository PRs.
- Fork or missing-secret degraded-path evidence.
- Stale-head or force-push behavior evidence.
- Oversized-diff skip evidence.
- Summary of team feedback and maintainer actions.

### Pass / Fail Criteria

Pass if:

- PR comments, summary comments, statuses, SARIF output, and degraded outputs are
  stable across repeated real workflows.
- No duplicate or stale comments are posted after reruns or force pushes.
- Missing-secret and fork scenarios degrade safely without leaking credentials.
- Maintainers judge the review output useful enough to keep enabled.

Fail if:

- The Action posts stale, duplicate, or misleading review comments.
- The Action blocks benign PRs with noisy findings.
- Fork or missing-secret behavior risks leaking secrets or confusing maintainers.
- Maintainers would disable the tool after the trial.

### Owner Checklist

- [ ] Runtime owner configures real or representative team Action workflow.
- [ ] Quality owner labels maintainer feedback and finding outcomes.
- [ ] Runtime owner verifies stale-head, duplicate, and degraded paths.
- [ ] Docs owner records setup and known-limit corrections.
- [ ] Release owner decides whether `rc.8` stable-candidate review may begin.

### Main Risks

- Team annoyance from noisy merge-blocking comments.
- Stale-head posting after force-push or rebase.
- Fork-secret confusion between `GITHUB_TOKEN` and provider credentials.
- Success on one team project being overgeneralized as broad stable proof.

### Rollback Rule

If team automation creates noisy blocking behavior, unsafe posting, stale-review
risk, or unclear degraded states, keep the release candidate prerelease-only and
fix before stable-candidate review.

## RC.8: Stable Candidate

### Objective

Freeze behavior and assemble current evidence for a stable-candidate review.
`rc.8` is not automatic stable publication; it is the candidate that asks whether
stable promotion is justified.

This RC answers one question: can maintainers decide stable promotion from
evidence instead of optimism?

### Workstreams

- Stop feature expansion except for release blockers.
- Regenerate deterministic evidence logs and the RC evidence manifest.
- Refresh live benchmark and live GitHub Action PR smoke evidence if stale.
- Review stable machine contracts, release wording, package contents, docs, and
  known limits.
- Confirm desktop remains private preview in all public release copy.

### Execution Phases

| Phase | Goal | Done when |
|-------|------|-----------|
| Phase 1: Freeze audit | Confirm no feature or contract change remains planned before stable review. | Contract change table is empty or has migration notes. |
| Phase 2: Evidence regeneration | Re-run deterministic, package, security, desktop-preview, and manifest gates. | Evidence manifest and command tables are current. |
| Phase 3: Wording audit | Check README, docs, release notes, Action examples, and package copy. | No accidental stable/latest/public desktop wording remains. |
| Phase 4: Go/no-go review | Collect role decisions and blockers. | Go/no-go summary is filled by owner role. |
| Phase 5: Stable decision packet | Prepare inputs for a separate stable promotion decision. | Packet says evidence complete; it does not publish or promote automatically. |

### Stable-Candidate Audit Matrix

Use this matrix in `rc8-stable-candidate-summary.md`:

| Evidence item | Command/source | SHA/date | Artifact | Freshness | Owner role | Pass/fail | Notes |
|---------------|----------------|----------|----------|-----------|------------|-----------|-------|
| Typecheck | `pnpm typecheck` | | | | Runtime owner | | |
| Lint | `pnpm lint` | | | | Runtime owner | | |
| Build | `pnpm build` | | | | Runtime owner | | |
| Full tests | `pnpm test --no-file-parallelism` | | | | Runtime owner | | |
| Security gate | `pnpm test:security` | | | | Quality owner | | |
| Benchmark gate | `pnpm bench:ci` | | | | Quality owner | | |
| Package smoke | `pnpm release:beta-smoke` | | | | Runtime owner | | |
| Desktop preview gate | `pnpm rc:desktop-gate` | | | | Desktop preview owner | | |
| Evidence manifest | `pnpm evidence:manifest -- --require=rc` | | | | Release owner | | |
| Live benchmark | GitHub Actions / artifact | | | | Quality owner | | |
| Live Action smoke | PR run / artifact | | | | Runtime owner | | |
| Docs wording audit | README/docs/release notes | | | | Docs owner | | |
| Contract freeze | JSON/NDJSON/MCP/Action/config/session | | | | Release owner | | |

### Sampling Plan

`rc.8` should not introduce new feature sampling. It is an evidence refresh and
release-readiness audit.

Required audit set:

| Audit item | Required result |
|------------|-----------------|
| Deterministic commands | All required gates pass from a clean checkout or documented RC environment. |
| Package dry-runs | Intended files included; tests, secrets, evidence dirs, and `bench-out*` excluded. |
| Machine contracts | `codeagora.review.v1` JSON/NDJSON and MCP JSON output remain stable or have migration notes. |
| GitHub Action behavior | Inputs, outputs, degraded reasons, posting behavior, and refs are documented. |
| Live benchmark | Current enough for any quality claim in release copy. |
| Live Action smoke | Current enough for any GitHub Action support claim. |
| Desktop wording | Private preview only. No public stable desktop implication. |
| Known limits | Provider nondeterminism, cost variance, language coverage, fork secrets, and live-only gaps named. |

### Metrics

Record:

| Metric | Definition |
|--------|------------|
| Evidence freshness | Date/SHA/run URL for each required artifact. |
| Open blockers | Count and description of unresolved release blockers. |
| Contract changes | Any JSON, NDJSON, MCP, Action, config, or session artifact change since prior RC. |
| Docs drift | Any mismatch between README, CLI docs, Action docs, MCP docs, and release notes. |
| Stable wording risk | Any text implying stable/latest/public desktop before approval. |
| Known-limit coverage | Whether each known limit is named in release copy or docs. |

### Evidence Artifacts

Recommended artifact: `rc8-stable-candidate-summary.md`.

It should include:

- current commit SHA
- package versions and intended prerelease dist-tags
- deterministic command table
- package dry-run summary
- live evidence links
- contract freeze statement
- known limits
- stable-promotion decision inputs
- explicit statement that publication is separate approval

### Evidence Gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test --no-file-parallelism`
- `pnpm test:security`
- `pnpm bench:ci`
- `pnpm release:beta-smoke`
- `pnpm rc:desktop-gate`
- `pnpm evidence:manifest -- --require=rc`
- Root and MCP package dry-runs.
- Current live benchmark report and live GitHub Action PR smoke report.

### Pass / Fail Criteria

Pass if:

- CLI, GitHub Action, and MCP contracts are frozen or have explicit migration
  notes.
- Stable-candidate evidence is current and auditable.
- Known limits are documented, especially provider nondeterminism, cost variance,
  live-only evidence, language coverage, and fork-secret behavior.
- No release text implies stable desktop support or automatic `latest` promotion.
- Maintainers can decide stable promotion from evidence instead of guesswork.

Fail if:

- Any required evidence gate is missing, stale, or failing.
- A behavior or contract change is still planned before stable.
- Release copy implies automatic stable publication, npm `latest`, stable Action
  refs, or public desktop support.
- Live quality or GitHub Action claims rely on stale live-only evidence.

### Owner Checklist

- [ ] Release owner verifies versions, dist-tags, release notes, and manifest.
- [ ] Runtime owner verifies deterministic gates and package dry-runs.
- [ ] Quality owner verifies live benchmark and known quality limits.
- [ ] Docs owner audits README/docs/release copy for wording drift.
- [ ] Desktop preview owner confirms all desktop wording remains private preview.
- [ ] Maintainers make a separate stable-promotion decision after RC evidence.

### Main Risks

- Hidden contract change discovered late.
- Stale live benchmark or Action evidence reused for a fresh claim.
- Accidental `latest` or stable wording in docs/release copy.
- Desktop private preview being interpreted as stable desktop support.
- Treating `rc.8` pass as automatic publication approval.

### Rollback Rule

If `rc.8` needs a behavior or contract change, cut another RC. Do not promote a
candidate that still requires semantic changes.

## Go / No-Go Process

Run this process at the end of every RC, and run the full version at the end of
`rc.8`.

### Required Inputs

| Input | Required for | Notes |
|-------|--------------|-------|
| RC evidence note | every RC | Uses the template in this document. |
| Command result table | every RC | Shows deterministic gates and relevant smoke commands. |
| Live artifact table | live-claim RCs | Required for real-repo, quality, Action, and stable-candidate claims. |
| Finding classification table | `rc.3`, `rc.4`, `rc.7` | Required when judging review usefulness or noise. |
| Cost/speed table | `rc.5` | Required before changing defaults or recommendations. |
| Setup stopwatch table | `rc.6` | Required before claiming three-minute setup. |
| Stable-candidate audit matrix | `rc.8` | Required before a stable promotion review can even be considered. |
| Blocker table | every RC with failures | Required for `blocked` or `needs another RC`. |

### Role Decisions

| Role | Must answer |
|------|-------------|
| Release owner | Are versioning, prerelease dist-tags, release notes, and evidence manifest safe? |
| Quality owner | Are review quality, FP/FN behavior, severity, and grounding acceptable for this RC? |
| Runtime owner | Are CLI, MCP, GitHub Action, package, and degraded behaviors acceptable? |
| Docs owner | Are README/docs/examples/release copy accurate and free of stable/latest drift? |
| Desktop preview owner | Is any desktop evidence clearly private-preview only? |

### Outcomes

| Outcome | Meaning | Next action |
|---------|---------|-------------|
| `go to next RC` | Objective met, no release blockers. | Start the next RC using recorded evidence as baseline. |
| `repeat current RC` | Objective partially met but still bounded. | Cut another prerelease loop with the same focus. |
| `block and triage` | Safety, quality, contract, package, or wording blocker exists. | Stop RC progression until fixed and retested. |
| `stable review packet ready` | `rc.8` evidence is complete. | Maintainers may separately decide stable promotion. No automatic publish. |

### Stable Promotion Is Separate

Even if `rc.8` reaches `stable review packet ready`, stable promotion still needs
a separate approval step for release wording, npm dist-tags, GitHub Action refs,
package contents, known-limit disclosures, and publication timing.

## Cross-RC Risk Register

| Risk | Applies to | Mitigation |
|------|------------|------------|
| Real-repo evidence leaks private data | `rc.3`, `rc.7` | Sanitize summaries, link private artifacts only where access is controlled, do not commit raw transcripts. |
| FP tuning hides real bugs | `rc.4` | Pair every noise reduction with recall checks and security regression tests. |
| Speed work weakens quality | `rc.5` | Compare every faster mode against full mode and document tradeoffs. |
| Setup success depends on local repo state | `rc.6` | Run clean temporary install and packed/published package smoke paths. |
| Team trial overgeneralizes from one repo | `rc.7` | Record project context and avoid broad language/framework claims. |
| Stable wording appears too early | all | Keep prerelease/stable boundary checks in release docs and evidence review. |
| Desktop scope expands silently | all | Keep desktop as private preview and forbid desktop-only review semantics. |

## Evidence Register

Each RC should attach a short evidence note or update existing evidence docs with:

- command outputs or log filenames for deterministic gates
- live run URLs or artifact names for live-only gates
- model/provider set used for quality claims
- TP/FP/FN, severity, latency, token, and cost notes when available
- manual QA notes for real repository and team project runs
- known limits and any deferred blockers

Use `docs/RELEASE_EVIDENCE.md` as the source of truth for evidence filenames and
for the split between deterministic gates and live-only claims.

## Stable-Promotion Boundary

Stable promotion is a separate decision after this roadmap. It may only be
considered after the stable-candidate evidence remains green through the RC cycle
and maintainers explicitly approve release wording, npm dist-tags, GitHub Action
refs, package contents, and known-limit disclosures.

Until that approval exists:

- publish prereleases under prerelease dist-tags only
- do not assign prerelease versions to npm `latest`
- do not document desktop as stable public support
- do not market benchmark quality beyond the captured evidence
- do not expand the stable surface beyond CLI, GitHub Action, and MCP

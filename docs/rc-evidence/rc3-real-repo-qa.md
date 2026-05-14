<!-- Parent: ../RC3_TO_RC8_PRERELEASE_ROADMAP.md -->

# RC.3 Real Repository QA

## Purpose

This evidence note tracks the `0.1.0-rc.3` real repository testing cycle. It is
the working artifact for deciding whether CodeAgora produces useful, grounded
reviews on realistic repositories and PR shapes.

`rc.3` is prerelease-only. Passing this note does not imply stable publication,
npm `latest` promotion, stable GitHub Action refs, or stable public desktop
support.

## Decision State

- RC: `0.1.0-rc.3`
- Korean label: 실제 레포 테스트
- English label: Real repository testing
- Date started: 2026-05-14
- Commit SHA: `2474362de742b75dbf8c20d32b9b0e733f475c92`
- Package versions: `@codeagora/review@0.1.0-rc.2`
- Decision state: `complete with blockers`; baseline outputs were captured, but
  noise and JSON-output contract issues block rc.4 tuning until triaged
- Primary question: Does CodeAgora produce useful reviews on realistic
  repositories and PRs?
- Next RC recommendation: open rc.4 false-positive/noise reduction work from the
  R3-02 and R3-04 findings before making quality claims

## Owner Roles

| Role | Owner | Responsibility |
|------|-------|----------------|
| Release owner | TBD | Version, prerelease boundary, evidence manifest impact, final go/no-go summary. |
| Quality owner | TBD | Real-repo sample design, finding classification, FP/FN/severity judgement. |
| Runtime owner | TBD | CLI, GitHub Action, MCP commands, configs, timings, degraded behavior. |
| Docs owner | TBD | Evidence note, docs drift, public wording boundaries. |
| Desktop preview owner | TBD | Private-preview wording only if desktop evidence is referenced. |

## Sample Matrix

Fill this before tuning or changing any behavior.

| ID | Repo label | PR shape | Surface | Expected behavior | Artifact | Result label | Status |
|----|------------|----------|---------|-------------------|----------|--------------|--------|
| R3-01 | CodeAgora PR #502: `fix: fall back to local action diff` | Small bug fix | CLI / GitHub Action | Should identify Action diff fallback behavior as a targeted bug fix and avoid broad unrelated review noise. | https://github.com/bssm-oss/CodeAgora/pull/502 | baseline-success | completed |
| R3-02 | CodeAgora PR #512: `chore: retire legacy plugin and tools surfaces` | Large refactor | CLI | Should avoid behavior speculation from large deletions and focus only on real packaging/surface regressions. | https://github.com/bssm-oss/CodeAgora/pull/512 | noisy-needs-human | completed |
| R3-03 | CodeAgora PR #514: `docs: add production readiness roadmap` | Documentation-only | CLI / GitHub Action | Should produce no blocking findings and only low-value docs suggestions if strongly grounded. | https://github.com/bssm-oss/CodeAgora/pull/514 | quick-clean | completed |
| R3-04 | CodeAgora PR #525: `fix(mcp): harden tool errors and path bounds` | Security-sensitive | Full pipeline | Should scrutinize MCP path boundary and structured error behavior without fabricating inaccessible-path claims. | https://github.com/bssm-oss/CodeAgora/pull/525 | noisy-needs-human | completed |
| R3-05 | CodeAgora PR #503: `test: guard product surface reset` | Tests-only | CLI / MCP | Should avoid production-risk over-calls and treat the change as regression coverage for surface-scope hygiene. | https://github.com/bssm-oss/CodeAgora/pull/503 | baseline-success | completed |

## Baseline Command Plan

Use unchanged candidate behavior for the first baseline pass.

| ID | Command or run | Config | Provider/model set | Output mode | Expected artifact | Status |
|----|----------------|--------|--------------------|-------------|-------------------|--------|
| R3-01 | `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-01-pr502.patch --output json --no-cache --quiet` | `benchmarks/.ca/config.low-cost-diverse.json` copied temporarily to `.ca/config.json` | OpenRouter low-cost diverse | JSON | `.sisyphus/evidence/rc3/R3-01-pr502.json` | success, `ACCEPT` |
| R3-02 | `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-02-pr512.patch --output json --no-cache --quiet --timeout 300` | `benchmarks/.ca/config.low-cost-diverse.json` copied temporarily to `.ca/config.json` | OpenRouter low-cost diverse | JSON | `.sisyphus/evidence/rc3/R3-02-pr512.json` | success, `NEEDS_HUMAN` |
| R3-03 | `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-03-pr514.patch --quick --output json --no-cache --quiet` | `benchmarks/.ca/config.low-cost-diverse.json` copied temporarily to `.ca/config.json` | OpenRouter low-cost diverse | JSON | `.sisyphus/evidence/rc3/R3-03-pr514.json` | success, quick clean |
| R3-04 | `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-04-pr525.patch --output json --no-cache --quiet` | `benchmarks/.ca/config.low-cost-diverse.json` copied temporarily to `.ca/config.json` | OpenRouter low-cost diverse | JSON | `.sisyphus/evidence/rc3/R3-04-pr525.json` | success, `NEEDS_HUMAN` |
| R3-05 | `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-05-pr503.patch --output json --no-cache --quiet` | `benchmarks/.ca/config.low-cost-diverse.json` copied temporarily to `.ca/config.json` | OpenRouter low-cost diverse | JSON | `.sisyphus/evidence/rc3/R3-05-pr503.json` | success, `ACCEPT` |

## Command Results

| Command | Environment | Result | Log/artifact | Notes |
|---------|-------------|--------|--------------|-------|
| `pnpm typecheck` | Local pnpm workspace | pass | terminal output, 2026-05-14 | Deterministic gate passed before baseline setup. |
| `pnpm lint` | Local pnpm workspace | pass | terminal output, 2026-05-14 | Deterministic gate passed before baseline setup. |
| `pnpm build` | Local pnpm workspace | pass | terminal output, 2026-05-14 | Deterministic gate passed before baseline setup. |
| `pnpm test` | Local pnpm workspace | pass | terminal output, 2026-05-14 | 217 files and 3,483 tests passed; live E2E skipped. |
| `pnpm bench:ci` | Local pnpm workspace | pass | terminal output, 2026-05-14 | 20 provider-free benchmark fixtures validated. |
| `pnpm dev review --pr <id> ...` | No `GITHUB_TOKEN` | setup error | first-attempt logs, 2026-05-14 | The CLI `--pr` path requires `GITHUB_TOKEN`, so baseline uses local patch files fetched by `gh pr diff`. |
| `pnpm --silent exec tsx ... review .sisyphus/evidence/rc3/diffs/R3-*.patch ...` before credential setup | No `OPENROUTER_API_KEY` | provider auth error | superseded by rerun | The first patch-based attempt confirmed safe structured auth errors. |
| `pnpm --silent exec tsx ... review .sisyphus/evidence/rc3/diffs/R3-*.patch ...` after credential setup | `OPENROUTER_API_KEY` available in local CodeAgora credential store | pass | `.sisyphus/evidence/rc3/R3-*.json` | All five patch-based baseline runs completed with `schemaVersion: codeagora.review.v1`. |
| JSON artifact normalization | CLI stdout contained logger/progress lines before result JSON | manual cleanup | `.sisyphus/evidence/rc3/R3-*.json` | Evidence artifacts were trimmed to the first JSON object so jq/tooling can parse them; the stdout contamination is tracked as an RC blocker. |

## Finding Classification Table

Use labels from `docs/RC3_TO_RC8_PRERELEASE_ROADMAP.md`.

| Input | Surface | Finding | Label | Severity | Evidence quality | Maintainer action | Follow-up |
|-------|---------|---------|-------|----------|------------------|-------------------|-----------|
| R3-01 | CLI patch-file baseline | No final findings; one non-existent-code finding was removed by hallucination filtering. | TN-clean | n/a | strong | No product fix from this sample. | Keep as clean small-fix baseline. |
| R3-02 | CLI patch-file baseline | Four high-severity findings on a large refactor, all with very low confidence (`4%` to `18%`), including one `unknown:0` location and legacy plugin/package speculation. | FP-noise | CRITICAL / HARSHLY_CRITICAL | weak | Triage as rc.4 noise-reduction input, not as release-blocking correctness evidence. | Add regression anchors for low-confidence high-severity findings and invalid locations. |
| R3-03 | CLI quick baseline | Documentation-only PR produced no findings. Quick mode returned `NEEDS_HUMAN` because there is no head verdict in lightweight mode. | TN-clean | n/a | strong | No product fix from finding quality; consider whether quick-mode decision wording should be clearer. | Keep as docs-only clean baseline. |
| R3-04 | CLI patch-file baseline | Twelve findings on security-sensitive MCP changes: 4 CRITICAL, 7 WARNING, 1 SUGGESTION; confidence ranged `6%` to `39%`, so most are verify/noise candidates rather than proven must-fix issues. | TP-verify / FP-noise mixed | SUGGESTION to CRITICAL | weak-to-medium | Human triage required before claiming useful security review quality. | Use as rc.4 calibration input for MCP/path-boundary reviews. |
| R3-05 | CLI patch-file baseline | Tests-only PR produced no findings and `ACCEPT`. | TN-clean | n/a | strong | No product fix from this sample. | Keep as tests-only clean baseline. |

## Missed Issue Table

Record expected or human-discovered issues that CodeAgora did not surface
usefully.

| Input | Expected issue | Expected severity | Was in reviewed diff? | Observed output | Label | Follow-up |
|-------|----------------|-------------------|-----------------------|-----------------|-------|-----------|
| R3-02 | Avoid broad behavior speculation on large deletion/refactor PRs | WARNING-level verify at most | yes | `NEEDS_HUMAN` with 4 high-severity, very low-confidence findings, including `unknown:0`. | severity-overcall / noise | rc.4 should downrank or suppress low-confidence high-severity findings with weak grounding. |
| R3-04 | Scrutinize MCP path-boundary/security changes without fabricating inaccessible-path claims | WARNING/CRITICAL if strongly grounded | yes | `NEEDS_HUMAN` with 12 findings; confidence is mostly below 40%, so useful signal is not yet separated from noise. | calibration-needed | Human triage each finding before deciding true misses or true positives. |

## Noise Queue For RC.4

Every meaningful false positive or annoying low-value pattern should become an
`rc.4` input.

| Pattern | Source input | Root cause guess | User impact | Proposed regression anchor | Priority |
|---------|--------------|------------------|-------------|----------------------------|----------|
| High-severity findings with very low confidence | R3-02, R3-04 | Confidence calibration and L3 summary still surface CRITICAL/HARSHLY_CRITICAL items even when confidence is `4%` to `18%`. | Creates scary but weak `NEEDS_HUMAN` output. | Fixture using R3-02-style large deletion with invalid/low-confidence findings. | P0 |
| Invalid `unknown:0` location survives into final output | R3-02 | Parser/hallucination filter did not remove a package-speculation finding with no real file/line. | Undermines trust in grounded review claims. | Regression on `unknown:0` evidence document. | P0 |
| JSON output polluted by logger/progress prelude | R3-01 through R3-04 observed before normalization | Pipeline/logger writes non-JSON lines to stdout under `--output json --quiet`. | Breaks machine consumers until artifacts are manually trimmed. | CLI JSON contract test for no stdout bytes before `{`. | P0 |
| Docs-only quick mode reports `NEEDS_HUMAN` despite no findings | R3-03 | Quick mode skips head verdict and uses lightweight placeholder decision. | May confuse automation using quick JSON. | Quick docs-only fixture expecting explicit lightweight/no-verdict marker. | P1 |

## Degraded Behavior Table

| Input | Degraded label | User-facing behavior | Safe? | Follow-up |
|-------|----------------|----------------------|-------|-----------|
| Initial direct `--pr` attempt | missing-github-token | CLI failed before fetching PR diff because `GITHUB_TOKEN` was unavailable. | safe | Keep patch-file fallback for baseline; test direct PR mode separately with token. |
| Initial patch attempt | missing-openrouter-key | CLI returned structured JSON errors before reviewer execution. | safe | Superseded by credential-backed rerun. |
| R3-02 | partial-reviewer-forfeit | Baseline succeeded with `forfeitedReviewers: 1` across a very large, multi-chunk refactor. | safe but noisy | Track whether one forfeit is expected under low-cost model config. |

## Metrics Summary

| Metric | Value | Notes |
|--------|-------|-------|
| Samples completed | 5 / 5 | All selected real-repo patch inputs completed after credential setup. |
| Successful JSON artifacts captured | 5 / 5 | `.sisyphus/evidence/rc3/R3-01-pr502.json` through `.sisyphus/evidence/rc3/R3-05-pr503.json`. |
| Patch inputs captured | 5 / 5 | `.sisyphus/evidence/rc3/diffs/R3-*.patch` fetched by `gh pr diff`. |
| Decisions | 2 `ACCEPT`, 3 `NEEDS_HUMAN` | R3-03 is quick/lightweight `NEEDS_HUMAN` with no findings. |
| Total final findings | 16 | R3-02 has 4; R3-04 has 12; R3-01/R3-03/R3-05 have 0. |
| Actionable findings | TBD after human triage | R3-04 may include verify-worthy MCP security/path-boundary items. |
| Verify findings | 12 candidate | R3-04 findings are the main verify queue. |
| False positives | 4 likely plus TBD | R3-02 high-severity findings are likely noise from large deletion/refactor context. |
| Blocking false positives | 1 likely | R3-02 has a `HARSHLY_CRITICAL` low-confidence code-injection claim against retired plugin code. |
| Critical misses | unknown | Requires human review of expected issues per sample. |
| Grounding failures | at least 1 | R3-02 emitted `unknown:0` for a packaging claim. |
| Severity over-calls | likely | R3-02 low-confidence CRITICAL/HARSHLY_CRITICAL findings. |
| Severity under-calls | TBD | Needs human comparison against PR intent. |
| Duplicate findings | possible | R3-04 includes multiple `review-quick` repo-path related findings. |
| Degraded runs | 1 / 5 | R3-02 had `forfeitedReviewers: 1`; all runs still returned `status: success`. |
| Total reported backend cost | `$0.0917` | Extracted from performance reports across five artifacts. |

## Blocker Table

| Blocker | Class | Evidence | Owner role | Required fix | Retest command/artifact | Status |
|---------|-------|----------|------------|--------------|-------------------------|--------|
| JSON output contract pollution | RC blocker | Logger/progress lines appeared before JSON in successful `--output json --quiet` runs | Runtime owner | Ensure machine output formats write only the requested format to stdout; move logs to stderr or structured channels. | Rerun one baseline artifact and parse with `jq` without manual normalization | open |
| Low-confidence high-severity noise | RC blocker | R3-02 emitted CRITICAL/HARSHLY_CRITICAL findings at `4%` to `18%` confidence | Quality owner | Tune L3 triage and confidence/severity interaction before quality claims. | Rerun R3-02 after rc.4 tuning | open |
| Invalid final location | RC blocker | R3-02 emitted `unknown:0` final finding | Quality owner | Filter or quarantine findings with invalid file/line grounding. | Regression fixture for invalid final locations | open |
| Direct PR mode requires `GITHUB_TOKEN` | Known surface blocker | First `pnpm dev review --pr <id>` attempts failed with `GitHub token is required` | Runtime owner | Set `GITHUB_TOKEN` before direct `--pr` runs, or continue using local patch inputs for baseline evidence. | Direct `--pr` run for one sample | open |

## Known Limits

- The selected samples are all from the CodeAgora repository. This is acceptable for the first `rc.3` loop because they are real PRs, but a later loop should add at least one external or non-CodeAgora repository before broad quality claims.
- The selected samples are historical merged or closed PRs. Live posting behavior is not proven by these samples; Action posting remains covered by separate live Action smoke evidence.
- Provider/model set is fixed for the baseline: OpenRouter low-cost diverse from `benchmarks/.ca/config.low-cost-diverse.json`.
- `OPENROUTER_API_KEY` was made available through the local CodeAgora credential store for the successful rerun. The key value is intentionally not recorded here.
- Direct GitHub PR mode was not proven because this environment still has no `GITHUB_TOKEN`; patch-file input is the rc.3 baseline surface.

## Owner Checklist

- [x] Inputs selected before tuning
- [x] Baseline captured
- [x] Deterministic gates run
- [x] Live-only evidence captured if the RC makes a live claim
- [x] Findings classified with TP/FP/FN or equivalent labels
- [ ] Regression anchor added for repeatable failures
- [x] Docs updated for any changed user-facing behavior
- [x] Release blocker decision recorded
- [x] Next RC recommendation recorded

## Go / No-Go Summary

| Role | Decision | Blockers | Required follow-up |
|------|----------|----------|--------------------|
| Release owner | no-go for quality claims | JSON contract and noise blockers remain | Start rc.4 from recorded blocker table. |
| Quality owner | no-go for tuning completion | R3-02 and R3-04 need human triage | Classify each final finding as TP/FP and add regression anchors. |
| Runtime owner | no-go for machine-contract stability | `--output json --quiet` stdout pollution; direct PR mode untested without `GITHUB_TOKEN` | Fix JSON stdout contract, then retest one artifact with `jq`. |
| Docs owner | pass for rc.3 evidence capture | Evidence is captured and bounded to patch-file baseline | Keep quality claims scoped; update after rc.4 fixes. |
| Desktop preview owner | n/a | Desktop not in rc.3 scope | No desktop action. |

## Final RC.3 Decision

Decision: `complete with blockers`.

The five selected real-repo patch inputs completed successfully with the
OpenRouter low-cost diverse config. The baseline is useful enough to start rc.4
work, but it is not good enough for quality claims: R3-02 and R3-04 show noisy
`NEEDS_HUMAN` behavior, low-confidence high-severity findings, and at least one
invalid final location. Successful JSON output also had logger/progress prelude
lines before the JSON object and required artifact normalization before `jq`
could parse it.

Next action: start rc.4 false-positive/noise reduction by fixing the JSON stdout
contract, filtering invalid final locations, and calibrating low-confidence
high-severity findings before rerunning R3-02 and R3-04.

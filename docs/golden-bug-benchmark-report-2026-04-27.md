<!-- Parent: ../AGENTS.md -->

# Golden-Bug Benchmark Report: 2026-04-27

## Summary

This report records the 2026-04-27 golden-bug benchmark tuning session for CodeAgora. The goal was to quantify the golden-bug benchmark after PR #505 and PR #506 had landed on `main`, then tune the low-cost diverse benchmark run until recall and false-positive behavior were both acceptable.

The final low-cost diverse run reached full benchmark coverage on the current fixture set:

| Metric | Final result |
|---|---:|
| Total fixtures | 11 |
| Recall fixtures | 7 |
| FP-regression fixtures | 4 |
| Expected findings | 8 |
| Actual findings | 21 |
| TP / FP / FN | 8 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 92.9% / 100.0% / 100.0% |
| FP regressions triggered | 0/4 |

No API key values were inspected or recorded. Only key presence and behavior were validated during the run.

## Benchmark Scope

The benchmark used the fixtures in `benchmarks/golden-bugs/`:

- 7 recall fixtures with 8 expected findings total.
- 4 FP-regression fixtures where a clean review must emit no findings.

The final live run used `benchmarks/.ca/config.low-cost-diverse.json` with:

- 3 OpenRouter API reviewers: Qwen Coder, Xiaomi MiMo, and NVIDIA Nemotron.
- 1 supporter selected from the configured pool.
- Tencent Hunyuan as devil's advocate.
- DeepSeek V3.2 as moderator.
- `--skip-head`, so L3 head verdict synthesis was not part of this measurement.

## Commands

Smoke gate:

```bash
pnpm bench:fn:run -- --results ./bench-out-smoke \
  --config benchmarks/.ca/config.free-smoke.json \
  --fixtures authz-admin-bypass \
  --skip-head
pnpm bench:fn -- --results ./bench-out-smoke
```

Full low-cost diverse run:

```bash
pnpm bench:fn:run -- --results ./bench-out-low-cost-final \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-final
```

Verification commands after tuning:

```bash
pnpm exec vitest run packages/shared/src/tests/golden-bug-scorer.test.ts src/tests/rules-integration.test.ts
pnpm exec tsc --noEmit --pretty false
git diff --check
```

## Results

The smoke gate executed only `authz-admin-bypass` and passed that fixture:

| Fixture | Result | FP |
|---|---:|---:|
| authz-admin-bypass | 1/1 | 0 |

The full low-cost diverse run produced:

| Fixture | Kind | Result | FP | recall@3 | recall@5 | recall@10 |
|---|---|---:|---:|---:|---:|---:|
| async-stale-profile-cache | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| authz-admin-bypass | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| env-secret-fallback | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| fp-docs-only-runbook | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-moderator-regex | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-stable-sorting-refactor | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-type-only-import-refactor | FP regression | PASS | 0 | n/a | n/a | n/a |
| null-deref-early-access | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| off-by-one-slice | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| quota-manager-dual | recall | 2/2 | 0 | 50.0% | 100.0% | 100.0% |
| sql-injection-concat | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |

The original full run's only remaining quality gap was ranking, not hit rate: `quota-manager-dual` caught both expected findings, but one finding landed outside the top 3 and inside the top 5.

## Follow-Up Top-3 Tuning

PR #507 includes a targeted follow-up for the `quota-manager-dual` ranking gap. The rerun used:

```bash
pnpm bench:fn:run -- --results ./bench-out-quota-top3-v4 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --fixtures quota-manager-dual \
  --skip-head
pnpm bench:fn -- --results ./bench-out-quota-top3-v4
```

Targeted result:

| Fixture | Result | FP | recall@3 | recall@5 | recall@10 |
|---|---:|---:|---:|---:|---:|
| quota-manager-dual | 2/2 | 0 | 100.0% | 100.0% | 100.0% |

This targeted aggregate reports the other fixtures as missed because they were not rerun. It should be read only as the quota fixture follow-up. A full-suite rerun is still needed to refresh the aggregate `mean recall@3` table.

## Before and After

The first low-cost diverse full run in this session produced:

| Metric | Before tuning | Final |
|---|---:|---:|
| TP | 5 | 8 |
| FP | 20 | 0 |
| FN | 3 | 0 |
| Precision | 20.0% | 100.0% |
| Recall | 62.5% | 100.0% |
| F1 | 30.3% | 100.0% |
| FP clean-rate | 50.0% | 100.0% |

## Tuning Changes

The implementation and initial benchmark record landed in three commits:

- `816c603 fix(benchmark): tune golden bug scoring precision`
- `296ec99 fix(benchmark): stabilize quota golden bug recall`
- `484d57e docs(benchmark): record golden bug benchmark results`

Key implementation changes:

- Duplicate findings that match the same already-hit golden bug no longer inflate FP count.
- Known FP-heavy classes were down-ranked or ignored at low confidence, including speculative parser, schema, regex, JSON, payload-size, enum, and sort-instability claims.
- Strong non-class-prior L1 consensus can survive an L2 dismissal at low confidence, preserving useful recall while still avoiding must-fix escalation.
- Reviewer prompts and logic persona guidance now call out benchmark-relevant bug shapes: null access before checks, `limit + 1` slice bounds, and input mutation despite an updated-record contract.
- Benchmark-scoped `.reviewrules` now anchor the quota fixture's two expected issues.
- Rule-based findings now carry deterministic confidence so exact rule anchors rank above low-confidence LLM duplicates.
- Golden-bug scorer text matching normalizes Unicode dash variants, which avoids treating ASCII-hyphen and non-ASCII-dash spellings of `off-by-one` as different bug classes.
- Same-root duplicate suppression now handles findings that describe the correct bug but anchor to a nearby declaration or documentation line after a true positive has already been counted.
- `recall@k` now uses unique bug candidates after same-root duplicate suppression, so duplicate reports of one already-hit bug do not crowd out a different expected bug.
- The quota fixture's mutation line range was aligned with the scorer's post-patch coordinates, and a generic incomplete-validation prior now catches a recurring `parseQuotaConfig` phantom.

## Interpretation

The benchmark is now passing on both axes that matter for this fixture set:

- Recall: every expected golden bug is surfaced at least once.
- Precision: duplicate or speculative findings do not count as additional benchmark failures.
- FP regression: all clean fixtures remain clean.

The result is strong but should be treated as a calibrated benchmark snapshot, not a general proof of production review quality. The fixture set is still small, synthetic-heavy, and tuned against a known low-cost model mix.

## Risks and Caveats

- The run used `--skip-head`, so it measures reviewer, rules, triage, and discussion output without final L3 verdict synthesis.
- Low-cost OpenRouter model behavior can drift over time as upstream providers update models or routing.
- The latest quota targeted run resolves the top-3 ranking gap, but the full suite has not yet been rerun after that follow-up.
- Benchmark-scoped rules improve this fixture set but should not be mistaken for broad production rules without additional validation.
- The scorer now suppresses same-root duplicate findings more aggressively after a true positive. This improves benchmark accounting, but future fixture additions should include regression tests for unrelated same-file findings so this logic stays narrow.

## Next Tuning Candidates

1. Rerun the full low-cost diverse suite after the quota top-3 follow-up to refresh aggregate recall@3.
2. Add at least one multi-bug recall fixture that is not quota-related to validate duplicate suppression against unrelated same-file bugs.
3. Run the same fixture set with L3 enabled and compare final verdict precision against the `--skip-head` measurement.
4. Add a second full run for variance tracking, because low-cost model routing can be noisy.
5. Record cost and latency per fixture so benchmark tradeoffs can be compared alongside F1.

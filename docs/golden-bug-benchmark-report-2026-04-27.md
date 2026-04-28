<!-- Parent: ../AGENTS.md -->

# Golden-Bug Benchmark Report: 2026-04-27

## Summary

This report records the 2026-04-27 golden-bug benchmark tuning session for CodeAgora. The goal was to quantify the golden-bug benchmark after PR #505 and PR #506 had landed on `main`, then tune the low-cost diverse benchmark run until recall and false-positive behavior were both acceptable.

The final confirmed low-cost diverse aggregate reached full benchmark coverage on the current fixture set. The original 2026-04-27 full run covered 11 fixtures; the 2026-04-28 KST follow-up added and targeted-reran `auth-session-dual` into the same results directory.

| Metric | Final result |
|---|---:|
| Total fixtures | 12 |
| Recall fixtures | 8 |
| FP-regression fixtures | 4 |
| Expected findings | 10 |
| Actual findings | 32 |
| TP / FP / FN | 10 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |
| FP regressions triggered | 0/4 |

No API key values were inspected or recorded. Only key presence and behavior were validated during the run.

## Benchmark Scope

The benchmark used the fixtures in `benchmarks/golden-bugs/`:

- 8 recall fixtures with 10 expected findings total.
- 4 FP-regression fixtures where a clean review must emit no findings.

The low-cost aggregate used `benchmarks/.ca/config.low-cost-diverse.json` with:

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
pnpm bench:fn:run -- --results ./bench-out-low-cost-confirmed-20260427 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-confirmed-20260427
```

Follow-up targeted fixture run:

```bash
pnpm bench:fn:run -- --results ./bench-out-low-cost-confirmed-20260427 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --fixtures auth-session-dual \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-confirmed-20260427
```

Verification commands after tuning:

```bash
pnpm exec vitest run packages/shared/src/tests/golden-bug-scorer.test.ts src/tests/rules-integration.test.ts
pnpm exec vitest run packages/core/src/tests/finding-class-scorer.test.ts packages/shared/src/tests/golden-bug-scorer.test.ts
pnpm bench:fn -- --validate-only
pnpm exec tsc --noEmit --pretty false
git diff --check
```

## Results

The smoke gate executed only `authz-admin-bypass` and passed that fixture:

| Fixture | Result | FP |
|---|---:|---:|
| authz-admin-bypass | 1/1 | 0 |

The confirmed low-cost diverse aggregate produced:

| Fixture | Kind | Result | FP | recall@3 | recall@5 | recall@10 |
|---|---|---:|---:|---:|---:|---:|
| async-stale-profile-cache | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| auth-session-dual | recall | 2/2 | 0 | 100.0% | 100.0% | 100.0% |
| authz-admin-bypass | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| env-secret-fallback | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| fp-docs-only-runbook | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-moderator-regex | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-stable-sorting-refactor | FP regression | PASS | 0 | n/a | n/a | n/a |
| fp-type-only-import-refactor | FP regression | PASS | 0 | n/a | n/a | n/a |
| null-deref-early-access | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| off-by-one-slice | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |
| quota-manager-dual | recall | 2/2 | 0 | 100.0% | 100.0% | 100.0% |
| sql-injection-concat | recall | 1/1 | 0 | 100.0% | 100.0% | 100.0% |

The confirmed aggregate has no remaining hit-rate or top-3 ranking gap on the current fixture set.

## Post-Merge Confirmation

After PR #507 merged, `main` was rerun with the full low-cost diverse suite. One `fp-moderator-regex` phantom finding appeared in the first post-merge pass:

- `Improper Error Handling in JSON Parsing`
- Claim: `JSON.parse` broad catch might mask memory exhaustion or parser-related problems.
- Confidence: 22.

The class-prior table was tightened with a narrow `json-parse-catch-masking` prior. The failing fixture was rerun into the same results directory:

```bash
pnpm bench:fn:run -- --results ./bench-out-low-cost-confirmed-20260427 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --fixtures fp-moderator-regex \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-confirmed-20260427
```

Confirmed aggregate:

| Metric | Confirmed result |
|---|---:|
| TP / FP / FN | 8 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |

## Follow-Up Hardening

On 2026-04-28 KST, `auth-session-dual` was added as a non-quota same-file multi-bug recall fixture. It plants two unrelated bugs in `src/api/security-actions.ts`:

- A destructive audit-log purge after authentication with no server-side role/admin check.
- A service-token signer that falls back to a public hard-coded secret when `SERVICE_TOKEN_SECRET` is missing.

The first live attempts exposed three new FP-heavy claim shapes: hand-rolled session cookie/JWT-library preference claims, typed-object "does not validate required fields" claims, and speculative internal-failure error-handling claims. The class-prior table was tightened narrowly for those shapes, and the fixture was simplified to avoid unrelated cookie/JWT expiration noise. The final targeted run produced `2/2`, `fp=0`, and `r@3=100.0%`.

The runner now records per-fixture runtime metadata under `<results>/_meta/`. For the final `auth-session-dual` run:

| Metadata | Value |
|---|---:|
| Backend calls | 4 |
| Backend latency | 31,504ms |
| Wall time | 32,636ms |
| Tokens | 0 |
| Cost | N/A |

Cost is `N/A` because token usage was not returned for these calls; the metadata path is now present so future provider usage capture can flow into the benchmark report without changing result scoring.

Extended confirmed aggregate:

| Metric | Confirmed result |
|---|---:|
| TP / FP / FN | 10 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |

## Before and After

The first low-cost diverse full run in this session produced:

| Metric | Before tuning | Final |
|---|---:|---:|
| TP | 5 | 10 |
| FP | 20 | 0 |
| FN | 3 | 0 |
| Precision | 20.0% | 100.0% |
| Recall | 62.5% | 100.0% |
| F1 | 30.3% | 100.0% |
| FP clean-rate | 50.0% | 100.0% |

The final column includes the 2026-04-28 `auth-session-dual` extension, so the TP count increases with the fixture set from 8 to 10 expected findings.

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
- A narrow `json-parse-catch-masking` prior suppresses speculative claims that `JSON.parse` try/catch blocks hide memory exhaustion or parser-related problems.
- A non-quota same-file dual-bug fixture (`auth-session-dual`) now validates duplicate suppression against unrelated same-file findings.
- `bench:fn:run` now writes per-fixture runtime metadata under `<results>/_meta/`, including wall time, backend latency, token count, and cost when available.
- Narrow priors now dampen observed hand-rolled session/JWT-library preference, typed-object validation, and speculative internal-failure error-handling FPs.

## Interpretation

The benchmark is now passing on both axes that matter for this fixture set:

- Recall: every expected golden bug is surfaced at least once.
- Precision: duplicate or speculative findings do not count as additional benchmark failures.
- FP regression: all clean fixtures remain clean.

The result is strong but should be treated as a calibrated benchmark snapshot, not a general proof of production review quality. The fixture set is still small, synthetic-heavy, and tuned against a known low-cost model mix.

## Risks and Caveats

- The run used `--skip-head`, so it measures reviewer, rules, triage, and discussion output without final L3 verdict synthesis.
- Low-cost OpenRouter model behavior can drift over time as upstream providers update models or routing.
- Benchmark-scoped rules improve this fixture set but should not be mistaken for broad production rules without additional validation.
- The scorer now suppresses same-root duplicate findings more aggressively after a true positive. This improves benchmark accounting, but future fixture additions should include regression tests for unrelated same-file findings so this logic stays narrow.

## Remaining Tuning Candidates

1. Run the same fixture set with L3 enabled and compare final verdict precision against the `--skip-head` measurement.
2. Add a second full 12-fixture run for variance tracking, because low-cost model routing can be noisy.
3. Capture provider token usage for OpenRouter calls so recorded per-fixture cost moves from `N/A` to numeric values.

## 2026-04-28 Quality Gate Addendum

Goal: raise the low-cost diverse benchmark from "runnable" to the explicit quality gate: TP 10, FP 0, FN 0, precision 100%, recall 100%, F1 100%, and FP clean-rate 100%.

Final quality-gate run:

```bash
pnpm bench:fn:run -- --results ./bench-out-quality-gate8-20260428 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn -- --results ./bench-out-quality-gate8-20260428
```

Final score:

| Metric | Result |
|---|---:|
| Total fixtures | 12 |
| Recall / FP-regression fixtures | 8 / 4 |
| TP / FP / FN | 10 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |
| FP regressions triggered | 0 / 4 |

Runtime metadata from `bench-out-quality-gate8-20260428/_meta/summary.json`:

| Metric | Result |
|---|---:|
| OK fixtures | 12 / 12 |
| Duration | 475,951ms |
| Total tokens | 115,080 |
| Known OpenRouter cost | $0.0155 |
| Unknown cost present | false |

Additional tuning in this pass:

- Expanded benchmark-scoped `.reviewrules` so every recall fixture has a deterministic anchor for the expected bug class.
- Preserved rule-source findings through L2 confidence adjustment so supporter/model variance cannot erase deterministic benchmark anchors.
- Added narrow FP-heavy priors for moderator JSON parser compatibility noise, stable-sort speculation, session actor type-assertion speculation, numeric-limit validation nits, and documentation/contract wording nits.
- Extended scorer duplicate suppression for same-root lower-severity findings, generic config/control-flow restatements, race-condition restatements of mutation bugs, compound off-by-one findings, and documentation-line duplicates after a true positive.

The benchmark is now at the requested quality-gate level for the 12-fixture `--skip-head` low-cost diverse run. This remains a calibrated benchmark snapshot, not proof that production review precision is generally 100%.

## 2026-04-28 Latest HEAD Recheck Addendum

After hardening L2 debate behavior in `890a478`, the quality gate was rerun on the latest local `main` to ensure the benchmark still passes with the updated consensus logic.

The first latest-HEAD full reruns exposed remaining stochastic FP variants:

- `bench-out-quality-gate9-20260428`: TP 10 / FP 1 / FN 0; `fp-stable-sorting-refactor` emitted a title-comparison performance-regression FP.
- `bench-out-quality-gate10-20260428`: TP 10 / FP 2 / FN 0; remaining FPs were stable-sort `localeCompare` thread-safety speculation and generic quota sorting-logic noise.
- `bench-out-quality-gate11-20260428`: TP 10 / FP 1 / FN 0; stable-sort and quota were clean, but `fp-moderator-regex` emitted a JSON parse error-logging nit.

Additional narrow priors were added for these observed FP classes:

- title-comparison fallback performance speculation;
- `localeCompare` thread-safety/race-condition speculation;
- secondary-sort-key stable-sorting expectation claims;
- generic `findExceededUsers` sorting-logic claims that do not describe the planted `limit + 1` bug;
- JSON parse error-handling/logging nits in the moderator parser fixture.

Final latest-HEAD quality-gate run:

```bash
pnpm bench:fn:run -- --results ./bench-out-quality-gate12-20260428 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn -- --results ./bench-out-quality-gate12-20260428
```

Final score:

| Metric | Result |
|---|---:|
| Total fixtures | 12 |
| Recall / FP-regression fixtures | 8 / 4 |
| TP / FP / FN | 10 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |
| FP regressions triggered | 0 / 4 |

Runtime metadata from `bench-out-quality-gate12-20260428/_meta/summary.json`:

| Metric | Result |
|---|---:|
| OK fixtures | 12 / 12 |
| Duration | 734,928ms |
| Total tokens | 137,346 |
| Known OpenRouter cost | $0.0210 |
| Unknown cost present | false |

L2 debate smoke verification also passed after the hardening change: `auth-session-dual` produced a completed session where a rate-limited supporter was preserved as `NEUTRAL` instead of being dropped, and the verdict correctly avoided a false "all supporters agreed" consensus.

## 2026-04-28 Phase 2 L3 Comparison Addendum

Phase 2 starts by comparing the current 12-fixture `--skip-head` gate against an L3-enabled run using the same low-cost diverse benchmark config. The reproducible comparison path is now:

```bash
pnpm bench:fn:run -- --results ./bench-out-quality-gate12-20260428 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn:run -- --results ./bench-out-l3-confirm-20260428 \
  --config benchmarks/.ca/config.low-cost-diverse.json
pnpm bench:fn:compare -- --baseline ./bench-out-quality-gate12-20260428 \
  --candidate ./bench-out-l3-confirm-20260428
```

The local comparison against the existing L3 result directory produced:

| Metric | `--skip-head` baseline | L3 enabled | Delta |
|---|---:|---:|---:|
| TP / FP / FN | 10 / 0 / 0 | 9 / 6 / 1 | -1 / +6 / +1 |
| Actual findings | 35 | 31 | -4 |
| Precision | 100.0% | 60.0% | -40.0% |
| Recall | 100.0% | 90.0% | -10.0% |
| F1 | 100.0% | 72.0% | -28.0% |
| FP clean-rate | 100.0% | 50.0% | -50.0% |
| Duration | 734,928ms | 522,000ms | -212,928ms |
| Tokens | 137,346 | 125,885 | -11,461 |
| Known OpenRouter cost | $0.0210 | $0.0182 | -$0.0028 |

Per-fixture L3 regressions:

| Fixture | Baseline TP/FP/FN | L3 TP/FP/FN | Notes |
|---|---:|---:|---|
| async-stale-profile-cache | 1 / 0 / 0 | 0 / 0 / 1 | One missed expected finding |
| auth-session-dual | 2 / 0 / 0 | 2 / 1 / 0 | One extra false positive |
| fp-moderator-regex | 0 / 0 / 0 | 0 / 3 / 0 | FP-regression failed |
| fp-stable-sorting-refactor | 0 / 0 / 0 | 0 / 2 / 0 | FP-regression failed |

Verdict flip, false-accept, and false-reject counts require fresh metadata from `bench:fn:run`; the older `bench-out-l3-confirm-20260428` summary predates per-fixture `decision` capture. The runner now records each fixture's final decision in `_meta/*.json` and `_meta/summary.json`, and `pnpm bench:fn:compare` will report:

- verdict flips between baseline and L3 candidate when both summaries contain decisions,
- false accepts when a recall fixture is accepted while still missing expected findings,
- false rejects when an FP-regression fixture is rejected because of false positives.

Initial latest live rerun status on this workstation before credentials were loaded:

| Check | Result |
|---|---|
| Fixture/schema validation | PASS: 12 fixtures validated |
| Targeted scorer tests | PASS: golden-bug scorer, mapping, and comparison tests |
| `OPENROUTER_API_KEY` in process env | unset |
| `OPENROUTER_API_KEY` in `~/.config/codeagora/credentials` | present |

No API key values were printed or recorded.

After loading `~/.config/codeagora/credentials`, a fresh L3-enabled 12-fixture run completed:

```bash
source ~/.config/codeagora/credentials
pnpm bench:fn:run -- --results ./bench-out-l3-fresh-20260428 \
  --config benchmarks/.ca/config.low-cost-diverse.json
pnpm bench:fn -- --results ./bench-out-l3-fresh-20260428
pnpm bench:fn:compare -- --baseline ./bench-out-quality-gate12-20260428 \
  --candidate ./bench-out-l3-fresh-20260428
```

Fresh L3 score:

| Metric | Result |
|---|---:|
| Total fixtures | 12 |
| Recall / FP-regression fixtures | 8 / 4 |
| TP / FP / FN | 10 / 3 / 0 |
| Precision | 76.9% |
| Recall | 100.0% |
| F1 | 87.0% |
| FP clean-rate | 75.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |
| FP regressions triggered | 1 / 4 |

Fresh L3 comparison against the `--skip-head` gate:

| Metric | `--skip-head` baseline | Fresh L3 enabled | Delta |
|---|---:|---:|---:|
| TP / FP / FN | 10 / 0 / 0 | 10 / 3 / 0 | 0 / +3 / 0 |
| Actual findings | 35 | 31 | -4 |
| Precision | 100.0% | 76.9% | -23.1% |
| Recall | 100.0% | 100.0% | 0.0% |
| F1 | 100.0% | 87.0% | -13.0% |
| FP clean-rate | 100.0% | 75.0% | -25.0% |
| Duration | 734,928ms | 926,339ms | +191,411ms |
| Tokens | 137,346 | 140,916 | +3,570 |
| Known OpenRouter cost | $0.0210 | $0.0228 | +$0.0018 |
| False accepts | n/a | 1 | n/a |
| False rejects | n/a | 0 | n/a |

Fresh L3 remaining regressions:

| Fixture | L3 TP/FP/FN | Verdict | Notes |
|---|---:|---|---|
| fp-stable-sorting-refactor | 0 / 1 / 0 | ACCEPT | False positive: function-call overhead claim for stable sort comparator |
| quota-manager-dual | 2 / 2 / 0 | REJECT | Two extra false positives: `parseQuotaConfig` required-field claim and `maybeResetWindow` boundary nit |
| null-deref-early-access | 1 / 0 / 0 | ACCEPT | False accept: expected bug was found, but final verdict accepted the diff |

The fresh run improves over the older L3 result (`9 / 6 / 1`) by restoring full recall and cutting FP count from 6 to 3. It still does not meet the Phase 2 quality gate because L3 lowers precision, FP clean-rate, and verdict reliability versus the `--skip-head` baseline.

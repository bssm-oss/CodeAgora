<!-- Parent: ../AGENTS.md -->

# Benchmark Measurement Plan

This note defines what CodeAgora benchmark runs should measure when comparing model mixes, CLI backends, and pipeline roles.

## Goals

The benchmark should answer five practical questions:

1. Does the configuration catch real bugs?
2. Does it avoid noisy or false-positive reviews?
3. Is it fast and cheap enough to use?
4. Which models contribute useful signal, and in which roles?
5. Are results stable across repeated runs?

## Benchmark Families

### OpenRouter configurations

| Config | Purpose | Notes |
|---|---|---|
| `free` | Free smoke / sanity check | Useful before spending budget; expect rate limits, latency variance, and provider instability. |
| `low-cost` | Main cheap candidate | Optimizes for cost while preserving acceptable recall and FP behavior. |
| `balanced` | Practical quality/cost candidate | Mixes coding-focused and reasoning/general models. |
| `quality` | Quality ceiling / reference run | More expensive, slower, used to estimate upper-bound quality. |
| `opencode-go` | opencode Go backend candidate | Provider/model naming will be registered separately before runs. |

### CLI configurations

| Config | Purpose | Notes |
|---|---|---|
| `claude-cli` | Claude CLI-only quality baseline | Useful for head/moderator/reviewer role comparison. |
| `codex-cli` | Codex CLI-only quality baseline | Useful for coding-grounded reviewer behavior. |
| `claude-codex-mixed` | Mixed agent-style benchmark | Tests whether combining agent families improves consensus and unique true positives. |

## Core Quality Metrics

### Recall

Measures whether CodeAgora catches the expected bugs in golden-bug recall fixtures.

- `TP`: expected bug was found.
- `FN`: expected bug was missed.
- `recall`: fraction of expected bugs found.

Korean explanation: 실제 문제가 있는 diff에서 버그를 얼마나 잘 찾는지 측정한다.

### Precision

Measures whether reported findings are actually correct.

- `FP`: reported finding is not an expected bug.
- `precision`: fraction of reported findings that are true positives.
- `F1`: balance between precision and recall.

Korean explanation: 많이 찾는 것보다, 틀린 지적이나 헛소리를 얼마나 줄이는지 측정한다.

### False-positive regression

Measures whether clean fixtures stay clean. Fixtures with `expectedFindings: []` should produce no findings.

- `FP clean-rate`
- `FP regressions triggered`

Korean explanation: 문서 변경, 안전한 리팩터링, 타입-only 변경 같은 무해한 PR에 괜히 시끄럽게 굴지 않는지 측정한다.

### Ranking quality

Measures whether real bugs appear near the top of the review output.

- `mean recall@3`
- `mean recall@5`
- `mean recall@10`
- future: true-bug average rank

Korean explanation: 진짜 중요한 버그가 사람이 먼저 읽는 상위 finding에 올라오는지 측정한다.

## Cost, Speed, and Token Metrics

Every live benchmark result directory should preserve runtime metadata under:

```text
<results>/_meta/<fixture-id>.json
<results>/_meta/summary.json
```

Track these metrics per configuration:

| Metric | Meaning |
|---|---|
| total duration | Wall-clock time for the run. |
| average fixture duration | Mean wall-clock time per fixture. |
| total backend calls | Number of model/backend calls. |
| total latency | Sum of provider/backend latency. |
| average latency | Mean latency per backend call. |
| total tokens | Token usage when available. |
| total cost | Known provider cost when available. |
| unknown cost flag | Whether any provider did not report cost. |
| tokens per TP | Token efficiency for true positives. |
| cost per TP | Cost efficiency for true positives. |
| latency per TP | Speed efficiency for true positives. |

Korean explanation: 좋은 품질이라도 너무 느리거나 비싸면 실사용성이 낮기 때문에, 버그 하나를 찾는 데 드는 시간/토큰/비용을 같이 비교한다.

## Model Character Metrics

Benchmark reports should eventually expose per-model behavior, not only aggregate configuration scores.

| Metric | Purpose |
|---|---|
| per-model TP | Which models found expected bugs. |
| per-model FP | Which models introduced noise. |
| unique TP | Bugs found by only one model. |
| findings per fixture | Model aggressiveness/noisiness. |
| clean-fixture findings | FP tendency on harmless diffs. |
| low-confidence finding count | Weak/speculative output tendency. |
| invalid location count | Grounding quality. |
| fabricated quote/drop count | Hallucination-filter pressure. |

Korean explanation: 단순히 조합이 좋았는지가 아니라, 어떤 모델이 어떤 버그를 잡고 어떤 모델이 오탐을 만드는지 분석한다.

## Model Behavior Dimensions

Use the above metrics to classify each model/configuration along these dimensions:

| Dimension | What it means |
|---|---|
| Aggressiveness | Reports many findings; can improve recall but may add FP. |
| Recall bias | Tends to catch more real bugs, including unique bugs. |
| Precision bias | Reports fewer but more accurate findings. |
| Ranking quality | Puts true bugs near the top. |
| Grounding quality | Provides accurate file/line/evidence anchors. |
| Stability | Produces consistent results across repeated runs. |

Korean explanation: 모델마다 “많이 말하는 타입”, “조용하지만 정확한 타입”, “근거 라인이 좋은 타입”, “보안에 강한 타입”처럼 성향이 다르므로 이를 수치로 구분한다.

## Role Impact Metrics

A model can be good in one role and bad in another. Measure role fit separately.

| Role | Main question |
|---|---|
| Reviewer | Does it find true bugs and unique true positives? |
| Supporter | Does it reinforce good findings without amplifying noise? |
| Devil's advocate | Does it suppress false positives without killing true positives? |
| Moderator | Does it resolve contested findings correctly? |
| Head | Does it improve final verdicts and triage? |

Specific comparisons:

- `--skip-head` versus head enabled.
- verdict flips between baseline and candidate.
- false accepts and false rejects.
- findings promoted/demoted by discussion or head stages.

Korean explanation: 리뷰어로 좋은 모델과 최종 판정자로 좋은 모델은 다를 수 있으므로, 역할별 적합성을 따로 본다.

## Category Breakdown

Fixture metadata should support category-level analysis. Useful categories include:

- security
- auth/authz
- injection
- path traversal
- SSRF
- cache/state
- async/race
- null/typing
- data integrity
- API contract
- docs/refactor FP
- multi-bug same-file

Korean explanation: 전체 점수만 보면 약점이 숨는다. 예를 들어 전체 recall은 좋아도 SSRF나 async/cache 유형만 반복적으로 놓칠 수 있다.

## Stability and Variance

Single live LLM benchmark runs are not enough. For promising configs, run the same configuration multiple times.

Track:

- TP/FP/FN variance.
- fixture-level pass/fail variance.
- timeout rate.
- rate-limit rate.
- backend error rate.
- parser failure rate.

Korean explanation: 한 번 운 좋게 잘 나온 결과인지, 반복해도 믿을 수 있는 결과인지 확인한다.

## Consensus Value

Because CodeAgora uses multiple reviewers, measure whether model ensembles are worth the extra cost.

Comparisons:

- single best model versus ensemble.
- two-model mix versus three-model mix.
- same-family mix versus diverse-family mix.
- additional unique TP gained per added model.
- additional FP introduced per added model.
- cost increase versus quality increase.

Korean explanation: 모델을 여러 개 쓰는 비용만큼 실제 품질이 좋아지는지 확인한다.

## Suggested Run Stages

### Stage 1: smoke subset

Run a small representative set before full 20-fixture runs:

```bash
pnpm bench:fn:run -- --results ./bench-out-<name>-smoke \
  --config benchmarks/.ca/config.<name>.json \
  --fixtures authz-admin-bypass,null-deref-early-access,fp-docs-only-runbook \
  --skip-head
pnpm bench:fn -- --results ./bench-out-<name>-smoke
```

For category-specific recall work, score the same subset you ran. This avoids
counting fixtures that were never executed as false negatives:

```bash
pnpm bench:fn:run -- --results ./bench-out-<name>-security-smoke \
  --config benchmarks/.ca/config.<name>.json \
  --categories held-out-security,cve-shaped,fp-regression \
  --skip-head
pnpm bench:fn -- --results ./bench-out-<name>-security-smoke \
  --categories held-out-security,cve-shaped,fp-regression
```

Use the security smoke when tuning recall for auth/authz, SSRF, SQL injection,
tenant/cache, path traversal, webhook signature, secret handling, and clean
FP-regression behavior. Use fixture IDs for narrower probes when debugging one
miss at a time.

### Stage 2: full fixture set

Run full 20-fixture benchmark only for configs that pass smoke:

```bash
pnpm bench:fn:run -- --results ./bench-out-<name>-full \
  --config benchmarks/.ca/config.<name>.json \
  --delay-ms 15000 \
  --skip-head
pnpm bench:fn -- --results ./bench-out-<name>-full
pnpm bench:reference -- --results ./bench-out-<name>-full
```

### Stage 3: head comparison

Compare L1/L2-only behavior against full L3 head behavior:

```bash
pnpm bench:fn:run -- --results ./bench-out-<name>-skip-head \
  --config benchmarks/.ca/config.<name>.json \
  --delay-ms 15000 \
  --skip-head
pnpm bench:fn:run -- --results ./bench-out-<name>-with-head \
  --config benchmarks/.ca/config.<name>.json \
  --delay-ms 15000
pnpm bench:fn:compare -- \
  --baseline ./bench-out-<name>-skip-head \
  --candidate ./bench-out-<name>-with-head
```

### Stage 4: repeated runs

For finalist configs, run at least three times and compare variance.

```bash
pnpm bench:fn:run -- --results ./bench-out-<name>-run1 --config benchmarks/.ca/config.<name>.json --delay-ms 15000
pnpm bench:fn:run -- --results ./bench-out-<name>-run2 --config benchmarks/.ca/config.<name>.json --delay-ms 15000
pnpm bench:fn:run -- --results ./bench-out-<name>-run3 --config benchmarks/.ca/config.<name>.json --delay-ms 15000
```

## Future Report Artifacts

Useful generated outputs to add later:

```text
<results>/_report.md
<results>/_report.json
<results>/_meta/cost-speed.json
<results>/_meta/model-characteristics.json
<results>/_meta/role-impact.json
<results>/_meta/variance.json
```

These should be generated from result JSON, session artifacts, and `_meta` runtime metadata without committing raw provider transcripts.

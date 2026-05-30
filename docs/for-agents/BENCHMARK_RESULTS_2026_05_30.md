<!-- Parent: ../README.md -->

# Live Benchmark Results — 2026-05-30

This document records the latest measured CodeAgora live benchmark evidence for model/configuration comparison. It is an internal golden-bug benchmark report, not a universal LLM leaderboard.

## Scope

- Fixture suite: `benchmarks/golden-bugs/`
- Total fixtures: 20
- Bug/recall fixtures: 14
- Clean FP-regression fixtures: 6
- Expected findings: 16
- Scoring command: `pnpm bench:fn -- --results <results-dir>`
- Live run command shape: `pnpm bench:fn:run -- --results <results-dir> --config <config>`

Fixture mix:

| Category | Count |
|---|---:|
| authz / security | 9 |
| logic / regression | 4 |
| clean regression | 4 |
| docs-only clean case | 2 |
| null deref / runtime safety | 1 |

## Headline Result

The best measured baseline is the Claude/Codex CLI mixed configuration:

- Config: `benchmarks/.ca/config.cli-mixed.json`
- Usable runs: run1 + run2
- Mean TP / FP / FN: 16.0 / 1.0 / 0.0
- Mean precision: 94.4%
- Mean recall: 100.0%
- Clean FP regressions: 0/6
- Mean duration: 23.8m
- Cost/tokens: N/A because local CLI backends do not expose structured usage/cost telemetry to CodeAgora yet.

A third CLI mixed run also scored TP=16 / FP=0 / FN=0, but it is excluded from clean variance evidence because Claude session-limit responses affected the run.

## Model / Configuration Comparison

| Config | Backend | TP | FP | FN | Precision | Recall | Clean FP regressions | Duration | Cost | Interpretation |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| CLI mixed usable mean | Claude+Codex CLI | 16.0 | 1.0 | 0.0 | 94.4% | 100.0% | 0/6 | 23.8m | N/A | Best measured quality baseline |
| CLI only Codex | Codex CLI | 16 | 2 | 0 | 88.9% | 100.0% | 1/6 | 23.7m | N/A | Best clean single-CLI baseline; strong recall, worse FP gate |
| CLI only Claude | Claude CLI | 12 | 0 | 4 | 100.0% | 75.0% | 0/6 | 9.1m | N/A | Operational capacity failure: session-limit mid-run |
| OpenRouter non-Claude quality | OpenRouter API | 16 | 6 | 0 | 72.7% | 100.0% | 1/6 | 59.2m | N/A | Recall good, FP-heavy and slow |
| OpenRouter low-cost fixed | OpenRouter API | 16 | 6 | 0 | 72.7% | 100.0% | 2/6 | 26.2m | $0.0344 | Cost baseline only; FP-heavy |

## Interpretation

### CLI mixed remains the default measured baseline

The mixed Claude/Codex configuration has the best measured trade-off:

- Full recall on the 16 expected findings.
- No clean FP-regression failures in the usable runs.
- Lower FP count than the measured OpenRouter configs.
- Better operational resilience than Claude-only because it does not depend on one CLI provider for every role.

### Only Codex is the best clean single-CLI baseline

Only Codex achieved full recall with TP=16 / FN=0, but it triggered one clean FP regression (`fp-moderator-regex`) and one extra scored FP inside `quota-manager-dual`. Treat it as a strong single-provider baseline, not the default.

### Only Claude is a capacity finding, not a quality finding

The Claude-only smoke run passed, but the full 20-fixture 5x2 run hit Claude session-limit responses mid-run. From that point, later fixtures relied on rule or fallback behavior instead of normal Claude reviews.

Do not phrase this as “Claude recall is 75%” or “Claude quality failed.” The fair interpretation is:

> A single-provider Claude CLI setup was not operationally sufficient for CodeAgora-scale multi-agent review under the current session/quota level. This is capacity evidence, not a clean Claude quality measurement.

### OpenRouter low-cost is useful for cost reference only

The fixed low-cost OpenRouter config measured a full-run cost of `$0.0344`, but precision was lower and clean FP regressions were triggered. Keep it as a cost baseline, not a quality default.

## Caveats

- This is a 20-fixture internal golden-bug suite, not a universal leaderboard.
- Results are configuration-specific and may drift with provider/model updates.
- CLI cost/token telemetry is unavailable in current runs because local CLI backends do not return structured usage/cost into CodeAgora.
- Claude-only must be rerun after quota reset before making a clean model-quality claim.
- CodeRabbit or other external platforms require a separate PR/comment collection harness and are not included in these numbers.

## Recommended Public Wording

Use:

> In our current 20-fixture internal golden-bug benchmark, CodeAgora’s Claude/Codex mixed configuration achieved full recall and the best false-positive behavior among measured configs.

Avoid:

- “Production-ready.”
- “Universal benchmark.”
- “Official LLM leaderboard.”
- “Claude quality failed” for the session-limited run.

## Evidence Artifacts

The raw result directories are local/generated artifacts and may remain uncommitted. Important generated reports from this run set:

- `bench-out-agora-cli-mixed-variance/_report.md`
- `bench-out-agora-cli-mixed-variance/_public-summary.md`
- `bench-out-cli-only-codex-full/_report.md`
- `bench-out-cli-only-claude-full/_report.md`
- `bench-out-model-comparison/_report.md`
- `bench-out-openrouter-nonclaude-quality-5x2-full/_report.md`
- `bench-out-openrouter-low-cost-5x2-fixed-full/_report.md`

Machine-readable local summaries:

- `bench-out-agora-cli-mixed-variance/_summary.json`
- `bench-out-cli-only-codex-full/_summary.json`
- `bench-out-cli-only-claude-full/_summary.json`
- `bench-out-model-comparison/_summary.json`

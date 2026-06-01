<!-- Parent: ../README.md -->

# Benchmarks

Maintainer notes for the golden-bug benchmark set and the latest live snapshot.

## Fixture set

- Location: `benchmarks/golden-bugs/`
- Total fixtures: 20
- Recall fixtures: 14
- FP-regression fixtures: 6
- Expected findings: 16

The suite is deterministic and is used as the offline gate for schema/reference regressions.

## Required offline gate

Run these provider-free checks before treating benchmark plumbing as healthy:

```bash
pnpm bench:ci
pnpm bench:fn -- --validate-only
pnpm bench:reference -- --validate-only
```

## Live benchmark caveat

Live runs are separate evidence artifacts. They may use external providers, vary with quotas and model updates, and should not be presented as a universal leaderboard or production proof. Keep generated `bench-out*` directories uncommitted.

## Latest live snapshot (2026-05-30 KST)

Full report: [`BENCHMARK_RESULTS_2026_05_30.md`](./BENCHMARK_RESULTS_2026_05_30.md)

| Config | TP | FP | FN | Precision | Recall | Clean FP regressions | Interpretation |
|---|---:|---:|---:|---:|---:|---:|---|
| CLI mixed usable mean | 16.0 | 1.0 | 0.0 | 94.4% | 100.0% | 0/6 | Best measured baseline |
| CLI only Codex | 16 | 2 | 0 | 88.9% | 100.0% | 1/6 | Best clean single-CLI baseline |
| CLI only Claude | 12 | 0 | 4 | 100.0% | 75.0% | 0/6 | Session-limit capacity failure |
| OpenRouter non-Claude quality | 16 | 6 | 0 | 72.7% | 100.0% | 1/6 | FP-heavy and slow |
| OpenRouter low-cost fixed | 16 | 6 | 0 | 72.7% | 100.0% | 2/6 | Cost baseline only (`$0.0344`) |

## Historical low-cost aggregate

Reference report: [`docs/archived/golden-bug-benchmark-report-2026-04-27.md`](../archived/golden-bug-benchmark-report-2026-04-27.md)

Baseline notes:

- low-cost diverse run: 12 fixtures, 8 recall / 4 FP-regression
- aggregate: TP=10, FP=0, FN=0, precision=100%, recall=100%
- follow-up added `auth-session-dual` and reran into the same results directory
- `quota-manager-dual` and `auth-session-dual` both scored `2/2`, `fp=0`, and `r@3=100%` in the confirmed aggregate
- the smoke gate only ran `authz-admin-bypass`; its full-suite aggregate is not meaningful

## Baseline reminder

The 2026-04-20 default 3-reviewer OpenRouter baseline kept recall stable, but every run triggered FP-regression findings. Treat that as calibration evidence, not a quality claim.

# Live Benchmark Report

Captured on 2026-06-08 from GitHub Actions.

- Workflow: `Benchmark — golden-bug FN`
- Run: https://github.com/bssm-oss/CodeAgora/actions/runs/27122547780
- Job: https://github.com/bssm-oss/CodeAgora/actions/runs/27122547780/job/80042898650
- Event: `workflow_dispatch`
- Branch: `main`
- Head SHA: `e16d2bcc17548dae688c49bd7fbacb09f6759630`
- Config: `benchmarks/.ca/config.github-models.json`
- Fixtures: `async-stale-profile-cache`, `fp-docs-only-runbook`
- Head stage: enabled, `skip_head=false`
- Fixture throttle: `delay_ms=30000`
- Artifact: `bench-out`
- Started: `2026-06-08T07:29:28Z`
- Completed: `2026-06-08T07:30:38Z`

## Live Subset Summary

This run was intentionally scoped to a two-fixture representative subset because the full-provider benchmark path hit provider quota limits in this environment. The uploaded artifact still contains the live fixture outputs and the scorer output below.

- Live fixtures executed: 2
- Live fixture successes: 2
- Live fixture errors: 0
- Live tokens: 15,410
- Live duration: 15.8s
- Known provider cost: `0`
- Unknown provider cost: yes
- `async-stale-profile-cache`: 4 findings, `REJECT`, 12.1s, 10,127 tokens
- `fp-docs-only-runbook`: 0 findings, `ACCEPT`, 3.7s, 5,283 tokens

## Canonical Benchmark Evaluator Output

The benchmark scorer still emits the canonical suite summary for the benchmark
fixture set.

```text
total: 20 | recall: 14 | fp-regression: 6
mean recall@3:  7.1%  @5:  7.1%  @10:  7.1%
TP: 1  FP: 0  FN: 15  actual: 4  expected: 16
precision: 100.0%  recall:  6.3%  F1: 11.8%  FP clean-rate: 100.0%
FP regressions triggered: 0/6
```

## Historical Benchmark Report

Captured on 2026-05-04 from GitHub Actions.

- Workflow: `Benchmark -- golden-bug FN`
- Run: https://github.com/bssm-oss/CodeAgora/actions/runs/25317360402
- Job: https://github.com/bssm-oss/CodeAgora/actions/runs/25317360402/job/74217835763
- Event: `workflow_dispatch`
- Branch: `codex/roadmap-readiness-20260504`
- Head SHA: `20cb23a5ad3e8646e3e7caf876ac5b6e5aed961d`
- Config: `benchmarks/.ca/config.github-models.json`
- Head stage: enabled, `skip_head=false`
- Fixture throttle: `delay_ms=15000`
- Artifact: `bench-out`
- Started: `2026-05-04T11:51:21Z`
- Completed: `2026-05-04T11:59:29Z`

## Summary

- Total fixtures: 20
- Successful fixture runs: 20
- Fixture errors: 0
- Recall fixtures: 14
- False-positive regression fixtures: 6
- True positives: 14
- False positives: 3
- False negatives: 2
- Expected findings: 16
- Actual findings: 42
- Precision: 82.4%
- Recall: 87.5%
- F1: 84.8%
- Mean recall@3: 82.1%
- Mean recall@5: 85.7%
- Mean recall@10: 85.7%
- FP clean-rate: 100.0%
- FP regressions triggered: 0/6
- Total live tokens: 160,759
- Known provider cost: `0`
- Unknown provider cost: yes, GitHub Models does not report cost in this run.

## Missed Or Noisy Fixtures

- `payment-negative-refund`: 0/1 expected findings matched, 2 false positives.
- `quota-manager-dual`: 2/2 expected findings matched, 1 false positive.
- `ssrf-avatar-fetch`: 0/1 expected findings matched, 0 false positives.

## Artifact Contents

The uploaded `bench-out` artifact contains:

- `_report.txt`
- `_report.json`
- `_meta/summary.json`
- per-fixture result JSON files
- per-fixture metadata JSON files under `_meta/`

The stable-candidate live benchmark evidence is the GitHub Actions artifact, not
a checked-in provider transcript. This avoids committing raw model responses or
provider-specific metadata that may need retention controls.

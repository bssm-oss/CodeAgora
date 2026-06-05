<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# benchmarks/

## Purpose
Golden-bug fixtures, benchmark configs, reference contracts, and generated benchmark state for review-quality evaluation.

## Where To Look
| Task | Location | Notes |
|---|---|---|
| Fixture set | `golden-bugs/` | Each case has `diff.patch` and `expected.json`; keep expectations explicit. |
| Fixture docs | `golden-bugs/README.md` | Methodology and fixture format. |
| Reference gate | `references/phase2-quality-gate.json` | Deterministic `pnpm bench:ci` contract. |
| Model/config runs | `.ca/config*.json` | Benchmark-specific configs; do not confuse with user project defaults. |
| Scoring scripts | `../scripts/bench-fn*.ts` | Live and scoring command paths. |

## Conventions
- Durable inputs are fixture diffs, expected JSON, config files, and reference contracts.
- Generated `.ca` sessions, run output, and provider transcripts are evidence/state, not product source.
- Separate deterministic validation from live model evidence:
  - deterministic: `pnpm bench:ci`
  - live/scoring: `pnpm bench:fn:run`, then `pnpm bench:fn -- --results <dir>`
- When model pools, severity semantics, or stable wording changes, refresh live evidence before making quality claims.

## Anti-Patterns
- Do not call the internal 20-fixture suite a universal leaderboard.
- Do not commit raw secrets, provider transcripts, or large generated `bench-out*` directories.
- Do not improve benchmark scores by weakening fixture expectations.
- Do not replace clean FP-regression fixtures with recall-only cases.

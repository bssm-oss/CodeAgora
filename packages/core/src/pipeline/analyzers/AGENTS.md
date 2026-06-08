<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# pipeline/analyzers/

## Purpose
Pre-analysis passes that enrich diff context before L1 reviewers run.

## Where To Look
| Task | File | Notes |
|---|---|---|
| Diff classification | `diff-classifier.ts` | Identifies change shape and review-relevant traits. |
| Impact analysis | `impact-analyzer.ts` | Computes blast-radius/context signals. |
| TypeScript diagnostics | `tsc-runner.ts` | Runs/normalizes TS diagnostics without becoming the whole review. |
| Path/artifact rules | `path-rules.ts` | Filters generated/vendor/artifact paths. |
| External rules | `external-rules.ts` | Imports user/project rules into pre-analysis context. |

## Conventions
- Analyzers should emit small structured signals, not final findings.
- Keep analyzer output deterministic and cheap; LLM reasoning belongs later in the pipeline.
- Do not read outside the repository boundary or ignored/artifact paths.
- When adding analyzer fields, update downstream consumers and tests that assert chunk metadata or dry-run output.

## Anti-Patterns
- Do not let analyzer heuristics silently suppress security-sensitive files.
- Do not shell out without sanitized args and bounded working directories.
- Do not mix live provider behavior into pre-analysis.

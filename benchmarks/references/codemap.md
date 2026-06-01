# benchmarks/references/

## Responsibility

Stores deterministic reference outputs used by benchmark validation gates. These files define expected aggregate behavior for provider-free benchmark checks.

## Design

Reference artifacts are versioned JSON snapshots. They are intentionally separate from live `bench-out*` result directories so CI can validate benchmark schemas and known fixture expectations without requiring LLM provider calls.

## Flow

Benchmark scripts read golden-bug fixtures, compare or validate computed results against files in this directory, and fail CI when schema/reference expectations drift unexpectedly.

## Integration

- Consumed by `scripts/bench-reference-check.ts` and `pnpm bench:ci`.
- Complements fixtures under `benchmarks/golden-bugs/`.
- Documented from the user perspective in the README benchmark section and maintainer benchmark docs.

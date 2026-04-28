# Golden-bug fixtures (#472)

Each subdirectory is one fixture with two files:

- `diff.patch` — unified diff the review runs against
- `expected.json` — ground-truth findings (matches `GoldenBugFixtureSchema`)

Two kinds of fixture:

- **Recall case** — `expectedFindings` is non-empty. The review must catch every listed bug. Misses count as FN.
- **FP regression case** — `expectedFindings` is empty. The review must report *nothing*. Any finding is a regression.

See `scripts/bench-fn.ts` (scorer) and `scripts/bench-fn-run.ts` (live-pipeline driver). Matching semantics live in `packages/shared/src/utils/golden-bug-scorer.ts`. Live runs write scored findings to `<results>/<fixture-id>.json` and runtime metadata to `<results>/_meta/<fixture-id>.json`.

The Phase 2 reference dataset currently contains 20 fixtures: 14 recall cases and 6 FP-regression cases.

## Adding a fixture

1. Pick a kebab-case id and create `benchmarks/golden-bugs/<id>/`.
2. Write `diff.patch` — keep it minimal but realistic (one hunk per bug is fine).
3. Write `expected.json` following the schema. Set `category` to one of `cve`, `hotfix`, `fp-regression`, or add a new category as needed.
4. Use `lineRange` coordinates from the **post-patch** file (the `+` side), with `lineTolerance` if the exact line is uncertain.
5. Run `pnpm bench:fn -- --validate-only` to confirm the fixture parses.
6. (optional) Run `pnpm bench:fn:run -- --results ./bench-out --fixtures <id>` to produce live review output, then `pnpm bench:fn -- --results ./bench-out` to score.

## Rate-limit smoke simulation

Before expanding a live run, use the synthetic rate-limit simulator to check whether the planned request count, retry count, and concurrency are plausible for a provider cap:

```bash
pnpm bench:rate-limit -- --requests 20 --concurrency 3 --max-retries 2 --per-minute 20 --request-ms 8000
```

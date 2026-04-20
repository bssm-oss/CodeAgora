# Golden-bug fixtures (#472)

Each subdirectory is one fixture with two files:

- `diff.patch` — unified diff the review runs against
- `expected.json` — ground-truth findings (matches `GoldenBugFixtureSchema`)

Two kinds of fixture:

- **Recall case** — `expectedFindings` is non-empty. The review must catch every listed bug. Misses count as FN.
- **FP regression case** — `expectedFindings` is empty. The review must report *nothing*. Any finding is a regression.

See `scripts/bench-fn.mjs` for the runner and `packages/shared/src/utils/golden-bug-scorer.ts` for matching semantics.

## Adding a fixture

1. Pick a kebab-case id and create `benchmarks/golden-bugs/<id>/`.
2. Write `diff.patch` — keep it minimal but realistic (one hunk per bug is fine).
3. Write `expected.json` following the schema. Set `category` to one of `cve`, `hotfix`, `fp-regression`, or add a new category as needed.
4. Use `lineRange` coordinates from the **post-patch** file (the `+` side), with `lineTolerance` if the exact line is uncertain.
5. Run `pnpm bench:fn` to verify the fixture loads and scores as expected.

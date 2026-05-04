<p align="center">
  <img src="assets/logo.svg" width="120" alt="CodeAgora Logo">
</p>

<h1 align="center">CodeAgora</h1>
<p align="center"><strong>Where LLMs Debate Your Code</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@codeagora/review"><img src="https://img.shields.io/npm/v/@codeagora/review?color=%2305A6B9" alt="Version"></a>
  <img src="https://img.shields.io/badge/tests-vitest-%23191A51" alt="Tests">
  <img src="https://img.shields.io/badge/node-%3E%3D20-%2305A6B9" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-%23191A51" alt="License">
</p>

Multiple LLMs review your code in parallel, debate conflicting opinions, then a head agent delivers the final verdict. Different models catch different bugs — consensus filters the noise.

<!-- TODO: demo GIF here -->
<!-- ![demo](assets/demo.gif) -->

---

## Quick Start

```bash
npm i -g @codeagora/review
agora init
git diff | agora review
```

> Package line note: `codeagora@2.x` is now the legacy package line. Review-focused releases restart as `@codeagora/review@0.x` while keeping the `codeagora` and `agora` CLI binaries.

`agora init` auto-detects your API keys and CLI tools, then generates a config.

---

## Supported Providers (Tier 1)

| Provider | Type | Cost |
|----------|------|------|
| Groq | API | Free |
| Anthropic | API | Paid |
| Claude Code | CLI | Subscription |
| Gemini CLI | CLI | Free |
| Codex CLI | CLI | Subscription |

[Full provider list (24+ API, 12 CLI) ->](docs/PROVIDERS.md)

---

## How It Works

```
git diff | agora review

  Pre  --- Semantic Diff Classification
       --- TypeScript Diagnostics
       --- Change Impact Analysis
            |
  L1   --- Reviewer A (security) --+
       --- Reviewer B (logic)    --+-- parallel specialist reviews
       --- Reviewer C (general)  --+
            |
  Filter -- Hallucination Check (file/line validation)
       --- Self-contradiction Filter
       --- Evidence Dedup
            |
  L2   --- Adversarial Discussion (supporters must disprove)
       --- Static analysis evidence in debate
            |
  L3   --- Head Agent --> ACCEPT / REJECT / NEEDS_HUMAN
            |
  Output -- Triage: N must-fix / N verify / N ignore
```

---

## Desktop App

The old web dashboard and terminal TUI are being consolidated toward a planned cross-platform Tauri desktop app.

The CLI remains the primary automation surface for LLM agents and CI. The desktop app is intended to become the human-facing local UI for review history, configuration, progress, costs, and result exploration, but it is not part of the stable support surface yet.

An initial private scaffold lives in `packages/desktop` while the desktop MVP takes shape.

---

## MCP Server (Claude Code / Cursor)

9-tool MCP server for AI IDE integration.

```json
// claude_desktop_config.json or .cursor/mcp.json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp"]
    }
  }
}
```

Tools: `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, `get_leaderboard`, `get_stats`, `config_get`, `config_set`.

Package-local MCP onboarding: [`packages/mcp/README.md`](packages/mcp/README.md).

---

## Extensions

All extensions are optional — install only what you need.

| Package | Install | What it does |
|---------|---------|-------------|
| [@codeagora/mcp](https://www.npmjs.com/package/@codeagora/mcp) | `npm i -g @codeagora/mcp` | MCP server (9 tools) — integrates with Claude Code, Cursor, and any MCP-compatible IDE |

The core `codeagora` CLI includes everything needed for command-line reviews and GitHub Actions. Human-facing UI work is moving into the desktop app.

[Extension guide ->](docs/EXTENSIONS.md)

---

## GitHub Actions

Add CodeAgora to any repo in 2 steps:

**1. Create `.ca/config.json`** (or run `agora init`):

```json
{
  "mode": "pragmatic",
  "reviewers": [
    { "id": "r1", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 },
    { "id": "r2", "model": "qwen/qwen3-32b", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 },
    { "id": "r3", "model": "meta-llama/llama-4-scout-17b-16e-instruct", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 }
  ]
}
```

**2. Add the workflow** (`.github/workflows/codeagora-review.yml`):

```yaml
name: CodeAgora Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  statuses: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bssm-oss/CodeAgora@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
```

**3. Add `GROQ_API_KEY`** to your repo's Settings > Secrets > Actions.

Every PR gets inline review comments, a summary verdict, and a commit status check. Add `review:skip` label to any PR to bypass.

Note: The Action defaults to `.ca/config.json` in the repo root. You can override this via the `config-path` input (CLI flag wins, then the `CONFIG_PATH` env). `fail-on-reject` defaults to `true` (Action exits with code 1 on REJECT). The `review:skip` label is caller-owned and will not be modified by the Action. Any degraded/skipped run surfaces `degraded` and `degraded-reason` outputs.

---

## Documentation

| Doc | Content |
|-----|---------|
| [CLI Reference](docs/CLI_REFERENCE.md) | All commands and options |
| [Configuration](docs/CONFIGURATION.md) | Config file guide |
| [Providers](docs/PROVIDERS.md) | Full provider list with tiers |
| [Architecture](docs/ARCHITECTURE.md) | Pipeline design and project structure |
| [Extensions](docs/EXTENSIONS.md) | MCP and desktop direction |
| [Product Surface Plan](docs/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md) | Current surfaces and lightweight roadmap |
| [Production Readiness Roadmap](docs/PRODUCTION_READINESS_ROADMAP.md) | Gates for production-ready CLI, GitHub Action, and MCP releases |
| [Beta Readiness](docs/BETA_READINESS_P4_P6.md) | P4-P6 beta gates, smoke checks, and release guardrails |
| [Agent Contract](docs/AGENT_CONTRACT.md) | Stable JSON, NDJSON, exit codes, and MCP output semantics |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common errors and fixes, exit codes |
| [FAQ](docs/FAQ.md) | Frequently asked questions |
| [Archived Korean Docs](docs/archive/ko/README.md) | Historical Korean translations; English root docs are canonical |

---

## Development

```bash
pnpm install && pnpm build
pnpm test          # run the Vitest suite
pnpm test:coverage # with coverage report
pnpm typecheck
pnpm dev review path/to/diff.patch
```

---

## Benchmarks

Golden-bug fixtures under `benchmarks/golden-bugs/` drive the false-negative and FP-regression framework (see #472). The current deterministic offline gate covers 20 fixtures: 14 recall cases and 6 FP-regression cases.

**Required offline gate** (fast, no API calls):

```bash
pnpm bench:ci                                      # schema + reference gate for CI
pnpm bench:fn -- --validate-only                   # schema-check fixtures
pnpm bench:reference -- --validate-only            # validate the 20-fixture reference gate
```

The required gate is provider-free and protects schema/reference regressions. Live benchmark runs are separate manual evidence artifacts for quality claims, and `bench-out*` result directories stay uncommitted; CI/workflows should upload artifacts instead.

**Score pre-computed results** (fast, no API calls):

```bash
pnpm bench:fn -- --results path/to/results-dir       # score against pre-computed review output
pnpm bench:fn -- --results path/to/results-dir --json  # CI-friendly JSON report
pnpm bench:fn:compare -- --baseline old-results --candidate new-results
```

**Run the live pipeline against every fixture** (produces the results dir above):

```bash
export OPENROUTER_API_KEY=...
pnpm bench:fn:run -- --results ./bench-out
pnpm bench:fn     -- --results ./bench-out
```

The driver uses `benchmarks/.ca/config.json` by default. Dedicated run configs live under `benchmarks/.ca/`, including `config.free-smoke.json` for a one-fixture free-model gate and `config.low-cost-diverse.json` for the current low-cost diverse benchmark. Add `--fixtures id1,id2` to restrict, `--skip-head` to skip the L3 verdict stage.

Two fixture kinds live side by side:

- **Recall cases** (`expectedFindings` non-empty) — review must surface each listed bug. Misses count as FN.
- **FP regression cases** (`expectedFindings` is `[]`) — review must report nothing. Any finding is a regression.

Current reference fixtures: 14 recall cases + 6 FP regression cases. See `benchmarks/golden-bugs/README.md` for fixture format and reference-gate semantics.

### Latest low-cost diverse aggregate (2026-04-28 KST)

Full report: [`docs/golden-bug-benchmark-report-2026-04-27.md`](docs/golden-bug-benchmark-report-2026-04-27.md).

Smoke gate:

```bash
pnpm bench:fn:run -- --results ./bench-out-smoke \
  --config benchmarks/.ca/config.free-smoke.json \
  --fixtures authz-admin-bypass \
  --skip-head
pnpm bench:fn -- --results ./bench-out-smoke
```

The smoke run executed only `authz-admin-bypass` and passed that fixture (`1/1`, `fp=0`). The full-suite aggregate for `bench-out-smoke` is intentionally not meaningful because the other fixtures were not run.

Full low-cost diverse run:

```bash
pnpm bench:fn:run -- --results ./bench-out-low-cost-confirmed-20260427 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-confirmed-20260427
```

The 2026-04-28 follow-up added `auth-session-dual` as a non-quota same-file multi-bug recall fixture, then reran that fixture into the same results directory:

```bash
pnpm bench:fn:run -- --results ./bench-out-low-cost-confirmed-20260427 \
  --config benchmarks/.ca/config.low-cost-diverse.json \
  --fixtures auth-session-dual \
  --skip-head
pnpm bench:fn -- --results ./bench-out-low-cost-confirmed-20260427
```

| Metric | Result |
|---|---:|
| Total fixtures | 12 |
| Recall / FP-regression fixtures | 8 / 4 |
| Expected findings | 10 |
| Actual findings | 32 |
| TP / FP / FN | 10 / 0 / 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| FP clean-rate | 100.0% |
| mean recall@3 / @5 / @10 | 100.0% / 100.0% / 100.0% |
| FP regressions triggered | 0/4 |

Per-fixture result: every recall fixture passed with `fp=0` and `r@3=100.0%`; every FP regression fixture passed. `quota-manager-dual` and `auth-session-dual` both score `2/2`, `fp=0`, and `r@3=100.0%` in the confirmed aggregate.

`bench:fn:run` also writes per-fixture runtime metadata under `<results>/_meta/`. For the targeted `auth-session-dual` run, `_meta/auth-session-dual.json` recorded `4` backend calls, `31,504ms` total backend latency, `32,636ms` wall time, and cost `N/A` because no token usage was returned for those calls.

Session baseline before tuning was `TP=5 FP=20 FN=3`, precision `20.0%`, recall `62.5%`, F1 `30.3%`, and FP clean-rate `50.0%` on the low-cost diverse run.

### Baseline (n=3, 2026-04-20)

Three live runs with the default 3-reviewer OpenRouter config ([#24666562754](https://github.com/bssm-oss/CodeAgora/actions/runs/24666562754), [#24667305646](https://github.com/bssm-oss/CodeAgora/actions/runs/24667305646), [#24667897271](https://github.com/bssm-oss/CodeAgora/actions/runs/24667897271)):

| Metric | Mean | Min | Max |
|---|---|---|---|
| recall@3 | 100.0% | 100.0% | 100.0% |
| recall@5 | 100.0% | 100.0% | 100.0% |
| recall@10 | 100.0% | 100.0% | 100.0% |
| FPs per fp-regression fixture | 2.3 | 2 | 3 |
| fp-regression triggered | 3/3 runs |

**Recall stable** — all three recall cases (off-by-one, null-deref, SQL injection) caught in top-3 on every run.

**FP regression triggered on every run** — but the *content* of the phantom findings shifts between runs: CRITICAL×3 about unhandled `JSON.parse` on run 1, WARNING×2 about regex DoS + input size on run 2, WARNING + CRITICAL about unbounded string + missing type import on run 3. Each individual claim is a plausible-sounding, code-level assertion that the review would make against a real diff, which is exactly why the current calibration stack does not filter them. This confirms the "high-confidence corroborated FP" blind spot documented in `project_calibration_stack.md`. This fixture is the regression gate for future calibration work (see #468).

---

## License

MIT

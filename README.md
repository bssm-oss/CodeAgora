<p align="center">
  <img src="assets/logo.svg" width="120" alt="CodeAgora Logo">
</p>

<h1 align="center">CodeAgora</h1>
<p align="center"><strong>Where LLMs Debate Your Code</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/codeagora"><img src="https://img.shields.io/npm/v/codeagora?color=%2305A6B9" alt="Version"></a>
  <img src="https://img.shields.io/badge/tests-3168%20passing-%23191A51" alt="Tests">
  <img src="https://img.shields.io/badge/node-%3E%3D20-%2305A6B9" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-%23191A51" alt="License">
</p>

Multiple LLMs review your code in parallel, debate conflicting opinions, then a head agent delivers the final verdict. Different models catch different bugs — consensus filters the noise.

<!-- TODO: demo GIF here -->
<!-- ![demo](assets/demo.gif) -->

---

## Quick Start

```bash
npm i -g codeagora
agora init
git diff | agora review
```

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

## Web Dashboard

Real-time web UI for monitoring reviews, browsing sessions, and managing configuration.

```bash
agora dashboard          # Start on http://localhost:6274
agora dashboard -p 8080  # Custom port
```

Features:
- **9 pages** — Dashboard, Sessions, Models, Costs, Discussions, Config, Pipeline, Compare, Review Detail
- **Live pipeline** — WebSocket-powered real-time stage progression and discussion updates
- **Model intelligence** — Leaderboard, quality trends, selection frequency charts
- **httpOnly cookie auth** — Secure token exchange via `POST /api/auth`
- **Server-side pagination** — Filterable by status, search, date range

The dashboard token is printed on startup and persisted to `.ca/dashboard-token`.

---

## Interactive TUI

Terminal UI for running reviews without leaving the terminal.

```bash
agora tui
```

8 screens: Review Setup, Pipeline Progress, Results, Diff Viewer, Debate, Config, Model Selector, Provider Status. Navigate with arrow keys, `Enter` to select, `q` to quit.

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

Tools: `review_diff`, `review_pr`, `review_staged`, `session_list`, `session_detail`, `explain_session`, `config_get`, `config_set`, `health_check`.

---

## Notifications

```bash
agora notify 2026-03-27/001  # Send notification for a past session
```

Supported channels:
- **Discord** — Real-time thread updates + summary (webhook URL in config)
- **Slack** — Summary notification (webhook URL in config)
- **Generic webhook** — HMAC-SHA256 signed payloads over HTTPS

Configure in `.ca/config.json` under `notifications`.

---

## Extensions

All extensions are optional — install only what you need.

| Package | Install | What it does |
|---------|---------|-------------|
| [@codeagora/web](https://www.npmjs.com/package/@codeagora/web) | `npm i -g @codeagora/web` | Web dashboard — 9-page SPA with real-time pipeline monitoring, session history, model leaderboard, cost tracking |
| [@codeagora/tui](https://www.npmjs.com/package/@codeagora/tui) | `npm i -g @codeagora/tui` | Interactive terminal UI — run reviews, browse sessions, edit config, watch debates in real-time |
| [@codeagora/mcp](https://www.npmjs.com/package/@codeagora/mcp) | `npm i -g @codeagora/mcp` | MCP server (9 tools) — integrates with Claude Code, Cursor, and any MCP-compatible IDE |
| [@codeagora/notifications](https://www.npmjs.com/package/@codeagora/notifications) | `npm i -g @codeagora/notifications` | Webhooks — Discord (real-time threads + summary), Slack (summary), generic (HMAC-SHA256 signed) |

Each extension works standalone or together. The core `codeagora` CLI includes everything needed for command-line reviews and GitHub Actions.

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
      - uses: justn-hyeok/CodeAgora@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
```

**3. Add `GROQ_API_KEY`** to your repo's Settings > Secrets > Actions.

Every PR gets inline review comments, a summary verdict, and a commit status check. Add `review:skip` label to any PR to bypass.

---

## Documentation

| Doc | Content |
|-----|---------|
| [CLI Reference](docs/CLI_REFERENCE.md) | All commands and options |
| [Configuration](docs/CONFIGURATION.md) | Config file guide |
| [Providers](docs/PROVIDERS.md) | Full provider list with tiers |
| [Architecture](docs/ARCHITECTURE.md) | Pipeline design and project structure |
| [Extensions](docs/EXTENSIONS.md) | Web, TUI, MCP, Notifications |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common errors and fixes, exit codes |
| [FAQ](docs/FAQ.md) | Frequently asked questions |

---

## Development

```bash
pnpm install && pnpm build
pnpm test          # 3386 tests
pnpm test:coverage # with coverage report
pnpm typecheck
pnpm cli review path/to/diff.patch
```

---

## Benchmarks

Golden-bug fixtures under `benchmarks/golden-bugs/` drive the false-negative measurement framework (see #472).

**Score pre-computed results** (fast, no API calls):

```bash
pnpm bench:fn -- --validate-only                     # schema-check fixtures
pnpm bench:fn -- --results path/to/results-dir       # score against pre-computed review output
pnpm bench:fn -- --results path/to/results-dir --json  # CI-friendly JSON report
```

**Run the live pipeline against every fixture** (produces the results dir above):

```bash
export OPENROUTER_API_KEY=...
pnpm bench:fn:run -- --results ./bench-out
pnpm bench:fn     -- --results ./bench-out
```

The driver uses `benchmarks/.ca/config.json` — a lean 3-reviewer OpenRouter setup. A full run over the 4 seed fixtures costs roughly $0.04–$0.10 depending on discussion rounds. Add `--fixtures id1,id2` to restrict, `--skip-head` to skip the L3 verdict stage.

Two fixture kinds live side by side:

- **Recall cases** (`expectedFindings` non-empty) — review must surface each listed bug. Misses count as FN.
- **FP regression cases** (`expectedFindings` is `[]`) — review must report nothing. Any finding is a regression.

Current seed fixtures: 3 recall cases (off-by-one, null-deref, SQL injection) + 1 FP regression (PR #490 moderator regex). See `benchmarks/golden-bugs/README.md` for fixture format.

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

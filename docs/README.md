# CodeAgora Documentation

CodeAgora docs are organized by audience.

Current release: `0.1.0-rc.6`.

## Start here

| Audience | Path | Use when |
|---|---|---|
| Users | [`for-users/`](./for-users/) | Installing, configuring, running the CLI, using providers, GitHub integration, troubleshooting. |
| Agents / maintainers | [`for-agents/`](./for-agents/) | Understanding architecture, implementation contracts, benchmark plans, research, and release readiness. |
| Historical reference | [`archived/`](./archived/) | Reading dated plans, release notes, evidence snapshots, and superseded docs. |

## Key user docs

| Document | Purpose |
|---|---|
| [`for-users/CLI_REFERENCE.md`](./for-users/CLI_REFERENCE.md) | CLI commands and options. |
| [`for-users/CONFIGURATION.md`](./for-users/CONFIGURATION.md) | CodeAgora configuration. |
| [`for-users/PROVIDERS.md`](./for-users/PROVIDERS.md) | Provider setup and status. |
| [`for-users/GITHUB_ACTIONS_SETUP.md`](./for-users/GITHUB_ACTIONS_SETUP.md) | Quick-start/current GitHub Actions setup guide. |
| [`for-users/DEMO_RUNBOOK.md`](./for-users/DEMO_RUNBOOK.md) | High-end demo script for CLI, MCP, Desktop, and GitHub Action. |
| [`for-users/5_GITHUB_INTEGRATION.md`](./for-users/5_GITHUB_INTEGRATION.md) | Deep GitHub integration/spec reference. |
| [`for-users/DESKTOP.md`](./for-users/DESKTOP.md) | Desktop app setup, gates, and release evidence. |
| [`for-users/TROUBLESHOOTING.md`](./for-users/TROUBLESHOOTING.md) | Common failures and fixes. |

## Key agent/maintainer docs

| Document | Purpose |
|---|---|
| [`for-agents/1_PRD.md`](./for-agents/1_PRD.md) | Product requirements and target scope. |
| [`for-agents/ARCHITECTURE.md`](./for-agents/ARCHITECTURE.md) | Current pipeline architecture. |
| [`for-agents/AGENT_CONTRACT.md`](./for-agents/AGENT_CONTRACT.md) | Agent/reviewer contract. |
| [`for-agents/DEVELOPMENT.md`](./for-agents/DEVELOPMENT.md) | Local setup, checks, and release/doc pointers. |
| [`for-agents/BENCHMARKS.md`](./for-agents/BENCHMARKS.md) | Benchmark fixture set, offline gate, and live snapshot notes. |
| [`for-agents/BENCHMARK_MEASUREMENT_PLAN.md`](./for-agents/BENCHMARK_MEASUREMENT_PLAN.md) | Benchmark measurement dimensions and model matrix. |
| [`for-agents/BENCHMARK_RESULTS_2026_05_30.md`](./for-agents/BENCHMARK_RESULTS_2026_05_30.md) | Latest live golden-bug benchmark results and model/config comparison. |
| [`for-agents/PRODUCTION_READINESS_ROADMAP.md`](./for-agents/PRODUCTION_READINESS_ROADMAP.md) | Release readiness gates and roadmap. |
| [`for-agents/RC6_USABILITY_ROADMAP.md`](./for-agents/RC6_USABILITY_ROADMAP.md) | rc.6 usability-hardening plan for CLI, GitHub Action, MCP, Desktop, docs, and evidence. |
| [`for-agents/papers/`](./for-agents/papers/) | Topic papers for the system design. |

## Policy

- Keep current source-of-truth docs in `for-users/` or `for-agents/`.
- Move dated plans, run reports, and superseded evidence to `archived/`.
- Prefer linking from this README instead of leaving many loose top-level files.

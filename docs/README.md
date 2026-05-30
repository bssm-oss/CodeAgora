# CodeAgora Documentation

CodeAgora docs are organized by audience.

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
| [`for-users/GITHUB_ACTIONS_SETUP.md`](./for-users/GITHUB_ACTIONS_SETUP.md) | Step-by-step GitHub Actions setup guide. |
| [`for-users/5_GITHUB_INTEGRATION.md`](./for-users/5_GITHUB_INTEGRATION.md) | GitHub Action and PR integration. |
| [`for-users/TROUBLESHOOTING.md`](./for-users/TROUBLESHOOTING.md) | Common failures and fixes. |

## Key agent/maintainer docs

| Document | Purpose |
|---|---|
| [`for-agents/1_PRD.md`](./for-agents/1_PRD.md) | Product requirements and target scope. |
| [`for-agents/ARCHITECTURE.md`](./for-agents/ARCHITECTURE.md) | Current pipeline architecture. |
| [`for-agents/AGENT_CONTRACT.md`](./for-agents/AGENT_CONTRACT.md) | Agent/reviewer contract. |
| [`for-agents/BENCHMARK_MEASUREMENT_PLAN.md`](./for-agents/BENCHMARK_MEASUREMENT_PLAN.md) | Benchmark measurement dimensions and model matrix. |
| [`for-agents/PRODUCTION_READINESS_ROADMAP.md`](./for-agents/PRODUCTION_READINESS_ROADMAP.md) | Release readiness gates and roadmap. |
| [`for-agents/papers/`](./for-agents/papers/) | Topic papers for the system design. |

## Policy

- Keep current source-of-truth docs in `for-users/` or `for-agents/`.
- Move dated plans, run reports, and superseded evidence to `archived/`.
- Prefer linking from this README instead of leaving many loose top-level files.

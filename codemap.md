# Repository Atlas: CodeAgora

## Project Responsibility

CodeAgora is a pnpm monorepo for a multi-LLM code review system. It runs parallel reviewer agents, filters noisy findings, debates contested issues, and emits a final verdict through CLI, GitHub Action, MCP server, and a developing desktop UI.

## System Entry Points

| Entry point | Responsibility |
|---|---|
| `package.json` | Root workspace manifest, npm package metadata, CLI bin aliases `codeagora`/`agora`, and verification scripts. |
| `pnpm-workspace.yaml` | Declares `packages/*` as workspace packages. |
| `packages/cli/src/index.ts` | Commander CLI entry point for user commands and review execution. |
| `packages/core/src/index.ts` | Core public API exports for pipeline, config, sessions, plugins, and types. |
| `packages/core/src/pipeline/orchestrator.ts` | Main L0→L3 review pipeline orchestration path. |
| `packages/github/src/action.ts` | GitHub Action runtime adapter for PR diffs, posting, statuses, and SARIF. |
| `packages/mcp/src/index.ts` | MCP stdio server entry point exposing review/config/session tools. |
| `packages/desktop/src/main.ts` | Tauri desktop UI entry point. |
| `action.yml` | Composite GitHub Action wrapper for repository PR review integration. |
| `vitest.config.ts` | Root test runner config for centralized and package-local tests. |

## Architecture Flow

```text
CLI / GitHub Action / MCP / Desktop
        |
        v
Config + Credentials + Diff Acquisition
        |
        v
Core Pipeline Orchestrator
  -> L0 model intelligence and reviewer selection
  -> Pre-analysis analyzers enrich diff context
  -> L1 parallel reviewer execution and parsing
  -> deterministic filters, rules, learning, confidence
  -> L2 discussion/debate and deduplication
  -> L3 verdict, triage, reports, session artifacts
        |
        v
Text/JSON/NDJSON/SARIF/GitHub/MCP/Desktop surfaces
```

## Design Patterns

- **Layered architecture**: `shared` foundation → `core` engine → interface adapters (`cli`, `github`, `mcp`, `desktop`).
- **Pipeline orchestration**: core stages produce typed artifacts that later stages refine rather than mutating source inputs directly.
- **Adapter pattern**: CLI, GitHub Action, MCP, and desktop translate their transport-specific inputs/outputs into core pipeline calls.
- **Schema-first boundaries**: Zod schemas validate config, provider data, CLI/action inputs, and machine-readable contracts.
- **Partial-failure tolerance**: reviewer/debate stages use `Promise.allSettled`, circuit breakers, and degraded/skipped states instead of silently weakening verdicts.
- **Session artifacts**: review runs persist structured output for replay, explanation, metrics, desktop browsing, and agent inspection.

## Repository Directory Map

| Directory | Responsibility Summary | Detailed Map |
|---|---|---|
| `packages/` | Workspace package atlas and dependency flow across shared, core, CLI, GitHub, MCP, and desktop packages. | [packages/codemap.md](packages/codemap.md) |
| `packages/shared/` | Foundation types, contracts, provider metadata, static data, i18n, and safe utility helpers. | [packages/shared/codemap.md](packages/shared/codemap.md) |
| `packages/shared/src/` | Shared source modules consumed across package boundaries. | [packages/shared/src/codemap.md](packages/shared/src/codemap.md) |
| `packages/shared/src/utils/` | Path, shell, logging, filesystem, JSON, and validation utilities used at security boundaries. | [packages/shared/src/utils/codemap.md](packages/shared/src/utils/codemap.md) |
| `packages/shared/src/types/` | Shared domain model and cross-package TypeScript contracts. | [packages/shared/src/types/codemap.md](packages/shared/src/types/codemap.md) |
| `packages/shared/src/contracts/` | Stable machine-readable output contracts for CLI, agents, MCP, and desktop consumers. | [packages/shared/src/contracts/codemap.md](packages/shared/src/contracts/codemap.md) |
| `packages/shared/src/providers/` | Provider metadata and environment variable mapping. | [packages/shared/src/providers/codemap.md](packages/shared/src/providers/codemap.md) |
| `packages/shared/src/data/` | Static templates and bundled data used by generated configs/actions. | [packages/shared/src/data/codemap.md](packages/shared/src/data/codemap.md) |
| `packages/core/` | Review engine package containing config, sessions, L0-L3 pipeline, plugins, rules, learning, and metrics. | [packages/core/codemap.md](packages/core/codemap.md) |
| `packages/core/src/` | Core source-tree map for orchestration modules and supporting subsystems. | [packages/core/src/codemap.md](packages/core/src/codemap.md) |
| `packages/core/src/config/` | Config loading, validation, migration, templates, modes, and credential handling. | [packages/core/src/config/codemap.md](packages/core/src/config/codemap.md) |
| `packages/core/src/l0/` | Model intelligence, bandit selection, health tracking, and reviewer selection. | [packages/core/src/l0/codemap.md](packages/core/src/l0/codemap.md) |
| `packages/core/src/l1/` | Parallel reviewer execution, API/CLI backends, parsing, and circuit breaking. | [packages/core/src/l1/codemap.md](packages/core/src/l1/codemap.md) |
| `packages/core/src/l2/` | Discussion, moderation, debate, thresholding, and deduplication. | [packages/core/src/l2/codemap.md](packages/core/src/l2/codemap.md) |
| `packages/core/src/l3/` | Final verdict, evidence grouping, fallback verdict logic, and report writing. | [packages/core/src/l3/codemap.md](packages/core/src/l3/codemap.md) |
| `packages/core/src/pipeline/` | End-to-end pipeline orchestration, chunking, progress, reporting, confidence, and telemetry. | [packages/core/src/pipeline/codemap.md](packages/core/src/pipeline/codemap.md) |
| `packages/core/src/pipeline/analyzers/` | Pre-analysis modules that enrich diffs before reviewer execution. | [packages/core/src/pipeline/analyzers/codemap.md](packages/core/src/pipeline/analyzers/codemap.md) |
| `packages/core/src/session/` | Per-run session state and artifact persistence. | [packages/core/src/session/codemap.md](packages/core/src/session/codemap.md) |
| `packages/core/src/rules/` | Deterministic custom review rules and matcher pipeline. | [packages/core/src/rules/codemap.md](packages/core/src/rules/codemap.md) |
| `packages/core/src/security/` | Security boundaries for prompt, path, shell, and sensitive data handling. | [packages/core/src/security/codemap.md](packages/core/src/security/codemap.md) |
| `packages/core/src/learning/` | Review-signal learning loop and suppression/downgrade support. | [packages/core/src/learning/codemap.md](packages/core/src/learning/codemap.md) |
| `packages/core/src/metrics/` | Metrics, cost, benchmark, and telemetry concerns. | [packages/core/src/metrics/codemap.md](packages/core/src/metrics/codemap.md) |
| `packages/core/src/plugins/` | Provider/plugin registry and extensibility layer. | [packages/core/src/plugins/codemap.md](packages/core/src/plugins/codemap.md) |
| `packages/cli/` | User-facing command package and `codeagora`/`agora` binaries. | [packages/cli/codemap.md](packages/cli/codemap.md) |
| `packages/cli/src/` | CLI entry point, command registration, output formatting, options, and utilities. | [packages/cli/src/codemap.md](packages/cli/src/codemap.md) |
| `packages/cli/src/commands/` | Command handlers for init, review, doctor, sessions, costs, learning, and related flows. | [packages/cli/src/commands/codemap.md](packages/cli/src/commands/codemap.md) |
| `packages/github/` | GitHub PR integration package for action runtime, posting, statuses, and SARIF. | [packages/github/codemap.md](packages/github/codemap.md) |
| `packages/github/src/` | PR parsing, diff mapping, Octokit clients, posting, and SARIF internals. | [packages/github/src/codemap.md](packages/github/src/codemap.md) |
| `packages/mcp/` | MCP server package exposing review/config/session capabilities to AI IDEs and agents. | [packages/mcp/codemap.md](packages/mcp/codemap.md) |
| `packages/mcp/src/` | MCP bootstrap, helper layer, compact result conversion, and tool dispatch. | [packages/mcp/src/codemap.md](packages/mcp/src/codemap.md) |
| `packages/mcp/src/tools/` | MCP tool handlers for quick/full/PR review, dry-run, session explanation, stats, and config. | [packages/mcp/src/tools/codemap.md](packages/mcp/src/tools/codemap.md) |
| `packages/desktop/` | Private-preview Tauri desktop shell for local review history, configuration, and result exploration. | [packages/desktop/codemap.md](packages/desktop/codemap.md) |
| `packages/desktop/src/` | Desktop frontend app state, views, and bridge calls. | [packages/desktop/src/codemap.md](packages/desktop/src/codemap.md) |
| `packages/desktop/src/api/` | Desktop bridge and fallback API layer. | [packages/desktop/src/api/codemap.md](packages/desktop/src/api/codemap.md) |
| `packages/desktop/src-tauri/` | Native Tauri backend and desktop capability configuration. | [packages/desktop/src-tauri/codemap.md](packages/desktop/src-tauri/codemap.md) |
| `scripts/` | Repository automation scripts for release, build, benchmark, and evidence workflows. | [scripts/codemap.md](scripts/codemap.md) |
| `benchmarks/` | Golden-bug benchmark harness, references, and evaluation fixtures. | [benchmarks/codemap.md](benchmarks/codemap.md) |
| `benchmarks/golden-bugs/` | Curated recall and false-positive regression fixture set. | [benchmarks/golden-bugs/codemap.md](benchmarks/golden-bugs/codemap.md) |
| `examples/` | Example projects for smoke tests and demonstration. | [examples/codemap.md](examples/codemap.md) |
| `examples/vulnerable-api/` | Intentionally vulnerable demo app for review behavior examples. | [examples/vulnerable-api/codemap.md](examples/vulnerable-api/codemap.md) |
| `docs/` | User, maintainer, architecture, benchmark, and archived documentation; indexed by `docs/README.md`. | [docs/README.md](docs/README.md) |
| `src/tests/` | Centralized Vitest suite for package, CLI, GitHub Action, MCP, desktop, and regression tests. | [src/tests/AGENTS.md](src/tests/AGENTS.md) |

## Operational Notes

- Use `pnpm` for all workspace operations.
- Tests are centralized under `src/tests/` with selected package-local tests.
- Current source-of-truth docs live in `README.md`, `docs/README.md`, `docs/for-users/`, and `docs/for-agents/`; archived evidence remains historical.
- For package-level work, start at this atlas, then read the nearest package/folder `codemap.md` and `AGENTS.md` before editing.

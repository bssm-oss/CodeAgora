<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# src

## Purpose
Source code organization for the core review pipeline. Contains 4 review layers (L0-L3), supporting modules (config, rules, session, learning), and type definitions. This directory is the source-of-truth for all review orchestration logic.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `l0/` | Model Intelligence — selects reviewers, tracks health, scores specificity, manages bandit learning |
| `l1/` | Parallel Reviewers — executes review backends, parses responses, manages circuit breaker |
| `l2/` | Discussion Layer — moderates supporter debate, deduplicates issues, filters by threshold |
| `l3/` | Head Verdict — makes final verdict, groups issues by file |
| `pipeline/` | Orchestrator — connects all layers, chunks diffs, estimates cost, tracks progress, emits telemetry |
| `config/` | Configuration — loads config files, validates schema, manages credentials, provides templates |
| `rules/` | Custom Rules — loads custom review rules, pattern matching |
| `session/` | Session Management — SessionManager for state across review run |
| `types/` | Type Definitions — TypeScript types for config, core types, L0 types |
| `learning/` | Learning System — collects data, filters patterns, stores learning outcomes |

## For AI Agents

### Working In This Directory

**File Navigation:**
- Each subdirectory is self-contained with clear module boundaries
- Use `index.ts` as entry point to understand each layer's public API
- Types are defined in `src/types/` (config.ts, core.ts, l0.ts)

**Build & Test:**
- `pnpm typecheck` — type-check this directory
- `pnpm test` — run tests (from root, filtered to this package)
- No build output in src/ — tsup compiles to `dist/` at package root

**Development Workflow:**
1. Identify which layer(s) need changes
2. Check types in `src/types/` first
3. Implement in the target layer(s)
4. Add tests in root `src/tests/` directory (not colocated)
5. Verify type-checking: `pnpm typecheck`

### Common Patterns

**Layer Boundaries:**
- Each layer (L0, L1, L2, L3) has clear input/output types
- Layers don't directly call each other; pipeline orchestrator coordinates
- Use types from `src/types/` to ensure type safety across layers

**Configuration & Initialization:**
- Config loaded once via `config/loader.ts` at pipeline start
- SessionManager provides session context throughout execution
- Providers resolved via `l1/provider-registry.ts` at runtime

**Error Handling:**
- Each layer logs errors but continues processing when safe
- Promise.allSettled used for parallelism with partial failure tolerance
- Circuit breaker prevents cascade failures from repeated errors

**Testing:**
- Unit tests in `src/tests/` directory (not in src/)
- Mock utilities for testing backends, providers, LLM responses
- Integration tests verify full layer chains

## Dependencies

### Intra-Layer
- L0 modules depend on types only (no L1, L2, L3)
- L1 depends on L0 (health monitoring)
- L2 depends on L1 (backend execution)
- L3 depends on L2 (verdict generation)
- Pipeline depends on all layers

### External
- `@codeagora/shared` — utilities, diff parsing, path validation, logger
- `ai` — Vercel AI SDK for LLM calls
- `zod` — schema validation

<!-- MANUAL: -->

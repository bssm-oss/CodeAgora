<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# src

## Purpose
This directory contains the centralized test suite for CodeAgora, covering all layers of the pipeline (L0–L3), configuration, CLI, GitHub integration, and MCP behavior. Tests use vitest with adaptive pooling: unit tests run in default pool, E2E tests use forks for isolation.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `tests/` | All test files — 102 files organized by feature area |

## Test Categories

| Category | Count | Focus |
|----------|-------|-------|
| Configuration (`config-*.test.ts`) | 10 | Config loading, validation, migration, templates, credentials |
| CLI (`cli-*.test.ts`) | 9 | Commands, sessions, review options, initialization, error handling |
| Pipeline Layers (`l[0-3]-*.test.ts`) | 30 | Model registry, parallel reviewers, deduplication, objection handling, moderator logic |
| GitHub Integration (`github-*.test.ts`) | 8 | PR parsing, SARIF mapping, diff parsing, Action integration |
| Pipeline Orchestration (`pipeline-*.test.ts`, `orchestrator-*.test.ts`) | 8 | Chunking, concurrency, branch handling |
| Utilities (`utils-*.test.ts`) | 5 | Diff parsing, logging, path validation, recovery, permissions |
| Integration & E2E (`e2e-*.test.ts`, `sprint*.test.ts`) | 1+ | Full pipeline execution, multi-package module tests |
| Other (`*-remaining`) | ~16 | Provider environment, concurrency limits, annotations, confidence scoring |

## For AI Agents

### Working In This Directory
Tests are **centralized** (not colocated with source). This enables:
- Single test runner configuration at root
- Clear separation of test code from production code
- Easier test discovery and organization by feature

**File Structure**: Tests live in `src/tests/` and are organized by subsystem:
- `config-*.test.ts` → configuration system
- `cli-*.test.ts` → command-line interface
- `l0-*, l1-*, l2-*, l3-*.test.ts` → pipeline layers 0–3
- `github-*.test.ts` → GitHub integration (PR parsing, Actions)
- `pipeline-*.test.ts` → orchestration and chunking
- `utils-*.test.ts` → utility functions
- `e2e-*.test.ts` → end-to-end pipeline tests
- `sprint*.test.ts` → feature batch tests

### Testing Requirements

**Run tests:**
```bash
pnpm test           # Run all tests (uses vitest at root)
pnpm test:ws        # Run tests across all workspaces
```

**Vitest Config** (`vitest.config.ts` at root):
- Globals enabled (`describe`, `it`, `expect` available without imports)
- Include pattern: `src/tests/**/*.test.ts` and `src/tests/**/*.test.tsx`
- **Pool Strategy**:
  - Default: unit tests use default pool (shared process)
  - E2E tests (`e2e-*.test.ts`): use `forks` pool for isolation
- Coverage: v8 provider, includes `packages/*/src/**/*.ts`

**Module Resolution**:
- Package aliases resolve to source (not dist): `@codeagora/core` → `packages/core/src`
- Dependencies aliased to real pnpm store paths (prevents vi.mock conflicts)
- Deduplication: Zod and YAML pinned to single instances

**Key Patterns**:
- Use `describe()` and `it()` for organization
- Mock external services with `vi.mock()`
- Async tests: use `async` or return Promise
- Configuration tests: validate zod schemas, file I/O, migrations
- Pipeline tests: verify parallel execution, error handling, graceful degradation

**Common Test Scenarios**:
- **Config loading**: test valid/invalid YAML/JSON, missing required fields, env var overrides
- **Parallel execution**: verify concurrency limits, timeouts, Promise.allSettled patterns
- **CLI**: test command parsing, option validation, output formatting
- **Parser**: test diverse reviewer response formats, fuzzy file matching, fallback behaviors
- **Integration**: run full pipeline end-to-end with mock backends

<!-- MANUAL: -->

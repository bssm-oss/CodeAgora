<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# tests

## Purpose

Centralized test suite for CodeAgora covering all packages and pipeline layers (L0–L3), configuration, CLI, GitHub integration, and MCP behavior. Tests are **not colocated** with source code; they import from `@codeagora/*` package aliases.

Vitest is configured at the root with adaptive pooling: unit tests use the default shared pool; E2E tests (`e2e-*.test.ts`) use forks for isolation.

## Key Files

| Category | Count | Example Files |
|----------|-------|----------------|
| **L0 Model Intelligence** | 7 | `l0-bandit-store`, `l0-family-classifier`, `l0-health-monitor`, `l0-model-registry`, `l0-model-selector`, `l0-quality-tracker`, `l0-specificity-scorer` |
| **L1 Reviewers & Backends** | 13 | `l1-api-backend`, `l1-backend`, `l1-circuit-breaker`, `l1-parser`, `l1-process-kill`, `l1-provider-registry`, `l1-reviewer`, `l1-reviewer-fallback`, `l1-reviewer-timeout`, `l1-backend-timeout`, `l1-writer` |
| **L2 Discussion & Moderation** | 8 | `l2-dedup`, `l2-loadpersona`, `l2-moderator-parallel`, `l2-objection`, `l2-objection-boundary`, `l2-parser-rewrite`, `l2-supporter-pool`, `l2-threshold`, `l2-writer` |
| **L3 Verdict** | 3 | `l3-grouping`, `l3-verdict`, `l3-writer` |
| **Configuration** | 9 | `config`, `config-converter`, `config-credentials-permissions`, `config-declarative`, `config-loader-functions`, `config-migration`, `config-not-found`, `config-strict`, `config-templates`, `config-yaml` |
| **CLI** | 10 | `cli-binary-name`, `cli-commands`, `cli-doctor-live`, `cli-error-handling`, `cli-init-ci`, `cli-init-wizard`, `cli-review-options`, `cli-sessions`, `cli-sessions-filter` |
| **GitHub Integration** | 8 | `github-action-parse-args`, `github-action-sarif-path`, `github-dedup`, `github-diff-parser`, `github-integration`, `github-mapper`, `github-pr-diff`, `github-sarif` |
| **Pipeline Orchestration** | 8 | `pipeline-chunker`, `pipeline-chunk-parallel`, `pipeline-cost`, `pipeline-dryrun`, `pipeline-dsl`, `pipeline-progress`, `pipeline-report`, `pipeline-telemetry`, `orchestrator-branches` |
| **Utilities** | 6 | `utils-ca-root-permissions`, `utils-diff`, `utils-logger`, `utils-path-validation`, `utils-recovery` |
| **Integration & E2E** | 1 | `e2e-pipeline` |
| **Other** | 19 | `annotated-output`, `auto-approve`, `concurrency`, `confidence`, `i18n`, `issue-mapper`, `learning-filter`, `learning-store`, `mock-llm-backend`, `plugin-providers`, `plugin-system`, `providers-env-vars`, `scope-detector`, `session`, `slice5`, `sprint3-5-modules`, `sprint6-mcp` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `helpers/` | Shared test utilities and mock infrastructure (`mock-backend.ts`) |

## For AI Agents

### Working In This Directory

Tests are **centralized**, not colocated with source. This enables:
- Single test runner configuration at root (`vitest.config.ts`)
- Clear separation of test code from production code
- Easier test discovery and organization by feature area
- Shared mock infrastructure in `helpers/`

**File naming conventions:**
- `l0-*.test.ts` — L0 (model intelligence layer) tests
- `l1-*.test.ts` — L1 (parallel reviewers, backends) tests
- `l2-*.test.ts` — L2 (discussion, moderation) tests
- `l3-*.test.ts` — L3 (verdict) tests
- `config-*.test.ts` — configuration system tests
- `cli-*.test.ts` — CLI commands and options tests
- `github-*.test.ts` — GitHub integration (PR parsing, Actions, SARIF) tests
- `pipeline-*.test.ts` — pipeline orchestration, chunking, concurrency tests
- `utils-*.test.ts` — utility function tests
- `e2e-*.test.ts` — end-to-end pipeline tests (run in forks pool)
- `sprint*.test.ts`, `slice*.test.ts` — legacy integration/milestone tests

### Testing Requirements

**Run tests:**
```bash
pnpm test           # Run all tests (uses vitest at root)
pnpm test:ws        # Run tests across all workspaces
```

**Vitest configuration** (`vitest.config.ts` at repo root):
- **Globals enabled**: `describe`, `it`, `expect`, `beforeEach`, `afterEach` available without imports
- **Include pattern**: `src/tests/**/*.test.ts` and `src/tests/**/*.test.tsx`
- **Pool strategy**:
  - Default: unit tests use shared process (faster)
  - E2E tests (`e2e-*.test.ts`): use `forks` pool for isolation (prevents state leakage)
- **Coverage**: v8 provider, includes `packages/*/src/**/*.ts`
- **Module resolution**:
  - Package aliases: `@codeagora/core` → `packages/core/src`
  - Dependencies pinned to real pnpm store paths (prevents `vi.mock` conflicts)
  - Deduplication: Zod and yaml pinned to single instances

### Common Patterns

**Setup and teardown:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Feature', () => {
  beforeEach(() => {
    // Initialize shared state
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

**Mocking backends:**
```typescript
import { vi } from 'vitest';
import { MockLLMBackend, installMockBackend } from '../helpers/mock-backend.js';

vi.mock('@codeagora/core/l1/backend.js');

it('should call reviewer', async () => {
  const mockBackend = installMockBackend(executeBackend);
  mockBackend.register(/security/, '## Issue: SQL Injection\n### 심각도\nCRITICAL');

  // Test code
  expect(mockBackend.callCount()).toBe(1);
});
```

**Testing async code:**
```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toEqual(expected);
});

// Or using return Promise pattern:
it('should handle promises', () => {
  return promiseFunction().then((result) => {
    expect(result).toEqual(expected);
  });
});
```

**Configuration validation** (zod schemas):
```typescript
it('validates config', () => {
  const valid = { reviewers: [...], support: {...} };
  expect(() => configSchema.parse(valid)).not.toThrow();

  const invalid = { reviewers: [] }; // Missing required fields
  expect(() => configSchema.parse(invalid)).toThrow();
});
```

**Testing parallel execution:**
```typescript
it('executes reviewers in parallel', async () => {
  const backend = createMockBackend();
  const results = await Promise.allSettled([
    executeReviewer1(),
    executeReviewer2(),
    executeReviewer3(),
  ]);

  expect(results).toHaveLength(3);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(expected);
});
```

**Error handling:**
```typescript
it('handles timeout gracefully', async () => {
  mockBackend.registerDelay(/slow/, 5000, 'Response');

  const result = await executeWithTimeout(1000);
  expect(result).toEqual(timeout);
});

it('throws on validation error', () => {
  expect(() => {
    validateInput(invalid);
  }).toThrow('Expected ...');
});
```

### Test Coverage Areas

**L0 (Model Intelligence):**
- Model registry initialization and lookups
- Health monitoring (provider up/down, circuit breaker state)
- Model selection (ranking, filtering by spec)
- Quality tracking (success/failure rates)
- Bandit strategy for failing providers

**L1 (Parallel Reviewers):**
- Backend execution (API and CLI)
- Timeout and process management
- Circuit breaker (auto-blocking failing providers)
- Parser (extracting issues from diverse reviewer formats)
- Fallback behavior (retry → fallback model → forfeit)
- Provider registry (environment variable loading)

**L2 (Discussion & Moderation):**
- Deduplication (merging similar issues)
- Moderator logic (parallel objection rounds)
- Persona loading (strict/lenient personas)
- Supporter pool (picking random supporters)
- Threshold filtering (min confidence, min agreement)
- Rewriting (summarizing, reconciling conflicting opinions)

**L3 (Verdict):**
- Grouping issues (by type, severity)
- Verdict generation (final recommendations)
- Writing formatted output (markdown, JSON)

**Configuration:**
- Loading from YAML/JSON files
- Validation (zod schemas)
- Migration (old config format → new)
- Credentials management (file permissions)
- Declarative reviewer syntax

**CLI:**
- Command parsing and execution
- Session management (filtering, display)
- Output formatting (tables, JSON)
- Error reporting and recovery

**GitHub Integration:**
- Parsing PR diffs
- Writing SARIF output
- Action argument parsing
- Deduplication of GitHub-reported issues

**Pipeline:**
- Chunking (adaptive batch sizing)
- Parallel execution (concurrency limits)
- Cost tracking (tokens, API calls)
- Progress reporting

### Helper Module: `mock-backend.ts`

**Purpose**: Provides deterministic, pattern-based mock for `executeBackend`. All integration tests depend on this helper.

**Key exports:**
- `MockLLMBackend` — class for pattern-based mock responses
- `installMockBackend()` — install on already-mocked `executeBackend`
- `createMockBackend()` — standalone mock factory
- `createMockReviewResponse()` — generate valid reviewer response text
- `createMockDebateResponse()` — generate agree/disagree/neutral stances

**Example usage:**
```typescript
import { MockLLMBackend } from '../helpers/mock-backend.js';

const backend = new MockLLMBackend();
backend.register('security issue', '## Issue: ...');
backend.registerError('error pattern', new Error('Network error'));
backend.registerDelay('slow endpoint', 5000, 'Response');

const response = await backend.execute({ prompt: 'security issue', ... });
```

<!-- MANUAL: -->

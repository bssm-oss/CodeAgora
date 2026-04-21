<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# core

## Purpose
Core review pipeline implementation for CodeAgora. Contains the full 10-stage review pipeline (L0 model intelligence, Pre-Analysis, L1 parallel reviewers, Hallucination Filter, Confidence Computation, Suggestion Verification, L2 debate, L3 head verdict), configuration management, session handling, plugin system, and custom rules. This is the heart of the multi-LLM collaborative review engine.

## Key Layers
| Layer | Purpose |
|-------|---------|
| **L0** | Model Intelligence — bandit learning, health monitoring, model selection, specificity scoring, quality tracking |
| **Pre-Analysis** | 5 analyzers that enrich diff context before L1: semantic diff classification, TS diagnostics, change impact, AI rule detection, artifact exclusion |
| **L1** | Parallel Reviewers — multi-backend execution (API/CLI), specialist personas, circuit breaker, response parsing, provider registry |
| **Hallucination Filter** | 4-check false positive reduction (file existence, line range, code quote fabrication, self-contradiction) + class priors + speculative language penalties |
| **Confidence** | ConfidenceTrace — corroboration scoring, diff-size correction, finding-class priors, evidence quality scoring |
| **Suggestion Verification** | tsc transpile check for CRITICAL+ suggestions |
| **L2** | Discussion & Debate — moderator orchestration, supporter coordination, adversarial prompts, deduplication, static analysis injection |
| **L3** | Head Verdict — final verdict (ACCEPT / REJECT / NEEDS_HUMAN), triage digest (must-fix / verify / ignore), evidence grouping |
| **Pipeline** | Orchestrator connecting all layers: chunking, cost estimation, dryrun, progress tracking, telemetry, auto-approve |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/l0/` | Model Intelligence: bandit store, classifier, health monitor, model selector, quality tracker, specificity scorer, model registry |
| `src/l1/` | Parallel Reviewers: API/CLI backends, circuit breaker, parser, provider registry, reviewer executor, writer |
| `src/l2/` | Discussion Layer: moderator, deduplication, devil's advocate, objections, threshold, event emitter, writer |
| `src/l3/` | Head Verdict: grouping, verdict logic, writer |
| `src/pipeline/` | Orchestrator: chunker, cost estimator, diff complexity, DSL parser, dryrun, progress, report, telemetry, confidence, auto-approve, compact formatter |
| `src/config/` | Config loading: loader, validator, migrator, credentials, templates, mode presets, converter |
| `src/plugins/` | Plugin system: loader, registry, provider manager, builtin providers, types |
| `src/session/` | Session management (small module) |
| `src/types/` | TypeScript type definitions: config, core, l0 |
| `src/rules/` | Custom review rules: loader, matcher, types (small module) |
| `src/learning/` | Learning from reviews: collector, filter, store (small module) |

## For AI Agents

### Working In This Directory

**Setup:**
- Core is a **TypeScript package** within the monorepo
- Located at `packages/core/` with entry point `src/index.ts`
- Exports public API via `src/index.ts` (only public symbols)
- No build step — uses tsx in dev, tsup in production

**Build & Test:**
- `pnpm build` — build core only (calls tsup or skips if no dist)
- `pnpm typecheck` — type-check core
- `pnpm test` — run core tests from root `src/tests/` (filtered by package)
- `pnpm test:ws` — run tests across all packages

**Development:**
- Core modules are imported directly via `@codeagora/core` in other packages
- L0-L3 execution flow: user → orchestrator → L1 (parallel) → L2 (debate) → L3 (verdict)
- Session state is managed by SessionManager
- Config is loaded via config/loader.ts and cached per session

**Key Entry Points:**
- `src/index.ts` — public API exports
- `src/pipeline/orchestrator.ts` — main execution entry (runPipeline)
- `src/l0/index.ts` — model selection API
- `src/config/loader.ts` — config loading API

### Testing Requirements

**Parser Testing:**
- Test diverse reviewer response patterns (markdown structure, severity variations, missing fields)
- Ensure unparseable blocks are logged and skipped gracefully
- Validate fuzzy file path matching

**Config Validation:**
- Valid and invalid configs with zod schemas
- Migration of legacy config formats
- Credentials loading and 0o600 permissions

**Integration:**
- Sample diff → full L1 reviewer execution
- Discussion workflow (L2 moderator with supporters)
- Head verdict logic with both LLM and rule-based fallback
- Chunking strategy for large diffs
- Cost estimation accuracy

**Parallelization:**
- Chunk concurrency limits (adaptive: ≤2 serial, >2 parallel with pLimit(3))
- Reviewer concurrency (Promise.allSettled batch, concurrency 5)
- L2 discussion parallelism (fully parallel)
- Partial failure scenarios and circuit breaker activation

**Circuit Breaker:**
- Multiple failures trigger auto-blocking
- Graceful degradation (skip failed reviewers, continue with rest)
- All reviewers fail → exit with error

### Common Patterns

**Layer Communication:**
- L0 resolves reviewer models and returns health status
- L1 executes reviewers in parallel, returns evidence documents
- L2 moderates discussion across evidence documents
- L3 makes final verdict based on moderator report

**Error Handling:**
- L0-L1: try-catch + status field (no throw)
- L1-L2: Promise.allSettled (partial failure tolerance)
- L2-L3: graceful fallback (LLM → rule-based verdict)
- Circuit breaker: auto-block repeated failures

**Config & Session:**
- Config loaded once per session via SessionManager
- Mode presets (auto, conservative, aggressive) modify reviewer counts
- Prompts injected at {{DIFF}} placeholder
- Credentials from ~/.config/codeagora/credentials (0o600)

**Async Patterns:**
- Serial for ≤2 items, parallel with pLimit(3) for >2
- Promise.allSettled for reviewer execution (catch & continue)
- Promise.allSettled for L2 supporter rounds (full parallelism)
- No races; all dependencies await before next layer

**TypeScript:**
- Strict mode enforced
- All zod schemas for external input (config, CLI args, API responses)
- Result<T> type for security boundaries
- No `any` types

## Dependencies

### Internal (Within Core)
- `L0` → `types/l0.ts`, `types/config.ts`
- `L1` → `L0` (health monitoring), `types/core.ts`, `types/config.ts`
- `L2` → `L1` (backend execution), `types/core.ts`, `types/config.ts`
- `L3` → `L2` (verdict), `types/core.ts`, `types/config.ts`
- `Pipeline` → all layers (L0, L1, L2, L3), config, session, types
- `Config` → `types/config.ts`
- `Plugins` → `types/config.ts`
- `Rules` → `types/config.ts`
- `Learning` → `types/core.ts`
- `Session` → config, types

### External
- `@codeagora/shared` — types, utils (diff parsing, path validation, logger, zod schemas)
- `ai` (Vercel AI SDK) — LLM provider abstraction
- `@ai-sdk/*` providers — OpenAI, Anthropic, Google, Groq, OpenRouter
- `zod` — schema validation for all config and external input
- `js-yaml` — YAML parsing (config/loader.ts)

<!-- MANUAL: -->

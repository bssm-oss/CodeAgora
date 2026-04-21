# CodeAgora

## Overview
A CLI pipeline where multiple LLMs collaboratively perform deep code review.
Reviewer models run parallel independent reviews → debate conflicting opinions → head agent makes the final verdict.

## Tech Stack
- Runtime: Node.js + TypeScript (strict mode)
- CLI Framework: commander + ink (React TUI)
- Schema Validation: zod
- AI SDK: Vercel AI SDK (`ai` package) — multi-provider support
- Backends: API (direct AI SDK calls) + CLI (opencode, codex, gemini, claude, copilot)
- Test: vitest
- Build: tsup
- Package Manager: pnpm

## Architecture (10-Stage Pipeline)
```
CLI Layer → L0 (Model Intelligence) → Pre-Analysis → L1 (Parallel Reviewers)
  → Rules & Learning Filter → Hallucination Filter → Confidence Computation
  → Suggestion Verification → L2 (Discussion) → L3 (Head Verdict)
```

### Pre-Analysis Layer
5 analyzers run before L1 reviewers to enrich context:
- Semantic Diff Classification
- TypeScript Diagnostics
- Change Impact Analysis
- External AI Rule Detection (.cursorrules, CLAUDE.md, copilot-instructions)
- Build Artifact Exclusion (dist/, lock files, *.min.js filtered by default)

### Hallucination Filter (4-Check)
Reduces false positives from LLM reviewers (target: <25%):
1. File/line validation against actual diff (file existence + hunk range ±10 lines)
2. Code quote verification (backtick-quoted code fabrication detection, >50% fabricated → confidence halved)
3. Self-contradiction detection (claims "added" but only removals exist, or vice versa → confidence halved)
4. Rule-source bypass (static analysis findings always pass)

Low-confidence findings (< 20%) after penalties are routed to `uncertain` for human review.
Note: Evidence deduplication is handled separately in L2 (`deduplication.ts`, Union-Find).
Confidence scoring is split across L0 (`specificity-scorer.ts`) and L3 (`verdict.ts`, 0–15% → NEEDS_HUMAN).

### Specialist Personas
Built-in persona types: `builtin:security`, `builtin:logic`, `builtin:api-contract`, `builtin:general`

### Suggestion Verification
CRITICAL+ suggestions are verified via tsc transpile check (configurable via `reviewContext.verifySuggestions`)

## Directory Structure
```
packages/
├── shared/         # @codeagora/shared — types, utils, config, zod schemas
├── core/           # @codeagora/core — L0/L1/L2/L3 pipeline, session, pipeline orchestrator
├── github/         # @codeagora/github — PR review posting, SARIF, diff parsing, Actions
├── notifications/  # @codeagora/notifications — Discord/Slack webhooks, event stream
├── cli/            # @codeagora/cli — CLI entrypoint, commands, formatters
├── tui/            # @codeagora/tui — interactive terminal UI (experimental, ink + React)
├── mcp/            # @codeagora/mcp — MCP server (9 tools, multi-platform)
└── web/            # @codeagora/web — Hono.js REST API + React SPA dashboard
```

## Development Conventions

### Code Style
- TypeScript strict mode
- Prefer functional style (pure functions, immutable data)
- Error handling: layer-appropriate patterns
  - L1: try-catch + status field (graceful degradation: retry → fallback → forfeit)
  - L2: Promise.allSettled (partial failure tolerance)
  - Security boundaries: Result<T> type pattern
- All external input validated with zod
- Shell args validated via `validateArg()` + spawn() (never exec)

### Parallelization Strategy
- Chunk processing: adaptive (≤2 serial, >2 pLimit(3) parallel)
- Reviewers within chunk: Promise.allSettled batched (concurrency 5)
- L2 discussions: Promise.allSettled fully parallel
- Supporters within round: Promise.allSettled fully parallel

### Commit Convention
- feat: new feature
- fix: bug fix
- refactor: refactoring
- test: add/modify tests
- docs: documentation
- chore: config, build related

### Testing
- Parser: unit tests for diverse reviewer response patterns required
- Config: validation tests for valid/invalid configs
- Integration: sample diff → full pipeline execution
- Parallelization: concurrency limits and partial failure scenarios
- Hallucination filter: false positive rate validation
- Total: 228 test files, 3386 tests (2026-04-13 기준)

### Key Commands
- `pnpm dev` — dev mode (CLI package)
- `pnpm build` — build root package
- `pnpm build:ws` — build all workspace packages
- `pnpm test` — run tests (root)
- `pnpm test:ws` — run tests across all packages
- `pnpm typecheck` — type check (root)
- `pnpm typecheck:ws` — type check all workspace packages
- `pnpm lint` — lint
- `pnpm cli` — run CLI directly via tsx

## Implementation Notes

### Config
- Prompts config creation wizard when no config file found
- Warns and continues if enabled reviewers < min_reviewers
- Does not validate provider/model combinations (skips on runtime failure)
- Supports both JSON and YAML (.ca/config.json or .ca/config.yaml)

### Reviewer Execution
- API backend: direct AI SDK calls (no CLI subprocess)
- CLI backend: spawn() execution (no shell interpretation)
- Skips timed-out reviewers, continues with the rest
- Exits with error if all reviewers fail
- Circuit breaker auto-blocks repeatedly failing providers

### Parser
- Skips unparseable issue blocks (logs warning)
- Defaults to "WARNING" for unrecognized severity
- Supports fuzzy file path matching (based on diff file list)

### Prompts
- Does not enforce JSON format on reviewer output
- Requires markdown structure: ## Issue → ### Problem/Evidence/Severity/Suggestion
- Prompt files managed as markdown in prompts/ directory
- Diff injected at {{DIFF}} placeholder

### Security
- Shell injection: spawn() + SAFE_ARG regex validation
- Path traversal: absolute path blocking + containment check (fail-closed)
- Credentials: ~/.config/codeagora/credentials (0o700 directory, 0o600 file permissions)
- SSRF: URL validation + HTTPS enforced + private IP/DNS blocklist
- Permissions: fail-closed on permission check errors

## Reference Docs
1. [PRD](docs/1_PRD.md)
2. [V3_DESIGN](docs/3_V3_DESIGN.md)
3. [WEB_AND_UX_EXPANSION](docs/6_WEB_AND_UX_EXPANSION.md)
4. [ARCHITECTURE](docs/ARCHITECTURE.md)

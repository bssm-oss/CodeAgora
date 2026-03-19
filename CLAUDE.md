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

## Architecture (4-Layer)
```
CLI Layer → L0 (Model Intelligence) → L1 (Parallel Reviewers) → L2 (Discussion) → L3 (Head Verdict)
```

## Directory Structure
```
packages/
├── shared/         # @codeagora/shared — types, utils, config, zod schemas
├── core/           # @codeagora/core — L0/L1/L2/L3 pipeline, session, pipeline orchestrator
├── github/         # @codeagora/github — PR review posting, SARIF, diff parsing, Actions
├── notifications/  # @codeagora/notifications — Discord/Slack webhooks, event stream
├── cli/            # @codeagora/cli — CLI entrypoint, commands, formatters
├── tui/            # @codeagora/tui — interactive terminal UI (ink + React)
├── mcp/            # @codeagora/mcp — MCP server (7 tools, multi-platform)
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
- Shell args sanitized via `sanitizeShellArg()` + spawn() (never exec)

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
- Total: 131 test files, 1880 tests

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
- Path traversal: absolute path blocking + containment check
- Credentials: ~/.config/codeagora/credentials (0o600 permissions)
- SSRF: URL validation + HTTPS enforced + domain whitelist

## Reference Docs
1. [PRD](docs/1_PRD.md)
2. [PHASE_PLAN](docs/2_PHASE_PLAN.md)
3. [V3_DESIGN](docs/3_V3_DESIGN.md)
4. [IMPLEMENT_PLAN](docs/4_IMPLEMENT_PLAN.md)
5. [WEB_AND_UX_EXPANSION](docs/6_WEB_AND_UX_EXPANSION.md)

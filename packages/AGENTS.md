<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# packages

## Purpose
Monorepo workspace containing 8 scoped packages (`@codeagora/*`) that implement the multi-LLM code review pipeline. Each package has a focused responsibility: shared utilities and types, core review logic (L0-L3), CLI entrypoint, GitHub integration, notifications, terminal UI, MCP server, and web dashboard.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `shared/` | Types, utilities, config schemas, zod validators, color utilities — zero external dependencies except zod |
| `core/` | Review pipeline implementation (L0 model intelligence, L1 parallel reviewers, L2 debate, L3 head verdict), config management, session handling, plugin system |
| `cli/` | CLI entrypoint (`codeagora` / `agora` commands), command definitions, formatters, user prompts — orchestrates core pipeline |
| `github/` | GitHub PR integration: diff parsing, SARIF generation, comment posting, deduplication, Actions support |
| `notifications/` | Webhook integrations (Discord, Slack, generic), event streaming, live-update notifications |
| `tui/` | Terminal UI (ink + React), interactive components, screens, theme system — uses `@codeagora/core` |
| `mcp/` | MCP (Model Context Protocol) server with 9 tools exposing review pipeline to Claude and other MCP clients |
| `web/` | Hono.js REST API server and React SPA dashboard; both share `@codeagora/core` for review orchestration |

## For AI Agents

### Working In This Directory

**Setup:**
- This is a **pnpm monorepo workspace** — always use `pnpm` (not npm/yarn)
- All packages export scoped names: `@codeagora/shared`, `@codeagora/core`, etc.
- Package interdependencies use `workspace:*` protocol

**Build & Test:**
- `pnpm build:ws` — build all packages (calls tsup per-package, or `echo skip` if no build)
- `pnpm typecheck:ws` — type-check all packages
- `pnpm test:ws` — run tests across all packages (tests live in root `src/tests/`, not in packages)
- `pnpm lint` — lint all packages via eslint

**Development:**
- `pnpm dev` — run CLI in dev mode via tsx
- `pnpm cli` — run CLI directly
- Each package has its own `package.json` with `main`, `types`, and `bin` (if applicable)

**Dependencies Flow:**
- `shared` — no internal deps, foundation layer
- `core` — depends on `shared`
- `cli`, `github`, `notifications`, `tui`, `mcp`, `web` — all depend on `core` and `shared`
- `cli` also depends on `github` and `notifications` (orchestration)
- `mcp` also depends on `cli` (tools expose CLI functions)

### Common Patterns

**Exports and Imports:**
- Each package exports `dist/index.js` and `dist/index.d.ts`
- Import from `@codeagora/shared` (not relative paths) when crossing package boundaries
- Use tsconfig path aliases: `@codeagora/*`

**Error Handling:**
- `core`: try-catch + status field for graceful degradation
- `core` (L2): Promise.allSettled for partial failure tolerance
- Security boundaries (shell, files): Result<T> type pattern
- All external input validated with zod

**Shell Safety:**
- CLI and github packages may execute shell commands
- Always use `spawn()` with sanitized args via `validateArg()` (never `exec`)
- Validate inputs with zod before shell execution

**Async Patterns:**
- Chunk processing (serial ≤2 items, parallel >2 items): pLimit(3)
- Reviewers within chunk: Promise.allSettled (concurrency 5)
- L2 discussions: Promise.allSettled fully parallel
- Supporters within round: Promise.allSettled fully parallel

**TypeScript:**
- Strict mode enforced
- Functional style preferred (pure functions, immutable data)
- No `any` types; use `unknown` + narrow
- All zod schemas validate external input

**Testing:**
- Tests run from root `src/tests/` directory (not colocated with source)
- Test parser: unit tests for diverse reviewer response patterns
- Test config: validation tests for valid/invalid configs
- Test integration: sample diff → full pipeline execution
- E2E: use `forks` pool; unit: default pool

## Dependencies

### Internal (Cross-Package)
- `shared` ← foundation (types, utils, schemas)
- `core` ← `shared`
- `cli` ← `core`, `github`, `notifications`, `shared`
- `github` ← `core`, `shared`
- `notifications` ← `core`, `shared`
- `tui` ← `core`, `shared`
- `mcp` ← `core`, `cli`, `shared`
- `web` ← `core`, `shared`

### External (Notable)
- `ai` (Vercel AI SDK) — multi-provider LLM abstraction
- `@ai-sdk/*` — provider implementations (OpenAI, Anthropic, Google, Groq, OpenRouter)
- `commander` — CLI framework
- `zod` — schema validation (in shared, core, cli)
- `@octokit/rest` — GitHub API (github package)
- `@modelcontextprotocol/sdk` — MCP server (mcp package)
- `ink`, `react` — Terminal UI (tui package)
- `hono` — Web server (web package)
- `tsup` — Build tool (web package)

<!-- MANUAL: -->

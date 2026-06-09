<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-05 -->

# packages

## Purpose
Monorepo workspace containing scoped packages (`@codeagora/*`) that implement the multi-LLM code review pipeline. Each package has a focused responsibility: shared utilities and types, core review logic (L0-L3), CLI entrypoint, GitHub integration, MCP server support, and the official desktop UI.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `shared/` | Types, utilities, config schemas, zod validators, color utilities — zero external dependencies except zod |
| `core/` | Review pipeline implementation (L0 model intelligence, L1 parallel reviewers, L2 debate, L3 head verdict), config management, session handling, plugin system |
| `cli/` | CLI entrypoint (`codeagora` / `agora` commands), command definitions, formatters, user prompts — orchestrates core pipeline |
| `github/` | GitHub PR integration: diff parsing, SARIF generation, comment posting, deduplication, Actions support |
| `mcp/` | MCP (Model Context Protocol) server with 9 tools exposing review pipeline to Claude and other MCP clients |
| `desktop/` | Official Tauri app over existing CLI/core/session/config contracts |

## For AI Agents

### Working In This Directory

**Setup:**
- This is a **pnpm monorepo workspace** — always use `pnpm` (not npm/yarn)
- All packages export scoped names: `@codeagora/shared`, `@codeagora/core`, etc.
- Package interdependencies use `workspace:*` protocol

**Build & Test:**
- `pnpm build` — build workspace packages recursively
- `pnpm typecheck` — type-check package sources through the root TypeScript config
- `pnpm test` — run the root Vitest config, including root and package-local tests
- Package lint scripts exist on selected packages; run them with `pnpm --filter <package> lint`

**Development:**
- `pnpm dev` — run CLI in dev mode via tsx
- `pnpm dev <command>` — run the CLI package directly
- Each package has its own `package.json` with `main`, `types`, and `bin` (if applicable)

**Dependencies Flow:**
- `shared` — no internal deps, foundation layer
- `core` — depends on `shared`
- `cli`, `github`, `mcp`, `desktop` — depend on `core`/`shared` contracts, directly or through CLI/session artifacts
- `cli` also depends on `github` (orchestration)
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
- `cli` ← `core`, `github`, `shared`
- `github` ← `core`, `shared`
- `mcp` ← `core`, `cli`, `shared`
- `desktop` ← CLI/core contracts, shared i18n/types, Tauri bridge

### Package Boundaries
- `shared` must remain the low-level foundation; do not pull `core`, `cli`, `github`, `mcp`, or `desktop` into it.
- `core` owns review semantics. Surface packages may adapt input/output but should not invent verdict, finding, confidence, session, or config semantics.
- `github` and `mcp` should keep errors structured and caller-actionable; do not throw raw transport/provider details into user-facing output.
- Touching desktop code may require `pnpm rc:desktop-gate`; desktop must keep using CLI/core/session/config contracts instead of inventing separate review semantics.

### External (Notable)
- `ai` (Vercel AI SDK) — multi-provider LLM abstraction
- `@ai-sdk/*` — provider implementations (OpenAI, Anthropic, Google, Groq, OpenRouter)
- `commander` — CLI framework
- `zod` — schema validation (in shared, core, cli)
- `@octokit/rest` — GitHub API (github package)
- `@modelcontextprotocol/sdk` — MCP server (mcp package)
- `tsup` — Build tool

<!-- MANUAL: -->

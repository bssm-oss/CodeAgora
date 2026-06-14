<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# CodeAgora

## Purpose
Multi-LLM code review pipeline where API and local CLI reviewers independently analyze code, debate conflicting opinions, and a head agent renders a final verdict. Supported release surfaces are the CLI, GitHub Action, MCP server, and Tauri desktop app; all four must route through shared core behavior rather than defining separate review semantics.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Root workspace manifest — pnpm monorepo, bin entries `codeagora`/`agora` |
| `pnpm-workspace.yaml` | Workspace definition pointing to `packages/*` |
| `tsconfig.json` | Root TypeScript config with path aliases for all `@codeagora/*` packages |
| `tsconfig.base.json` | Shared base compiler options (ES2022, strict, composite) |
| `vitest.config.ts` | Test config — tests live in `src/tests/`, aliases resolve to package sources |
| `eslint.config.js` | Flat ESLint config — TypeScript strict + React hooks |
| `action.yml` | GitHub Actions composite action for PR review integration |
| `scripts/` | Release, benchmark, package-smoke, evidence, and bundle automation |
| `benchmarks/` | Golden-bug fixtures, configs, references, and benchmark evidence inputs |
| `.env.example` | Environment variable template for API keys |
| `.reviewignore` | Patterns to exclude from code review diffs |
| `.npmignore` | npm publish exclusions |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `packages/` | Monorepo workspace packages — all source code (see `packages/AGENTS.md`) |
| `src/` | Centralized root test suite (see `src/AGENTS.md`) |
| `docs/` | Design documents, PRD, phase plans (see `docs/AGENTS.md`) |
| `examples/` | Example projects for testing (see `examples/AGENTS.md`) |
| `assets/` | Static assets — logos, images (see `assets/AGENTS.md`) |
| `.github/` | GitHub Actions workflows, issue templates (see `.github/AGENTS.md`) |
| `scripts/` | Automation scripts for releases, benchmarks, action bundles, and evidence (see `scripts/AGENTS.md`) |
| `benchmarks/` | Golden-bug benchmark fixtures and generated benchmark state (see `benchmarks/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- This is a **pnpm monorepo** — always use `pnpm` (not npm/yarn)
- Package aliases: `@codeagora/shared`, `@codeagora/core`, `@codeagora/cli`, etc.
- Build workspace packages: `pnpm build` (runs recursive package builds)
- Type-check package sources: `pnpm typecheck`
- Run CLI in dev: `pnpm dev <command>`
- Regenerate the bundled GitHub Action after action-source changes: `pnpm build:action`
- Package/evidence smoke: `pnpm release:beta-smoke`, `pnpm evidence:manifest -- --require=rc`
- For `agora init --preset ...`, the source of truth is `packages/cli/src/commands/init.ts` (`generatePresets`, `buildPresetConfig`, and `PRESET_ALIASES`).
- Validate local CLI backend readiness with `agora doctor` / `agora doctor --live`; CLI-backed configs may run without provider API keys only when required local tools are installed and authenticated.
- For GitHub Action setup, prefer `agora init --preset action` / `--preset github-action`; this is the cheap OpenRouter Actions preset.

### Runtime Scope And Presets
- Supported release surfaces are exactly CLI, GitHub Action, MCP, and Desktop unless roadmap and release evidence are updated first.
- The GitHub Action preset is OpenRouter-only, cheap by default, uses five low-cost reviewers, one discussion round, and direct head escalation via `z-ai/glm-5.1`.
- `fast` and `budget` alias to `quick`; `balanced` and `standard` alias to `free`; `local` and `local-cli` alias to `cli`; `gha` and `github-action` alias to `action`.
- Local CLI presets are for installed/authenticated local tools such as Codex, Claude, OpenCode, Cursor, and Antigravity. Do not add Copilot to the default CLI preset without an explicit decision.

### Credentials And Key Handling
- Prefer `agora env set <provider>` for local provider keys; saved credentials live in `~/.config/codeagora/credentials` with `0o600` permissions.
- Environment variables remain supported, especially `OPENROUTER_API_KEY` for GitHub Actions and smoke tests.
- Never store provider keys in `.ca/config.*`, committed docs, fixtures, session artifacts, or evidence logs.
- Error output, JSON/NDJSON contracts, MCP responses, Desktop exports, and evidence artifacts must redact secrets.
- GitHub token handling is separate from provider credentials; fork PRs and missing secrets must degrade safely before provider-backed work.

### Architecture Overview
```
CLI Layer → L0 (Model Intelligence) → Pre-Analysis → L1 (Parallel Reviewers)
  → Rules & Learning Filter → Hallucination Filter → Confidence Computation
  → Suggestion Verification → L2 (Discussion) → L3 (Head Verdict)
```
- **L0**: Selects optimal models via multi-armed bandit + health monitoring
- **Pre-Analysis**: 5 analyzers enrich context (semantic diff, TS diagnostics, impact, AI rules, artifact exclusion)
- **L1**: Runs parallel independent reviews using specialist personas (API or CLI backends)
- **Hallucination Filter**: 4-check false positive reduction (file existence, line range, quote fabrication, self-contradiction)
- **L2**: Debates contested findings via supporter pool + devil's advocate; deduplicates across reviewers
- **L3**: Head agent synthesizes final verdict (ACCEPT / REJECT / NEEDS_HUMAN) with triage digest

### Testing Requirements
- Tests are in `src/tests/` (not colocated with source)
- Run: `pnpm test` (root Vitest config includes root and package-local tests)
- E2E tests use `forks` pool; unit tests use default pool
- Coverage targets the active workspace packages under `packages/*`
- Local CLI backend changes need smoke coverage for CLI-backed readiness paths as well as API-key-backed paths; dry-run plumbing is not live provider evidence.
- GitHub Action preset or runtime changes need focused Action tests and `pnpm build:action` when the bundled runtime can change.
- MCP behavior changes should verify tool listing/calls through the MCP SDK path, not hand-rolled JSON-RPC framing.

### Common Patterns
- TypeScript strict mode everywhere
- Zod for all external input validation
- Functional style preferred (pure functions, immutable data)
- Shell args sanitized via `validateArg()` + `spawn()` (never `exec`)
- Error handling: L1 try-catch, L2 Promise.allSettled, security boundaries use Result<T>

### Scope Boundaries
- Do not reintroduce retired web dashboard, terminal TUI, or notification package surfaces.
- Keep desktop claims backed by package, launch, WebDriver, visual QA, export, signing/notarization/updater, and release-evidence gates.
- Do not widen the stable release contract beyond CLI, GitHub Action, MCP, and Desktop without explicit roadmap/evidence updates.
- Keep Desktop as an official supported local UI surface, but do not let Desktop introduce config formats, verdict semantics, or release promises that diverge from CLI, GitHub Action, or MCP.
- Do not treat deterministic tests, dry-runs, or provider-free smoke as live provider, live CLI quality, or live GitHub evidence; release claims need the artifacts and tiers named in `docs/archived/RELEASE_EVIDENCE.md`.
- Stable GitHub Action claims require real pull-request workflow evidence, including degraded paths for forks, missing provider secrets, stale heads, oversized diffs, provider failures, and posting failures.

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

## Dependencies

### External
- `ai` (Vercel AI SDK) — multi-provider LLM abstraction
- `@ai-sdk/*` — provider packages (OpenAI, Anthropic, Google, Groq, OpenRouter)
- `commander` — CLI framework
- `zod` — schema validation
- `@octokit/rest` — GitHub API
- `@modelcontextprotocol/sdk` — MCP server
- `tsup` — build tool
- `vitest` — test framework

<!-- MANUAL: -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# CLI Package (@codeagora/cli)

## Purpose
CLI entrypoint and command implementations for CodeAgora. Provides the command-line interface for running reviews, managing configuration, sessions, and analytics. Routes to core pipeline via `@codeagora/core`.

## Key Files
| File | Description |
|------|-------------|
| `src/index.ts` | CLI entrypoint; commander-based command router |
| `src/commands/` | Command implementations (init, review, doctor, sessions, etc.) |
| `src/formatters/` | Output formatting (text, JSON, Markdown, GitHub, annotated) |
| `src/options/` | CLI option parsing (review options, reviewer selection) |
| `src/utils/` | Utility functions (colors, error classification) |

## Subdirectories

### commands/
Core command modules:
- `init.ts` — Project initialization wizard; creates `.ca/config.json` or `.ca/config.yaml`
- `review.ts` (in index.ts) — Main review pipeline orchestrator; handles stdin, --pr, --staged
- `doctor.ts` — Environment and configuration health checks
- `providers.ts` — List supported providers and API key status
- `sessions.ts` — Past review session management (list, show, diff, prune, stats)
- `models.ts` — Model performance leaderboard
- `explain.ts` — Narrative explanation of past review sessions
- `agreement.ts` — Reviewer agreement matrix computation
- `replay.ts` — Re-render past review sessions (no LLM calls)
- `costs.ts` — Cost analytics and summaries
- `status.ts` — CodeAgora status overview
- `config-set.ts` — Config value mutations (dot notation)
- `providers-test.ts` — API key status verification
- `learn.ts` — Pattern learning and management

### formatters/
Output formatters:
- `review-output.ts` — Formats review results (text, json, md, github, annotated)
- `annotated-output.ts` — Annotated diff with inline findings

### options/
- `review-options.ts` — Parse --reviewers flag and stdin handling

### utils/
- `colors.ts` — Terminal color helpers
- `errors.ts` — Error classification and formatting

## For AI Agents

### Working In This Directory
1. Commands live in `src/commands/` as separate files
2. Each command exports public functions and integrates with commander via `program.command()`
3. Diff input can come from: file path, stdin, --pr (GitHub), or --staged (git)
4. Output formatting is centralized in `formatters/`
5. Error handling uses `formatError()` and `classifyError()` for consistent UX

### Common Patterns
- **Diff acquisition**: Handle file path, stdin, --pr URL parsing, --staged git diff
- **Progress indication**: Use `ProgressEmitter` from core for spinner + JSON streaming
- **GitHub integration**: Parse PR URLs, fetch diffs, post reviews back to GitHub
- **Session management**: Store in `.ca/sessions/{YYYY-MM-DD}/{NNN}/`
- **Config validation**: Load and validate via `@codeagora/core/config/loader`
- **Credential loading**: Call `loadCredentials()` at startup to populate environment

### Adding a New Command
1. Create a new file in `src/commands/`
2. Export a public function matching the command's logic
3. In `src/index.ts`, register the command via `program.command()` or a subcommand chain
4. Add help text via `.addHelpText('after', '...')`
5. Handle errors with `formatError()` for consistent output

## Dependencies

### Internal
- `@codeagora/core` — Pipeline orchestrator, config loader, provider registry
- `@codeagora/shared` — Types, zod schemas, i18n, utilities
- `@codeagora/github` — PR diff fetching, review posting, SARIF
### External
- `commander` — CLI framework
- `ora` — Progress spinners
- `@clack/prompts` — Interactive prompts
- `yaml` — YAML parsing/serialization
- `ai` — Vercel AI SDK (used in doctor for live checks)

<!-- MANUAL: -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# CLI Commands Directory

## Purpose
Command implementations for CodeAgora CLI. Each file exports a public function that handles a specific command or subcommand group.

## Key Files
| File | Description |
|------|-------------|
| `init.ts` | Initialize CodeAgora in a project (wizard + default setup) |
| `doctor.ts` | Environment and config health checks |
| `providers.ts` | List supported providers and API key status |
| `providers-test.ts` | Verify API keys work (live tests) |
| `sessions.ts` | Past review session management |
| `models.ts` | Model performance leaderboard |
| `explain.ts` | Narrative explanation of past sessions |
| `agreement.ts` | Reviewer agreement matrix |
| `replay.ts` | Re-render past sessions |
| `costs.ts` | Cost analytics |
| `status.ts` | CodeAgora status overview |
| `config-set.ts` | Mutate config values |
| `learn.ts` | Pattern learning |

## Subdirectories
None — all commands are flat in this directory.

## For AI Agents

### Working In This Directory
- Each file exports one or more async functions that are called by command handlers in `index.ts`
- Commands follow a consistent structure: load data → validate → format → output
- Session commands read from `.ca/sessions/{YYYY-MM-DD}/{NNN}/`
- Config commands read from `.ca/config.json` or `.ca/config.yaml`
- All external input is validated before use

### Common Patterns
- **Session format**: `YYYY-MM-DD/NNN` (date/ID)
- **Config loading**: Use `loadConfig()` from `@codeagora/core`
- **File operations**: All async via `fs/promises`
- **Output**: Return formatted strings or structured data for `formatters/` to render
- **Error handling**: Throw descriptive errors; CLI layer catches and formats

### Adding a New Command
1. Create `command-name.ts` in this directory
2. Export primary function: `export async function runCommandName(...): Promise<OutputType>`
3. Import and call in `src/index.ts` via `program.command(...).action()`
4. Add format functions in `formatters/` if needed

## Dependencies
- Core: `@codeagora/core` (config, pipeline, registry)
- Shared: `@codeagora/shared` (types, utils, i18n)
- GitHub: `@codeagora/github` (PR operations)
- Utilities: `fs/promises`, `path`, `ora`, `@clack/prompts`

<!-- MANUAL: -->

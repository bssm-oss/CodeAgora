<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# CLI Source Directory

## Purpose
Core CLI source code: entrypoint, commands, formatters, options parsing, and utility functions.

## Key Files
| File | Description |
|------|-------------|
| `index.ts` | CLI entrypoint and main command router |
| `commands/` | Flat command modules; verify current inventory before editing |
| `formatters/` | Output formatting logic |
| `options/` | CLI option parsing |
| `utils/` | Helper functions |

## Subdirectories
- `commands/` — Command implementations
- `formatters/` — Output formatters for various formats (text, JSON, MD, GitHub, annotated)
- `options/` — CLI options and parsing
- `utils/` — Utility functions (colors, errors)

## For AI Agents

### Working In This Directory
- Review commands in `commands/` to understand what each CLI command does
- Check `formatters/` to see output formatting patterns
- Use `utils/colors.ts` and `utils/errors.ts` for consistent styling and error handling
- Commands integrate with the core pipeline via `runPipeline()` from `@codeagora/core`
- `commands/review.ts` owns stdin/path/`--staged`/PR/dry-run review entry behavior.
- Formatters own machine-readable output stability; do not add progress or warnings to JSON/NDJSON stdout.
- Stable CLI options need help text, CLI reference/docs parity, and focused tests when added or changed.

### Common Patterns
- Commands use async/await and commander hooks
- Options are validated via zod schemas in `@codeagora/shared`
- All commands export a primary function that is called by the command handler
- Error handling uses `classifyError()` to determine exit codes
- i18n support via `t()` from `@codeagora/shared/i18n`
- `commands/init.ts` is the source of truth for generated presets, including local CLI and OpenRouter Action presets.

## Dependencies
- Core: `@codeagora/core`, `@codeagora/shared`
- UI: `ora` (spinners), `@clack/prompts` (interactive)
- CLI: `commander` (framework)
- Config: `yaml` (parsing)

<!-- MANUAL: -->

# packages/cli/src/

## Responsibility

Core CLI source layer: entrypoint, command modules, output formatters, option parsers, and local utility functions.

## Design Patterns

Commander-driven routing, async command handlers, strict validation via shared zod schemas, and centralized UX helpers for colors and classified errors.

## Data & Control Flow

`index.ts` registers commands → command modules gather inputs and invoke core/github APIs → formatters render final output → utils normalize styling and exit/error behavior.

## Integration Points

Crosses into `@codeagora/core`, `@codeagora/github`, and `@codeagora/shared`; uses `commander`, `ora`, `@clack/prompts`, and `yaml` for CLI UX and config parsing.

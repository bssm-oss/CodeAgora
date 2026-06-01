# packages/cli/

## Responsibility

CLI package root: ships the `codeagora`/`agora` entrypoints, wires commander command routing, and exposes user-facing review/config/session commands.

## Design Patterns

Thin shell over `@codeagora/core`; commands are split by concern, formatting is centralized, and shared option/error helpers keep behavior consistent across subcommands.

## Data & Control Flow

User input enters `src/index.ts`, routes to a command module, loads/validates diff/config/session state, then passes results to formatters for text/JSON/Markdown/GitHub/annotated output.

## Integration Points

Depends on `@codeagora/core` for pipeline/config/session logic, `@codeagora/github` for PR operations, and `@codeagora/shared` for schemas, types, i18n, and utility helpers.

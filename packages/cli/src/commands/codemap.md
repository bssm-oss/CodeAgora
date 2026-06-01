# packages/cli/src/commands/

## Responsibility

All CLI command handlers except low-level formatting/options: init, review, doctor, providers, sessions, models, explain, agreement, replay, costs, status, config mutation, and learning flows.

## Design Patterns

Each file exports a focused async handler; commands follow load → validate → execute → format, with session/config commands reading from `.ca/` project state.

## Data & Control Flow

Commander invokes a command handler, which may read files/stdin, fetch PR/session data, call the core pipeline or GitHub helpers, then return structured data or formatted strings.

## Integration Points

Integrates with `@codeagora/core` for config/pipeline/session logic, `@codeagora/github` for PR-related actions, and `@codeagora/shared` for types, schemas, and i18n.

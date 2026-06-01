# packages/cli/src/utils/

## Responsibility

Shared CLI helpers for terminal color/style handling, error classification, agent-contract helpers, and inline setup utilities.

## Design Patterns

Utility-only functions with no orchestration logic; keep formatting, classification, and small cross-command concerns out of command files.

## Data & Control Flow

Commands and formatters call into utils to map errors, decorate output, and support repeated CLI setup steps.

## Integration Points

Used across command handlers and output formatters; may depend on shared types but avoids direct pipeline/GitHub coupling.

# packages/cli/src/options/

## Responsibility

Parse and normalize CLI flags, especially review reviewer selection and stdin/diff source handling.

## Design Patterns

Small pure parsers built around validated flag shapes; convert raw commander inputs into typed option objects consumed by command handlers.

## Data & Control Flow

Commander collects argv → option helpers interpret reviewer lists, defaults, and stdin/diff mode → handlers receive normalized options and source metadata.

## Integration Points

Feeds the review command path and depends on shared schemas/utilities for validation and normalization.

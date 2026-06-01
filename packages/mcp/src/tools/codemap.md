# packages/mcp/src/tools/

## Responsibility

One file per MCP tool: quick/full/pr review, dry run, explain, leaderboard, stats, config get, and config set.

## Design Patterns

Each tool exports a registration function that binds a `server.tool()` schema/handler pair and delegates shared work to helpers.

## Data & Control Flow

Incoming MCP args are validated with zod, passed to helper functions or pipeline runners, then wrapped into MCP-compatible `{ content: [...] }` responses.

## Integration Points

Depends on `@modelcontextprotocol/sdk`, `@codeagora/core`, `@codeagora/cli`, and local shared-schema/response helpers for consistent tool output.

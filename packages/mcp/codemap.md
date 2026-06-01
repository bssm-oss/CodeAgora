# packages/mcp/

## Responsibility

MCP server root: exposes CodeAgora review/config tools over stdio for Claude and other MCP clients.

## Design Patterns

`McpServer` registration per tool, zod-validated inputs, and helper-based pipeline execution that returns structured MCP text content.

## Data & Control Flow

StdIO transport receives tool calls → `index.ts` routes to a tool module → tool uses helpers to run review/config logic → result is formatted as JSON/text response.

## Integration Points

Depends on `@modelcontextprotocol/sdk`, `@codeagora/core`, `@codeagora/cli`, and `@codeagora/shared`; no separate HTTP transport or server state.

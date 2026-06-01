# packages/mcp/src/

## Responsibility

Server implementation for the MCP interface: bootstraps the stdio server and wires shared review helpers.

## Design Patterns

Small entrypoint plus helper module pattern; tool implementations stay isolated and use zod schemas for each request shape.

## Data & Control Flow

`index.ts` creates the server, registers 9 tool handlers, starts `StdioServerTransport`; handlers call helpers to run pipeline work and shape responses.

## Integration Points

Integrates with `@codeagora/core` for pipeline execution, `@codeagora/cli` for PR-oriented flows, and `@modelcontextprotocol/sdk` for the transport/server APIs.

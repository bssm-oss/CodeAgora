<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# MCP Source Files

## Purpose
MCP server implementation exposing CodeAgora pipeline as tools for Claude and other AI agents.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Server setup — McpServer creation, tool registration, stdio transport start |
| `helpers.ts` | Core review logic — `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `tools/` | 7 tool implementations: review-quick, review-full, review-pr, dry-run, explain, leaderboard, stats |

## For AI Agents

### Working In This Directory
- Add new tools as separate files in `tools/`
- Each tool: register with `server.tool()` in its export function
- Call helpers from `helpers.ts` for pipeline execution
- Keep tool implementations focused (one tool = one file)
- Use zod for input validation schemas

### Common Patterns
- **Tool template:** `export function register<ToolName>(server: McpServer): void { server.tool(...) }`
- **Input validation:** Use zod `z.string()`, `z.number()`, etc. with `.describe()`
- **Pipeline execution:** Call `runReviewWithDiff(diff, options)` or variants
- **Response format:** `{ content: [{ type: 'text' as const, text: JSON.stringify(...) }] }`
- **Error handling:** Return error decision in response, do not throw

### Tool Structure
Each tool file exports a single register function that:
1. Validates input with zod schema
2. Calls helper function (`runReviewCompact()`, `runReviewRaw()`, etc.)
3. Formats result with `formatCompact()` if needed
4. Returns MCP-compatible response

### Dependencies
#### Internal
- `@codeagora/core` — pipeline runner and result types
- `@codeagora/shared` — types

#### External
- `@modelcontextprotocol/sdk` — McpServer type
- `zod` — schema validation

<!-- MANUAL: -->

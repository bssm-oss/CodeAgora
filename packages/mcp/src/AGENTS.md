<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# MCP Source Files

## Purpose
MCP server implementation exposing the CodeAgora pipeline as tools for MCP-compatible clients, IDEs, and agents.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Server setup — McpServer creation, tool registration, stdio transport start |
| `registry.ts` | Central tool registration source |
| `helpers.ts` | Core review logic — `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()` |
| `post-actions.ts` | Post-review action helpers |
| `version.ts` | Version reporting |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `tools/` | 9 tool implementations: review-quick, review-full, review-pr, dry-run, explain, leaderboard, stats, config-get, config-set |

## For AI Agents

### Working In This Directory
- Add new tools as separate files in `tools/`
- Register tools through `registry.ts` so startup, listing, and docs stay aligned.
- Call helpers from `helpers.ts` for pipeline execution
- Keep tool implementations focused (one tool = one file)
- Use zod for input validation schemas
- Use shared response/schema helpers for stable success and error paths.
- Keep stdout reserved for MCP protocol traffic; diagnostics belong on stderr.

### Common Patterns
- **Tool template:** `export function register<ToolName>(server: McpServer): void { server.tool(...) }`
- **Input validation:** Use zod `z.string()`, `z.number()`, etc. with `.describe()`
- **Pipeline execution:** Call `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()`, or related helpers
- **Response format:** `{ content: [{ type: 'text' as const, text: JSON.stringify(...) }] }`
- **Error handling:** Return error decision in response, do not throw

### Tool Structure
Each tool file exports a single register function that:
1. Validates input with zod schema
2. Calls helper function (`runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()`, etc.)
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

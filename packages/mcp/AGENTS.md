<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# MCP Package (@codeagora/mcp)

## Purpose
MCP (Model Context Protocol) server that exposes CodeAgora's multi-LLM code review pipeline as tools for Claude and other AI agents. Wraps the core pipeline with 7 specialized tools: quick review, full review, PR review, dry-run, explain, leaderboard, and stats. Runs as a CLI subprocess using stdio transport.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | MCP server setup — creates McpServer, registers all 7 tools, starts stdio transport |
| `src/helpers.ts` | Shared logic: `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()` — core review orchestration |
| `src/tools/review-quick.ts` | `review_quick` tool — L1-only (parallel reviewers), no debate, no head verdict |
| `src/tools/review-full.ts` | `review_full` tool — Full L0→L1→L2→L3 pipeline with debate and consensus |
| `src/tools/review-pr.ts` | `review_pr` tool — PR-specific review with GitHub integration (issues, comments) |
| `src/tools/dry-run.ts` | `dry_run` tool — Validate diff/config without running full review |
| `src/tools/explain.ts` | `explain` tool — Explain a finding or provide guidance on a code pattern |
| `src/tools/leaderboard.ts` | `leaderboard` tool — Model performance ranking based on past reviews |
| `src/tools/stats.ts` | `stats` tool — Session statistics and historical metrics |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/tools/` | 7 tool implementations (one file per tool) |

## For AI Agents

### Working In This Directory

**Language & Tools:**
- TypeScript (strict mode)
- No test suite (integration via MCP protocol)
- Build: skip (compiled by root tsup)

**MCP Protocol:**
- Server: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Transport: `StdioServerTransport` for stdio-based communication
- Tool registration: `server.tool(name, description, schema, handler)`
- Schema: zod for input validation

**Dependencies:**
- `@modelcontextprotocol/sdk` (^1.0) — MCP server and transport
- `@codeagora/core` — runPipeline, CompactReviewResult formatting
- `@codeagora/cli` — CLI-based review execution
- `zod` — input validation schemas

**Key Commands:**
- `pnpm typecheck` — type-check this package
- Built binary: `node dist/index.js` or `codeagora-mcp` (via bin entry in package.json)

### Common Patterns

**Tool Registration:**
```typescript
server.tool(
  'tool_name',
  'Human-readable description',
  {
    param1: z.string().describe('Param 1 help'),
    param2: z.number().optional().default(3),
  },
  async ({ param1, param2 }) => {
    const result = await doWork(param1, param2);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);
```

**Diff Handling:**
- Accept `diff` as raw string (unified diff format)
- Write to temp file: `path.join(os.tmpdir(), 'codeagora-mcp', `review-${Date.now()}.patch`)`
- Clean up with `.catch(() => {})` to ignore failures
- Pass to `runPipeline({ diffPath: tmpFile, ... })`

**Result Formatting:**
- Use `formatCompact()` to convert PipelineResult to CompactReviewResult
- Return JSON response: `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`

**Error Handling:**
- Wrap pipeline calls in try-catch
- Return error decision: `{ decision: 'ERROR', reasoning: 'message', issues: [], ... }`
- Log errors but do not throw (MCP expects structured responses)

### Tool Catalog

| Tool | Input | Behavior | Use Case |
|------|-------|----------|----------|
| `review_quick` | diff, reviewer_count (default 3) | L1 only (parallel reviewers, no debate) | Fast feedback, initial assessment |
| `review_full` | diff | L0→L1→L2→L3 (full pipeline with debate) | Thorough consensus-based review |
| `review_pr` | owner, repo, pr_number | Full review + post issues/comments to PR | Automated PR review in GitHub |
| `dry_run` | diff, config (optional) | Validate diff format and config without running review | Pre-flight check |
| `explain` | code_snippet, context (optional) | Ask head agent to explain code or provide guidance | Clarification, learning |
| `leaderboard` | metric (accuracy, speed, consensus) | Historical model performance ranking | Choose best reviewers |
| `stats` | session_id (optional) | Review session statistics and metrics | Audit, reporting |

### Dependencies
#### Internal
- `@codeagora/core` — runPipeline(), PipelineResult, formatCompact()
- `@codeagora/cli` — CLI-based reviewer execution (for review_pr)
- `@codeagora/shared` — types, utilities

#### External
- `@modelcontextprotocol/sdk` (^1.0.0) — McpServer, StdioServerTransport
- `zod` — input validation (via parent monorepo)
- Built-ins: `fs/promises`, `path`, `os` for temp file handling

### Architecture Notes
- All tools call `runReviewWithDiff()` or variants in helpers.ts
- Diff is written to temp file, passed to `runPipeline()`, temp file cleaned up in finally block
- Results formatted with `formatCompact()` for consistent response structure
- No async state — each tool call is independent
- stdio transport handles incoming MCP requests and outgoing responses

<!-- MANUAL: -->

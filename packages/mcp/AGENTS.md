<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# MCP Package (@codeagora/mcp)

## Purpose
MCP (Model Context Protocol) server that exposes CodeAgora's multi-LLM code review pipeline as tools for MCP-compatible clients, IDEs, and agents. Wraps the core pipeline with review, dry-run, leaderboard/stats, session/config, and explanation tools. Runs as a CLI subprocess using stdio transport.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | MCP server setup — creates McpServer, registers all 9 tools, starts stdio transport |
| `src/registry.ts` | Central tool registration and catalog metadata |
| `src/helpers.ts` | Shared logic: `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()` — core review orchestration |
| `src/post-actions.ts` | Post-review action helpers |
| `src/version.ts` | MCP package/runtime version reporting |
| `src/tools/review-quick.ts` | `review_quick` tool — L1-only (parallel reviewers), no debate, no head verdict |
| `src/tools/review-full.ts` | `review_full` tool — Full L0→L1→L2→L3 pipeline with debate and consensus |
| `src/tools/review-pr.ts` | `review_pr` tool — PR-specific review with GitHub integration (issues, comments) |
| `src/tools/dry-run.ts` | `dry_run` tool — Validate diff/config without running full review |
| `src/tools/explain.ts` | `explain` tool — Explain a finding or provide guidance on a code pattern |
| `src/tools/leaderboard.ts` | `leaderboard` tool — Model performance ranking based on past reviews |
| `src/tools/stats.ts` | `stats` tool — Session statistics and historical metrics |
| `src/tools/config-get.ts` | `config_get` tool — Read current reviewer configuration |
| `src/tools/config-set.ts` | `config_set` tool — Update reviewer configuration settings |
| `src/tools/shared-response.ts` | Shared compact response and structured error helpers |
| `src/tools/shared-schema.ts` | Shared tool input schemas, including repo-path handling |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/tools/` | 9 tool implementations (one file per tool) |

## For AI Agents

### Working In This Directory

**Language & Tools:**
- TypeScript (strict mode)
- Tool handler tests live in package-local tests plus root `src/tests/`
- Build through root/package tsup; package startup is covered by release smoke

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
- `pnpm vitest run packages/mcp/src/tests/tool-handlers.test.ts packages/mcp/src/tests/tools.test.ts`
- `pnpm vitest run packages/mcp/src/tests/stdio-startup.test.ts` for startup/tool-list changes
- `pnpm --filter @codeagora/mcp build`
- Built binary: `node dist/index.js` or `codeagora-mcp` (via bin entry in package.json)
- Package smoke is included in `pnpm release:beta-smoke`
- Do not write logs, banners, or warnings to stdout before/during stdio protocol handling. Use stderr for diagnostics.

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
- Wrap tool execution in try-catch and return structured tool errors.
- Preserve stable `status`, `code`, `message`, and optional `details` fields for agent callers.
- For `repo_path`, tell callers whether to omit it, pass the workspace root, or stay inside the server/repo boundary.
- Do not leak raw filesystem, provider secret, token, or transport internals into compact responses.
- Keep errors structured and stable for agent callers: `status`, `code`, `message`, and optional redacted `details`.
- Verify MCP tool listing/calls through the MCP SDK path; avoid relying on hand-rolled JSON-RPC framing for release claims.

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
| `config_get` | — | Read current reviewer config (model list, thresholds, etc.) | Inspect active config |
| `config_set` | key, value | Update a config field for the current session | Tune without restarting |

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
- All tools call `runReviewCompact()`, `runReviewRaw()`, `getStagedDiff()`, or related helpers in `helpers.ts`
- Diff is written to temp file, passed to the shared review path, then cleaned up in finally block
- Results formatted with compact/shared response helpers for consistent response structure
- Tools may accept explicit `repo_path`; validate it before reading config/session state
- No async state — each tool call is independent
- stdio transport handles incoming MCP requests and outgoing responses

<!-- MANUAL: -->

# @codeagora/mcp

CodeAgora MCP server for Claude Code, Cursor, and other MCP-compatible clients.

## Install

Release/local smoke uses a packed tarball before publishing:

```bash
pnpm --filter @codeagora/mcp build
pnpm --filter @codeagora/mcp pack --dry-run
```

For published installs, users can run the package with:

```bash
npx -y @codeagora/mcp@rc
```

## Client Configuration

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp@rc"]
    }
  }
}
```

For local validation, point your client at the built workspace binary instead:

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "node",
      "args": ["/absolute/path/to/CodeAgora/packages/mcp/dist/index.js"]
    }
  }
}
```

## Environment Variables

Provider keys are required only for live review tools that call LLM providers. Config and stats tools do not require provider keys.

- `OPENAI_API_KEY` for OpenAI models.
- `ANTHROPIC_API_KEY` for Anthropic models.
- `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_API_KEY` for Gemini models.
- `GROQ_API_KEY` for Groq models.
- `OPENROUTER_API_KEY` for OpenRouter models.
- `GITHUB_TOKEN` for PR review workflows that fetch or post GitHub data.

Deterministic benchmark CI gates such as `pnpm bench:ci` do not require live provider keys. Manual live benchmark runs with `pnpm bench:fn:run` do.

## Tools

- `review_quick`: fast L1-only diff review.
- `review_full`: full L0-L3 review with debate and head verdict.
- `review_pr`: PR-oriented review flow.
- `dry_run`: validate diff/config without a full review.
- `explain_session`: explain a previous session (`repo_path` optional).
- `get_leaderboard`: inspect model ranking data.
- `get_stats`: inspect review statistics (`repo_path` optional).
- `config_get`: read current reviewer configuration (`repo_path` optional).
- `config_set`: update supported configuration fields (`repo_path` optional).

Default MCP review responses are compact to preserve agent context. Request `output_format: "json"` from review tools when you need the versioned `codeagora.review.v1` machine contract.

## Common Calls

Use the current workspace root implicitly when the MCP server is already started inside the repo:

```json
{
  "name": "review_quick",
  "arguments": {
    "diff": "diff --git a/src/app.ts b/src/app.ts\n@@ -1,3 +1,4 @@\n+const ready = true;\n"
  }
}
```

Use staged mode when you do not want to paste a diff:

```json
{
  "name": "review_full",
  "arguments": {
    "staged": true,
    "output_format": "json"
  }
}
```

Preflight a diff before spending provider tokens:

```json
{
  "name": "dry_run",
  "arguments": {
    "diff": "diff --git a/src/app.ts b/src/app.ts\n@@ -1,3 +1,4 @@\n+const ready = true;\n"
  }
}
```

Inspect or update config from the same workspace:

```json
{
  "name": "config_get",
  "arguments": {
    "key": "discussion.maxRounds"
  }
}
```

```json
{
  "name": "config_set",
  "arguments": {
    "key": "discussion.maxRounds",
    "value": 3
  }
}
```

Explain a prior session without re-running the review:

```json
{
  "name": "explain_session",
  "arguments": {
    "session": "2026-03-19/001"
  }
}
```

Tool failures use MCP protocol `isError: true` with a structured JSON body:

```json
{
  "status": "error",
  "code": "INVALID_INPUT",
  "message": "Either diff or staged=true is required"
}
```

Stable error codes include `INVALID_INPUT`, `INVALID_REPO_PATH`, `REVIEW_FAILED`, `REVIEW_PR_FAILED`, `DRY_RUN_FAILED`, `CONFIG_GET_FAILED`, `CONFIG_SET_FAILED`, `EXPLAIN_SESSION_FAILED`, `LEADERBOARD_FAILED`, and `STATS_FAILED`.

## Troubleshooting

- If the server exits immediately, run `pnpm --filter @codeagora/mcp build` and confirm `packages/mcp/dist/index.js` exists.
- If review tools return missing-provider errors, set the provider key for the configured reviewer backend.
- If `repo_path` is rejected, omit it when you are already inside the workspace; otherwise pass the exact workspace root. Symlinks and paths outside the repo are intentionally rejected.
- The structured error body includes `guidance` for invalid `repo_path`, empty diff, and other common retryable failures.
- If a client cannot find the command, use an absolute `node` path and an absolute `dist/index.js` path for local beta smoke.

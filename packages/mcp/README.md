# @codeagora/mcp

CodeAgora MCP server for Claude Code, Cursor, and other MCP-compatible clients.

## Install

Beta local smoke uses a packed tarball instead of publishing:

```bash
pnpm --filter @codeagora/mcp build
pnpm --filter @codeagora/mcp pack --dry-run
```

For published installs, users can run the package with:

```bash
npx -y @codeagora/mcp
```

## Client Configuration

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp"]
    }
  }
}
```

For local beta validation, point your client at the built workspace binary instead:

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
- `explain_session`: explain a previous session.
- `get_leaderboard`: inspect model ranking data.
- `get_stats`: inspect review statistics.
- `config_get`: read current reviewer configuration.
- `config_set`: update supported configuration fields.

Default MCP review responses are compact to preserve agent context. Request `output_format: "json"` from review tools when you need the versioned `codeagora.review.v1` machine contract.

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
- If `repo_path` is rejected, pass a real directory inside the current repository boundary. Symlinks and paths outside the repo are intentionally rejected.
- If a client cannot find the command, use an absolute `node` path and an absolute `dist/index.js` path for local beta smoke.

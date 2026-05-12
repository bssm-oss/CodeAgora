# Extensions

Optional packages installed separately from the core `codeagora` CLI.

```bash
npm i -g @codeagora/mcp@beta       # MCP server (Claude Code, Cursor, etc.)
```

## Desktop App

The former web dashboard, terminal TUI, and webhook notification surfaces are no longer first-class extension packages.

The replacement direction is a planned cross-platform Tauri desktop app for the human-facing local UI: review history, result exploration, configuration, progress, cost visibility, and local alerts. It remains a private preview surface until packaging and parity gates are ready.

## MCP Server (`@codeagora/mcp`)

Exposes the full CodeAgora pipeline as an MCP server compatible with Claude Code, Cursor, Windsurf, and VS Code.

**9 tools:** `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, `get_leaderboard`, `get_stats`, `config_get`, `config_set`

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp@beta"]
    }
  }
}
```

Provider keys are only needed for live review tools. `dry_run`, `tools/list`, and config reads should start without API keys.

`review_quick` runs L1 only for fast feedback. `review_full` runs the complete L1 > L2 > L3 pipeline. `review_pr` reviews a GitHub PR by URL or number. Review tools accept `repo_path` for surrounding code context, but explicit paths must stay inside the MCP server cwd/repository root. Failures return MCP `isError: true` with JSON `{ "status": "error", "code": string, "message": string, "details"?: object }`. `config_get`/`config_set` manage reviewer configuration without leaving the MCP session.

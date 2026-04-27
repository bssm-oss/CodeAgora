# Extensions

Optional packages installed separately from the core `codeagora` CLI.

```bash
npm i -g @codeagora/mcp            # MCP server (Claude Code, Cursor, etc.)
```

## Desktop App

The former web dashboard, terminal TUI, and webhook notification surfaces are no longer first-class extension packages.

The replacement direction is a single cross-platform Tauri desktop app that owns the human-facing local UI: review history, result exploration, configuration, progress, cost visibility, and local alerts.

## MCP Server (`@codeagora/mcp`)

Exposes the full CodeAgora pipeline as an MCP server compatible with Claude Code, Cursor, Windsurf, and VS Code.

**9 tools:** `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain`, `leaderboard`, `stats`, `config_get`, `config_set`

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["@codeagora/mcp"],
      "env": { "GROQ_API_KEY": "your_key_here" }
    }
  }
}
```

`review_quick` runs L1 only for fast feedback. `review_full` runs the complete L1 > L2 > L3 pipeline. `config_get`/`config_set` manage reviewer configuration without leaving the MCP session.

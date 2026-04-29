# Integrations

The current public distribution surface is:

```bash
npm i -g @codeagora/review  # CLI: agora/codeagora
npm i -g @codeagora/mcp     # MCP server: codeagora-mcp
```

Workspace packages such as `@codeagora/core`, `@codeagora/shared`, `@codeagora/github`, and `@codeagora/cli` are internal implementation packages. The `2.x` releases are the legacy package line.

## Web Dashboard

Local web dashboard — Hono.js REST API + React SPA.

**Features:**
- Review results with annotated diff viewer
- Real-time pipeline progress (WebSocket)
- Model intelligence (Thompson Sampling, leaderboard)
- Session history browser
- Cost analytics
- Discussion/debate viewer
- Config management UI

```bash
agora dashboard              # Default port 6274
agora dashboard --port 4000  # Custom port
agora dashboard --open       # Auto-open browser
```

Binds to `127.0.0.1` (loopback only). CORS restricted to localhost origins.

## Interactive TUI — Experimental

Terminal UI — review setup wizard, real-time pipeline progress, debate viewer, and results drill-down.

```bash
agora tui
```

## MCP Server (`@codeagora/mcp`)

Exposes the full CodeAgora pipeline as an MCP server compatible with Claude Code, Cursor, Windsurf, and VS Code.

Install:

```bash
npm i -g @codeagora/mcp
```

**9 tools:** `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, `get_leaderboard`, `get_stats`, `config_get`, `config_set`

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp"],
      "env": { "GROQ_API_KEY": "your_key_here" }
    }
  }
}
```

`review_quick` runs L1 only for fast feedback. `review_full` runs the complete L1 > L2 > L3 pipeline.

## Notifications

Send review results to Discord or Slack after each review.

Add to `.ca/config.json`:

```json
{
  "notifications": {
    "autoNotify": true,
    "discord": { "webhookUrl": "https://discord.com/api/webhooks/..." },
    "slack": { "webhookUrl": "https://hooks.slack.com/services/..." }
  }
}
```

Or send manually:

```bash
agora notify 2026-03-19/001
```

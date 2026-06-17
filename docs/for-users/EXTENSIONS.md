# Extensions

Optional packages installed separately from the core `codeagora` CLI.

```bash
npm i -g @codeagora/mcp         # MCP server (Claude Code, Cursor, etc.)
```

## Desktop App

The former web dashboard, terminal TUI, and webhook notification surfaces are no longer first-class extension packages.

The replacement surface is the official cross-platform Tauri desktop app for the human-facing local UI: review history, result exploration, configuration, progress, cost visibility, local alerts, and evidence export. See [DESKTOP.md](DESKTOP.md).

The v0.1.0 release includes a macOS arm64 unsigned preview DMG:
<https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0/CodeAgora_0.1.0_aarch64.dmg>.
It is not Developer ID signed, not notarized, and does not enable the Tauri
updater channel; macOS Gatekeeper warning is expected.

## MCP Server (`@codeagora/mcp`)

Exposes the full CodeAgora pipeline as an MCP server compatible with Claude Code, Cursor, Windsurf, and VS Code.

**9 tools:** `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, `get_leaderboard`, `get_stats`, `config_get`, `config_set`

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

Provider keys are only needed for live review tools. `dry_run`, `tools/list`, and config reads should start without API keys.

`review_quick` runs L1 only for fast feedback. `review_full` runs the complete L1 > L2 > L3 pipeline. `review_pr` reviews a GitHub PR by URL or number. `repo_path` is accepted by review tools plus `explain_session`, `get_stats`, `config_get`, and `config_set`; it lets the MCP server operate inside a specific checked-out repository while still rejecting paths outside the current repository boundary. Failures return MCP `isError: true` with JSON `{ "status": "error", "code": string, "message": string, "details"?: object, "guidance"?: string[] }`.

### Suggested natural-language mapping

Use this in the client prompt or command router when you want one phrase to map to one MCP tool:

| Phrase | MCP tool | Use when |
|---|---|---|
| `fast`, `quick`, `skim`, `fast-ass` | `review_quick` | You want the fastest useful read on staged changes or a pasted diff. |
| `full`, `standard`, `proper`, `deep` | `review_full` | You want the full debate and final verdict. |
| `pr`, `comment it`, `review this PR` | `review_pr` | You want inline GitHub comments on a real pull request. |
| `preflight`, `dry-run`, `check readiness` | `dry_run` | You want to see blockers and cost before spending provider calls. |

For a local assistant prompt, keep the mapping simple: `fast` → `review_quick`, `full` → `review_full`, `pr` → `review_pr`, and `preflight` → `dry_run`.

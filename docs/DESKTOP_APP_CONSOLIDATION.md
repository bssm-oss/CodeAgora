<!-- Parent: AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# Desktop App Consolidation Direction

## Summary

CodeAgora is consolidating three separate human-facing surfaces into one cross-platform desktop app:

- old web dashboard
- old Ink/React terminal TUI
- old Discord/Slack/generic webhook notifications package

The CLI remains. The GitHub Action remains. MCP remains. Those are agent/automation surfaces.

The desktop app becomes the primary surface for humans who want to inspect review history, configure providers, watch pipeline progress, review model/cost information, and receive local alerts.

```txt
Automation / agent surfaces:
  CLI
  GitHub Action
  MCP

Human local surface:
  Tauri desktop app
```

## Why Consolidate

The previous surface area was too wide:

```txt
CLI
GitHub Action
MCP
Web dashboard
TUI
Notifications
```

That made the product feel like multiple partial apps rather than one focused system. The web dashboard and TUI both tried to solve the same problem: giving a human a better way to view and operate CodeAgora locally. Notifications added yet another surface, but mostly duplicated what a good local app should own: alerts, status, and review completion visibility.

The new product split is cleaner:

- **CLI**: command surface for LLM agents, scripts, CI, and power users
- **GitHub Action**: PR automation surface
- **MCP**: AI IDE/agent integration surface
- **Desktop app**: human-facing local UI

## What Was Removed

These packages are no longer first-class packages:

```txt
packages/web
packages/tui
packages/notifications
```

These CLI commands are removed:

```txt
agora dashboard
agora tui
agora notify
agora review --notify
```

GitHub Action and MCP no longer send Discord/Slack webhook notifications.

## What the Desktop App Should Own

The Tauri app should absorb the valuable parts of the removed surfaces.

### From the Web Dashboard

- session history
- review detail page
- annotated diff viewer
- pipeline progress
- model leaderboard
- cost analytics
- configuration editor
- discussion/debate viewer
- compare sessions

### From the TUI

- quick local review flow
- staged/unstaged diff selection
- keyboard-friendly navigation
- compact result summary
- provider status
- reviewer/model selection

### From Notifications

- local desktop notifications
- review completion alerts
- failed review alerts
- optional sound/badge state
- later: OS notification center integration

The desktop app should not bring back Discord/Slack webhook delivery as a core feature. If external notifications return later, they should be a plugin/integration layer, not a dedicated package.

## Package Shape

Initial scaffold:

```txt
packages/desktop/
├── package.json
├── src/
│   ├── main.ts
│   ├── api/
│   │   └── desktop-bridge.ts
│   ├── index.html
│   └── styles.css
├── scripts/
│   └── copy-assets.mjs
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
└── README.md
```

The package is currently private while packaging and release mechanics settle.

The desktop app should call existing TypeScript/Node core logic through a thin bridge rather than reimplementing review behavior in Rust.

## Boundary Rules

The app must not become a second core.

Desktop may own:

- window state
- local UI state
- desktop notifications
- session browsing UI
- configuration forms
- local command invocation
- local file selection

Desktop must not own:

- reviewer orchestration
- verdict logic
- GitHub PR mapping
- provider registry
- config schema
- finding schema
- session storage format

Those stay in `@codeagora/core`, `@codeagora/shared`, `@codeagora/github`, and the CLI.

## Data Flow

Preferred first version:

```txt
Tauri UI
  -> Tauri command
  -> Node/CLI bridge
  -> CodeAgora core/CLI
  -> .ca/sessions
  -> Tauri UI reads session/result files
```

This is less elegant than a pure in-process library call, but it keeps the first desktop app simple and preserves CLI parity. The CLI is already the agent-facing API; the desktop app can use it as a stable local backend until a cleaner library boundary is needed.

Later version:

```txt
Tauri UI
  -> local backend bridge
  -> @codeagora/core library API
  -> session store
```

## Initial Desktop MVP

The first useful app does not need to recreate the entire web dashboard.

MVP:

1. show recent sessions — scaffolded
2. open a session detail — scaffolded
3. show verdict, severity counts, top findings — scaffolded
4. show markdown/report output — scaffolded
5. run review on current repo diff — CLI bridge scaffolded
6. edit basic provider/config settings — scaffolded
7. show local notification when review completes — scaffolded

Not MVP:

- full diff annotation UI
- model intelligence charts
- cost charting
- session comparison
- inline fixes
- cloud sync
- team accounts
- Discord/Slack webhooks

## Why Keep CLI

The CLI is not just for humans. It is the most useful interface for LLM agents.

Agents need:

- stable commands
- JSON output
- NDJSON progress
- stdin diff support
- staged diff support
- PR review support
- deterministic exit codes

The desktop app should not replace the CLI. It should sit beside it.

## Product Principle

CodeAgora should have one human local UI.

```txt
Before:
  web dashboard + TUI + notifications

After:
  desktop app
```

This keeps the product easier to explain:

> Use CodeAgora from the CLI, in CI, through MCP, or as a desktop app.

That is enough surface area. More than that starts to feel like product fog.

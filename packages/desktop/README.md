# CodeAgora Desktop

Initial Tauri desktop scaffold for the planned human-facing CodeAgora surface.

This package is intentionally private and not part of the stable support surface while the app shape stabilizes. It provides:

- recent session list
- session detail view
- top finding and severity summary display
- local review run control through a CLI bridge
- basic config view/edit surface
- desktop notification when a review completes or fails
- browser fallback data for scaffold development

The desktop app must stay an adapter. Review orchestration remains in `@codeagora/core` and the CLI.

## Production Boundary

The current Tauri bridge exposes an explicit command contract through `get_command_contract`.

| Command | Class | Project mutation | Process spawn | Boundary |
|---------|-------|------------------|---------------|----------|
| `open_repository` | read-only | no | yes, `git` only | Resolves a selected path to the nearest git root and makes it the active workspace for later commands. |
| `get_repo_info` | read-only | no | yes, `git` only | Detects git/config/session/review helper state for the current trusted workspace. |
| `list_sessions` | read-only | no | no | Reads canonical `.ca/sessions` artifacts without migration. |
| `get_session_detail` | read-only | no | no | Validates `date/session-id` before reading a session directory. |
| `run_review` | process-execution | yes, through CLI session writes | yes, `agora` or `pnpm exec agora` | Runs the existing CLI bridge; desktop does not reimplement review orchestration. |
| `start_review_run` | process-execution | yes, through CLI session writes | yes, `agora` or `pnpm exec agora` | Starts an async CLI review and stores progress events for polling. |
| `get_review_run` | read-only | no | no | Returns the latest progress snapshot for a desktop-started review. |
| `cancel_review_run` | process-control | no | no | Kills the spawned CLI child process and records a cancelled run state. |
| `read_config` | read-only | no | no | Reads `.ca/config.json`, `.ca/config.yml`, or `.ca/config.yaml` when present. |
| `write_config` | project-mutation | yes | no | Validates JSON and writes atomically to `.ca/config.json`; YAML config writes are read-only for now. |
| `validate_config` | read-only | no | no | Validates desktop config edits before writes. |
| `get_provider_status` | read-only | no | yes, `which` only | Detects API-key environment variables and local CLI backend binaries without exposing secret values. |
| `get_live_doctor_status` | read-only | yes | yes, `agora doctor --live --json` | Runs the actual API connectivity check for the active workspace and returns live provider health. |
| `get_mcp_status` | read-only | no | no | Reports the MCP server command, advertised tool names, and client config snippet. |
| `get_github_action_status` | read-only | no | no | Reads workflow files from the active workspace and detects CodeAgora Action setup signals. |
| `get_evidence_status` | read-only | no | no | Detects release evidence, live benchmark report, and evidence manifest files in the active workspace. |

Repository state is resolved from the active workspace selected through `open_repository`. Before a user selects a workspace, the app falls back to `CODEAGORA_DESKTOP_REPO` when set, otherwise the current process directory, walking up to the nearest git root. Review execution is blocked in the UI when no trusted git workspace is detected.

## Local Preview

```bash
pnpm --filter @codeagora/desktop preview
```

The browser fallback preview works without Tauri and uses sample data. It is useful for quick layout checks, but it does not exercise native commands, filesystem access, review launch, notifications, or bridge behavior.

## Tauri Shell

```bash
pnpm --filter @codeagora/desktop dev
pnpm --filter @codeagora/desktop tauri:check
pnpm --filter @codeagora/desktop tauri:build
pnpm --filter @codeagora/desktop smoke
pnpm --filter @codeagora/desktop app:e2e
pnpm --filter @codeagora/desktop macos:webdriver-e2e
pnpm --filter @codeagora/desktop visual:qa
pnpm --filter @codeagora/desktop live:review-smoke
pnpm --filter @codeagora/desktop bundle:smoke
pnpm --filter @codeagora/desktop evidence
```

The shell bridge calls the local `agora` CLI for sessions and reviews. Completed or failed review runs emit an OS desktop notification from the Tauri backend.

The setup screen also exposes a live provider check. Use it to verify whether actual model connectivity is available for the current workspace before you rely on live LLM review.

`dev` launches the real Tauri shell. Use `CODEAGORA_DESKTOP_REPO=/path/to/repo pnpm --filter @codeagora/desktop dev` to force the initial trusted workspace.

## Debug Automation

CodeAgora Desktop has two debug-only automation paths:

- Hypothesi Tauri MCP bridge for live development debugging:
  - installed for Codex as `@hypothesi/tauri-mcp-server`
  - app plugin: `tauri-plugin-mcp-bridge`
  - enabled only in debug builds through `#[cfg(debug_assertions)]`
  - requires `withGlobalTauri: true` and `mcp-bridge:default`
- macOS WebDriver automation for repeatable UI E2E:
  - CLI: `tauri-wd` from `cargo install tauri-webdriver-automation`
  - app plugin: `tauri-plugin-webdriver-automation`
  - enabled only when built with `--features webdriver-automation` and launched with `CODEAGORA_DESKTOP_WEBDRIVER=1`

Typical MCP debugging loop:

```bash
CODEAGORA_DESKTOP_REPO=/path/to/repo pnpm --filter @codeagora/desktop dev
pnpm --filter @codeagora/desktop debug:mcp
pnpm --filter @codeagora/desktop debug:mcp:snapshot
pnpm --filter @codeagora/desktop debug:mcp:logs
```

Hypothesi currently works well for structure DOM snapshots, console logs, backend state, window inspection, and direct JavaScript execution. Keep WebDriver E2E as the reliable click-through regression gate.

`macos:webdriver-e2e` builds a debug `.app` bundle with `tauri-webdriver-automation`, then drives that app bundle through `tauri-wd`. The test covers the first-run cockpit, review launch success, review launch failure recovery, config readiness, and setup overview.

`visual:qa` launches a debug Tauri app against a temporary Korean fixture workspace, connects through the Hypothesi MCP bridge, resizes the main window to the target size, captures cockpit and setup screenshots, and fails if primary cockpit controls, metrics, flow steps, decision badges, or session titles clip text or create horizontal page overflow. It writes `.sisyphus/evidence/desktop-visual-qa.json`, `.sisyphus/evidence/desktop-visual-qa-cockpit.png`, and `.sisyphus/evidence/desktop-visual-qa-setup.png`.

`live:review-smoke` builds the CLI, creates a temporary git workspace with the active `.ca` configuration, runs `agora review --staged --json-stream`, and fails unless the command emits a successful result event and writes a review session under `.ca/sessions`.

For RC handoff, run the root gate:

```bash
pnpm rc:desktop-gate
```

`app:e2e` creates a temporary git workspace and drives the Tauri backend through the same session, config, export, GitHub Action, and release-evidence surfaces used by the desktop app.

`macos:webdriver-e2e` is a debug-only macOS workaround for real desktop UI automation. It requires `tauri-wd` from `cargo install tauri-webdriver-automation`, launches the debug Tauri binary with `CODEAGORA_DESKTOP_WEBDRIVER=1`, and clicks through the app via the `tauri-plugin-webdriver-automation` bridge. The plugin is guarded by `debug_assertions` plus the explicit env flag and is not enabled for release bundles.

The generated desktop manifest is written to `.sisyphus/evidence/desktop-evidence-manifest.json`.

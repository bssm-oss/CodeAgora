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
| `get_mcp_status` | read-only | no | no | Reports the MCP server command, advertised tool names, and client config snippet. |
| `get_github_action_status` | read-only | no | no | Reads workflow files from the active workspace and detects CodeAgora Action setup signals. |
| `get_evidence_status` | read-only | no | no | Detects release evidence, live benchmark report, and evidence manifest files in the active workspace. |

Repository state is resolved from the active workspace selected through `open_repository`. Before a user selects a workspace, the app falls back to `CODEAGORA_DESKTOP_REPO` when set, otherwise the current process directory, walking up to the nearest git root. Review execution is blocked in the UI when no trusted git workspace is detected.

## Local Preview

```bash
pnpm --filter @codeagora/desktop build
pnpm --filter @codeagora/desktop dev
```

The preview works without Tauri and uses fallback sample data. Tauri commands are defined under `src-tauri/` for the real desktop shell.

## Tauri Shell

```bash
pnpm --filter @codeagora/desktop tauri:check
pnpm --filter @codeagora/desktop tauri:build
pnpm --filter @codeagora/desktop tauri:dev
pnpm --filter @codeagora/desktop smoke
pnpm --filter @codeagora/desktop bundle:smoke
pnpm --filter @codeagora/desktop evidence
```

The shell bridge calls the local `agora` CLI for sessions and reviews. Completed or failed review runs emit an OS desktop notification from the Tauri backend.

For RC handoff, run the root gate:

```bash
pnpm rc:desktop-gate
```

The generated desktop manifest is written to `.sisyphus/evidence/desktop-evidence-manifest.json`.

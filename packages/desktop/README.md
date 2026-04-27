# CodeAgora Desktop

Initial Tauri desktop scaffold for the human-facing CodeAgora surface.

This package is intentionally private while the app shape stabilizes. It provides:

- recent session list
- session detail view
- top finding and severity summary display
- local review run control through a CLI bridge
- basic config view/edit surface
- desktop notification when a review completes or fails
- browser fallback data for scaffold development

The desktop app must stay an adapter. Review orchestration remains in `@codeagora/core` and the CLI.

## Local Preview

```bash
pnpm --filter @codeagora/desktop build
pnpm --filter @codeagora/desktop dev
```

The preview works without Tauri and uses fallback sample data. Tauri commands are defined under `src-tauri/` for the real desktop shell.

## Tauri Shell

```bash
pnpm --filter @codeagora/desktop tauri:check
pnpm --filter @codeagora/desktop tauri:dev
```

The shell bridge calls the local `agora` CLI for sessions and reviews. Completed or failed review runs emit an OS desktop notification from the Tauri backend.

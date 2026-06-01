# packages/desktop/

## Responsibility
Cross-platform Tauri desktop shell for local, human-facing interaction with CodeAgora sessions, config, and review launch controls.

## Design
The package is a thin UI surface over CLI/core behavior. It keeps browser-preview fallbacks, Tauri IPC, and local state management separate from the review engine itself.

## Flow
UI state is hydrated from the bridge, which either invokes Tauri commands or falls back to local stub data. User actions then trigger session browsing, config edits, review launches, and notification updates.

## Integration
Consumes shared contracts and desktop bridge types, talks to CLI/session files through Tauri, and renders data shaped by shared session/config conventions.

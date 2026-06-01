# packages/desktop/src-tauri/src/

## Responsibility
Native Rust command implementation for the desktop application.

## Design
Thin command handlers should translate between Tauri IPC and local repo/session/config operations without recreating core review logic.

## Flow
Incoming commands are validated, routed to filesystem or CLI-adjacent helpers, then serialized back to the browser bridge.

## Integration
Acts as the native half of `packages/desktop`, bridging the UI to local `.ca` state and repository metadata.

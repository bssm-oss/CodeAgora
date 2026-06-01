# packages/desktop/src-tauri/

## Responsibility
Rust/Tauri backend for the desktop shell, providing the native command bridge and filesystem/process integration needed by the UI.

## Design
Keeps the native layer thin and command-oriented. The backend exists to expose local repo/session operations while deferring review logic to the existing CLI/core stack.

## Flow
Tauri commands receive UI requests, perform local file/process work, and return normalized data for the frontend bridge to consume.

## Integration
Connects the desktop app to CLI/session/config behavior and generated Tauri assets; it should stay aligned with the browser-side bridge contract.

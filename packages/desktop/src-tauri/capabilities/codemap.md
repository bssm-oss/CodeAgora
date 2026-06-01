# packages/desktop/src-tauri/capabilities/

## Responsibility

Defines Tauri capability permissions for the desktop app native shell. This directory controls which frontend windows can invoke native commands and access platform capabilities.

## Design

Capability files are declarative JSON policy documents rather than executable code. They keep desktop permissions explicit and reviewable beside the Rust backend.

## Flow

Tauri reads these files during desktop build/runtime setup, applies allowed commands and permissions to the configured windows, then blocks frontend calls outside the declared capability surface.

## Integration

- Consumed by `packages/desktop/src-tauri/tauri.conf.json` and the Tauri runtime.
- Governs frontend calls from `packages/desktop/src/api/desktop-bridge.ts` to Rust commands in `packages/desktop/src-tauri/src/main.rs`.
- Should stay minimal because desktop is a thin UI over CLI/core review logic.

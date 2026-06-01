# packages/desktop/src/api/

## Responsibility
Bridge layer between the desktop UI and Tauri/preview data sources.

## Design
Contains typed bridge contracts, IPC wrappers, JSON normalization helpers, and browser-preview fallback implementations. The API surface is intentionally narrow so the UI never touches platform-specific details directly.

## Flow
UI requests call exported bridge functions; those invoke Tauri when present, otherwise return fallback data. Raw CLI/Tauri payloads are normalized into stable session, config, status, and export shapes.

## Integration
Depends on Tauri IPC in production, but also supports browser preview via local storage and stub data. Feeds the main desktop UI and mirrors command/result types exposed by the backend bridge.

# packages/desktop/src/

## Responsibility
Browser-side app implementation for the desktop UI: state management, event handling, rendering, theming, and workflow coordination.

## Design
The code is organized around a single app state object and imperative render/update helpers. It relies on bridge calls for all I/O and keeps local preview behavior deterministic when Tauri is unavailable.

## Flow
Startup loads locale/theme/preferences, wires keyboard and theme listeners, then fetches sessions/config/status from the bridge. User events mutate state, re-render the view, and may kick off review polling or config writes.

## Integration
Uses shared i18n plus the desktop bridge API/types. It is the main consumer of the Tauri command surface and the browser fallback data model.

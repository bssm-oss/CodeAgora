<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-05 -->

# desktop/src/

## Purpose
Browser-side desktop app: state, rendering, keyboard/theme handling, setup panels, session/result views, and bridge calls.

## Where To Look
| Task | File | Notes |
|---|---|---|
| UI bootstrap/state | `main.ts` | Single app state plus imperative render/update helpers. |
| Bridge wrapper | `api/desktop-bridge.ts` | Tauri invoke wrapper. Keep contract aligned with Rust commands. |
| Bridge types | `api/desktop-bridge.types.ts` | Shared frontend shape for command payloads/results. |
| Browser fallback | `api/desktop-fallbacks.ts` | Dev/private-preview fallback data; do not treat as product truth. |
| Styling | `styles.css` | Keep desktop UI dense, operational, and private-preview framed. |

## Conventions
- All filesystem/process/review work goes through bridge calls; frontend does not read local repo state directly.
- Use shared i18n keys from `@codeagora/shared`; update `en.json` and `ko.json` together.
- Keep frontend state derived from canonical CLI/core/session/config contracts.
- Desktop copy must not imply public stable desktop support.

## Verification
- UI-only changes need targeted desktop smoke or typecheck where practical.
- Bridge-contract or setup/status behavior changes may require `pnpm rc:desktop-gate`.
- If fallback examples mention findings, keep them clearly illustrative and aligned with current contracts.

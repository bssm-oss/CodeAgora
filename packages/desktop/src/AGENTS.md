<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-14 -->

# desktop/src/

## Purpose
Browser-side desktop app: state, rendering, keyboard/theme handling, setup panels, session/result views, and bridge calls.

## Where To Look
| Task | File | Notes |
|---|---|---|
| UI bootstrap/state | `main.ts` | Single app state plus imperative render/update helpers. |
| Bridge wrapper | `api/desktop-bridge.ts` | Tauri invoke wrapper. Keep contract aligned with Rust commands. |
| Bridge types | `api/desktop-bridge.types.ts` | Shared frontend shape for command payloads/results. |
| Browser fallback | `api/desktop-fallbacks.ts` | Dev fallback data; do not treat as product truth. |
| Styling | `styles.css` | Keep desktop UI dense, operational, and product-grade. |

## Conventions
- All filesystem/process/review work goes through bridge calls; frontend does not read local repo state directly.
- Use shared i18n keys from `@codeagora/shared`; update `en.json` and `ko.json` together.
- Keep frontend state derived from canonical CLI/core/session/config contracts.
- Desktop copy should present the app as an official supported local UI while staying honest about platform/package limitations.
- Cockpit/setup/evidence views should surface provider readiness, MCP status, GitHub Action setup, degraded state, and release evidence through canonical contracts.
- Browser fallback data is illustrative only and must never be treated as product truth or release evidence.

## Verification
- UI-only changes need targeted desktop smoke or typecheck where practical.
- Bridge-contract or setup/status behavior changes may require `pnpm rc:desktop-gate`.
- If fallback examples mention findings, keep them clearly illustrative and aligned with current contracts.

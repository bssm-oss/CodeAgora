<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-06-05 -->

# desktop/ (@codeagora/desktop)

## Purpose
Cross-platform Tauri desktop app for CodeAgora's human-facing local UI. This is a private-preview surface, not stable public desktop support.

The desktop app owns session browsing, session detail display, local review launch controls, basic config editing, progress display, and local completion alerts. It must not reimplement review orchestration, verdict logic, provider registries, GitHub mapping, or session formats.

## Boundaries
- Use CLI/core as the review backend through a thin bridge.
- Read existing `.ca/sessions` and `.ca/config.json` semantics rather than inventing new storage.
- Keep desktop private preview until signing, notarization, updater, distribution, and support policy are explicitly revisited.
- Do not add web dashboard, terminal TUI, or external webhook delivery dependencies here.

## Key Files
| File | Description |
|------|-------------|
| `src/main.ts` | Browser/Tauri UI bootstrap |
| `src/api/desktop-bridge.ts` | Tauri invoke wrapper plus browser fallback |
| `src/api/desktop-fallbacks.ts` | Browser/dev fallback data used when Tauri is unavailable |
| `src/styles.css` | Desktop app styling |
| `src-tauri/src/main.rs` | Thin Tauri command bridge to CLI/session files |

## Verification
- Frontend-only changes still need package typecheck/smoke where practical.
- Any Tauri command, Rust, bridge-contract, packaging, or desktop evidence change requires `pnpm rc:desktop-gate` before release claims.
- Do not treat desktop evidence as stable CLI/GitHub/MCP evidence.

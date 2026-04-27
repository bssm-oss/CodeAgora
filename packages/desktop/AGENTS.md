<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-04-27 -->

# desktop/ (@codeagora/desktop)

## Purpose
Cross-platform Tauri desktop app scaffold for CodeAgora's human-facing local UI.

The desktop app owns session browsing, session detail display, local review launch controls, basic config editing, progress display, and local completion alerts. It must not reimplement review orchestration, verdict logic, provider registries, GitHub mapping, or session formats.

## Boundaries
- Use CLI/core as the review backend through a thin bridge.
- Read existing `.ca/sessions` and `.ca/config.json` semantics rather than inventing new storage.
- Keep desktop package private until packaging/release mechanics are ready.
- Do not add web dashboard, terminal TUI, or external webhook delivery dependencies here.

## Key Files
| File | Description |
|------|-------------|
| `src/main.ts` | Browser/Tauri UI bootstrap |
| `src/api/desktop-bridge.ts` | Tauri invoke wrapper plus browser fallback |
| `src/styles.css` | Desktop app styling |
| `src-tauri/src/main.rs` | Thin Tauri command bridge to CLI/session files |

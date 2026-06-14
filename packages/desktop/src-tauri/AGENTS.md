<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-05 | Updated: 2026-06-14 -->

# desktop/src-tauri/

## Purpose
Rust/Tauri backend for native filesystem, process, session/config, and desktop packaging integration.

## Where To Look
| Task | Location | Notes |
|---|---|---|
| Tauri commands | `src/main.rs` | Thin command bridge; do not reimplement review orchestration. |
| App manifest | `tauri.conf.json` | Product metadata, bundle config, and Tauri settings. |
| Permissions | `capabilities/default.json` | Keep command permissions explicit and minimal. |
| Generated schemas | `gen/schemas/` | Generated/reference data; do not hand-edit unless the generation source changes. |
| Rust package | `Cargo.toml` | Tauri/Rust dependencies and package metadata. |

## Conventions
- Spawn CLI/core behavior through the existing command boundary; desktop must not fork verdict/finding/session/config semantics.
- Spawn processes safely with explicit args, timeouts, cancellation, and redacted stdout/stderr handling.
- Normalize errors for the frontend; do not surface raw stack traces or secrets.
- Keep path access bounded to selected/trusted repositories and known session/config locations.
- Treat `target/` as build output, not source.
- WebDriver/debug automation must remain debug-only and covered by desktop gate evidence.

## Verification
- Rust, command, capability, or package changes require `pnpm rc:desktop-gate`.
- At minimum run the desktop package smoke/checks named in `packages/desktop/package.json` before release claims.
- Manual desktop smoke should launch the app, open a trusted repo, inspect setup/session evidence, and confirm redaction.

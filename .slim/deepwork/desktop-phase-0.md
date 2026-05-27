# Desktop App — Phase 0 Progress

**Status:** ✅ Complete

## Completed Tasks

### 0.1 ✅ `src-tauri/capabilities/default.json`
- Created `src-tauri/capabilities/` directory
- Includes `core:default`, `notification:default`, and `$schema` reference
- App commands (17 via `generate_handler![]`) are implicitly allowed per Tauri v2 docs
- Rust compilation passes

### 0.2 ✅ `@tauri-apps/api` dependency
- Added `@tauri-apps/api@^2.11.0` matching CLI version

### 0.3 ✅ Bridge migration
- **New:** `desktop-bridge.types.ts` — all type definitions
- **New:** `desktop-fallbacks.ts` — all fallback/mock data (extracted from bridge)
- **Rewritten:** `desktop-bridge.ts` — uses official `@tauri-apps/api/core` `invoke()`
  - Single `tauriCall<T>()` wrapper eliminates 17× branch duplication
  - Removed `window.__TAURI__` undocumented API dependency
  - Each function: try Tauri → fallback
  - Error boundary around invoke()

### Files changed
- `packages/desktop/package.json` (+1 dep: `@tauri-apps/api@^2.11.0`)
- `packages/desktop/src-tauri/capabilities/default.json` (NEW)
- `packages/desktop/src/api/desktop-bridge.types.ts` (NEW)
- `packages/desktop/src/api/desktop-fallbacks.ts` (NEW)
- `packages/desktop/src/api/desktop-bridge.ts` (REWRITTEN, from 600→230 lines)

### Verification
- ✅ `pnpm typecheck` — tsc passes
- ✅ `pnpm build` — tsup bundles successfully
- ✅ `pnpm smoke` — post-build smoke test passes
- ✅ `pnpm tauri:check` — Rust compilation passes

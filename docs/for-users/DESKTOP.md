# Desktop App

The Tauri desktop app is CodeAgora's official human-facing local UI. It stays
aligned with the same CLI/core/MCP session, config, provider, and review
contracts used by the automation surfaces.

## Release Decision

| Area | Release decision |
|------|--------------------------|
| Channel | Official desktop app |
| Public desktop launch | Included in release readiness |
| Signing | v0.1.0 stable ships as an unsigned preview DMG |
| Notarization | v0.1.0 stable is not notarized; macOS Gatekeeper warning is expected |
| Updater | Disabled for the v0.1.0 unsigned preview DMG; RC updater JSON remains scoped to `desktop-X.Y-rc/latest-X.Y-rc.json` |
| Canonical review engine | Existing CLI/core path |
| Canonical sessions | Existing `.ca/sessions` artifacts |
| Canonical config | Existing `.ca/config.*` schema and files |

## RC Gates

Run the desktop gate before cutting an RC:

```bash
pnpm rc:desktop-gate
```

Official macOS arm64 Desktop distribution also requires:

```bash
pnpm rc:desktop-distribution-gate
```

The distribution gate is RC-only. It requires `X.Y.Z-rc.N` versions, the `rc`
npm dist-tag, a `vX.Y.Z-rc.N` prerelease, signed/notarized/stapled macOS arm64
DMG evidence, updater app artifact evidence, updater `.sig` evidence, and a same-line `latest-X.Y-rc.json`
manifest. The installed app reads the line-scoped `desktop-X.Y-rc` updater
release for its version line; the JSON points at the versioned `vX.Y.Z-rc.N`
prerelease assets.
Stable Desktop distribution, stable updater channels, and npm
`latest` promotion are out of scope for this RC gate.

## v0.1.0 Stable Desktop DMG

The v0.1.0 stable release may attach a macOS arm64 Desktop DMG as an unsigned
preview artifact. That DMG is not Developer ID signed, not notarized, and does
not enable a Tauri updater channel. macOS Gatekeeper warnings are expected.

Stable Desktop release evidence must be explicit about that policy:

```bash
node packages/desktop/scripts/capture-unsigned-dmg-evidence.mjs
pnpm desktop:unsigned-dmg-gate
```

The required evidence files are:

```txt
.sisyphus/evidence/desktop-unsigned-dmg-evidence.json
.sisyphus/evidence/desktop-unsigned-dmg-gate.log
```

Do not describe the v0.1.0 Desktop DMG as signed, notarized, stapled, or
auto-updatable unless a later release reintroduces those gates with fresh
evidence.

This runs:

- `pnpm --filter @codeagora/desktop typecheck`
- `pnpm --filter @codeagora/desktop smoke`
- `pnpm --filter @codeagora/desktop tauri:check`
- `pnpm --filter @codeagora/desktop app:e2e`
- `pnpm --filter @codeagora/desktop macos:webdriver-e2e`
- `pnpm --filter @codeagora/desktop visual:qa`
- `pnpm --filter @codeagora/desktop evidence`
- `pnpm --filter @codeagora/desktop bundle:smoke`

The desktop evidence manifest is written to:

```txt
.sisyphus/evidence/desktop-evidence-manifest.json
```

Visual QA writes `desktop-visual-qa.json` plus cockpit and setup screenshots in
the same evidence directory.

Release readiness requires fresh desktop evidence for the candidate commit.

## Automated Smoke Coverage

The desktop smoke checks:

- built `dist/index.html` and `dist/main.js`
- package/Tauri version alignment
- updater configuration and updater artifact generation
- Tauri product metadata
- command bridge coverage for repository, sessions, review progress, config,
  providers, MCP, GitHub Action setup, release evidence, export, and command
  contract reporting
- generated Tauri bundle artifacts, including the macOS `.app` executable when
  running on macOS

## Manual Smoke Before RC

Before RC handoff, manually verify:

- the Tauri shell launches on the target platform
- a trusted git repository opens and shows branch/head/dirty/config/session state
- review progress and cancel controls work on a provider-safe path
- session detail renders findings and exports Markdown, JSON, and SARIF
- config validation blocks invalid writes
- provider status redacts secrets
- MCP and GitHub Action setup panels show current config signals
- release evidence panel detects release evidence, benchmark report, and desktop
  evidence manifest

## Boundaries

Desktop must not:

- reimplement review orchestration
- create desktop-only verdict, finding, session, or config semantics
- claim signing, notarization, updater, or platform distribution behavior that
  has not been captured in release evidence
- expose provider keys, tokens, Authorization headers, or secret values in UI
  logs, exports, or evidence

# Desktop App

The Tauri desktop app is CodeAgora's official human-facing local UI. It stays
aligned with the same CLI/core/MCP session, config, provider, and review
contracts used by the automation surfaces.

## Release Decision

| Area | Release decision |
|------|--------------------------|
| Channel | Official desktop app |
| Public desktop launch | Included in release readiness |
| Signing | Release evidence must state current signing status |
| Notarization | Release evidence must state current notarization status |
| Updater | Disabled unless explicitly enabled in release evidence |
| Canonical review engine | Existing CLI/core path |
| Canonical sessions | Existing `.ca/sessions` artifacts |
| Canonical config | Existing `.ca/config.*` schema and files |

## RC Gates

Run the desktop gate before cutting an RC:

```bash
pnpm rc:desktop-gate
```

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

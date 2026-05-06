# Desktop Private Preview

The Tauri desktop app is a private-preview surface for the next RC cycle. It is
not a stable public support claim and must stay aligned with CLI/core/MCP
contracts.

## Release Decision

| Area | Private-preview decision |
|------|--------------------------|
| Channel | Private preview only |
| Public desktop launch | Deferred |
| Signing | Deferred until public desktop launch |
| Notarization | Deferred until public desktop launch |
| Updater | Disabled for private preview |
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
- `pnpm --filter @codeagora/desktop evidence`
- `pnpm --filter @codeagora/desktop bundle:smoke`

The desktop evidence manifest is written to:

```txt
.sisyphus/evidence/desktop-evidence-manifest.json
```

The post-merge RC gate passed on 2026-05-06 at `origin/main` `1075f81`.

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

- the Tauri shell launches on the preview platform
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
- claim stable/public desktop support before signing/notarization/updater and
  public distribution decisions are revisited
- expose provider keys, tokens, Authorization headers, or secret values in UI
  logs, exports, or evidence

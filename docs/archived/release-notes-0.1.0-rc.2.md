# CodeAgora 0.1.0-rc.2 Release Notes Draft

## Positioning

This is a release-candidate update for the supported CLI, GitHub Action, and MCP package line, plus a private-preview desktop app iteration. The desktop app remains a private preview and is not a stable public support surface yet.

## Highlights

- Desktop private preview now opens on a Review Cockpit surface focused on local review readiness, recent verdicts, blockers, and evidence access.
- Desktop review launch, config editing, setup status, and session detail views have been refreshed around the cockpit/evidence-board workflow.
- Desktop UI now uses the existing shared CodeAgora i18n catalog and supports Korean copy when `config.language` is set to `ko`.
- Desktop locale resolution prioritizes `config.language`, then browser/system locale, then English fallback.
- Stable desktop `data-testid` selectors are preserved for bridge and automation compatibility while UI labels are translated.

## Desktop Private Preview Notes

- The desktop app is still an adapter over the existing CLI/core/session/config surfaces.
- Review orchestration, verdict logic, provider registries, GitHub mapping, and session formats remain owned by the CLI/core packages.
- Do not describe this as stable desktop support in public docs or release copy.
- The desktop package remains private while packaging, QA, and product shape continue to stabilize.

## Verification Evidence

- `pnpm rc:desktop-gate` passed locally on macOS.
- Gate coverage included desktop typecheck, smoke, Tauri check, Rust app e2e, macOS WebDriver e2e, evidence manifest generation, and bundle smoke.
- macOS WebDriver e2e now uses a Korean desktop config fixture and verifies the initial cockpit renders Korean copy before visiting the config page.

## Known Scope Boundaries

- Desktop preview does not replace the CLI, GitHub Action, or MCP surfaces.
- Desktop preview should not be marketed as cross-platform stable support yet.
- Korean desktop copy is covered through shared i18n, but canonical documentation remains English unless separately translated.

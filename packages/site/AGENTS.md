<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-16 -->

# packages/site

## Purpose
Astro static marketing landing page for CodeAgora. This package presents the product, installation paths, and supported surfaces without introducing a separate runtime dashboard or review semantics. The shipped output remains static HTML/CSS/JS.

## For AI Agents

- Keep this package static and dependency-light. Astro is used only to author and build the landing page.
- Reuse root brand assets from `assets/`; do not fork the logo.
- Do not claim stable desktop distribution or stable updater support unless release evidence has been updated.
- Keep product claims aligned with CLI, GitHub Action, MCP, and Desktop surfaces.
- Build with `pnpm --filter @codeagora/site build`.
- Run local preview with `pnpm --filter @codeagora/site dev`.

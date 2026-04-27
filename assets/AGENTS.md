<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# assets

## Purpose
Static assets including logos, icons, and visual brand materials used in documentation, the desktop app, and public-facing channels.

## Key Files

| File | Description |
|------|-------------|
| `logo.svg` | CodeAgora brand logo (SVG, 250x250) — dark navy blue (#191A51) geometric design; use in README, desktop surfaces, and releases |

## For AI Agents

### Working In This Directory

- **Asset format**: SVG (scalable, version-controllable); no raster images required
- **Logo usage**: Include in documentation, desktop app surfaces, and GitHub profile links with appropriate attribution
- **Adding assets**: Keep files organized and minimal; add new assets only when needed for UI/marketing
- **SVG handling**: Assets are inline-capable; reference via `<img>` tags or CSS backgrounds
- **Size guidelines**: Logo is 250x250; maintain aspect ratio and readability at smaller sizes

### When Referencing Assets

- In docs: use `![CodeAgora](../../assets/logo.svg)` for relative paths from docs/
- In desktop UI: import SVG assets through the package build process (no manual CDN links)
- In README: use `![](assets/logo.svg)` from repo root

<!-- MANUAL: -->

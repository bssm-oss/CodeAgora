# packages/site

## Responsibility
Dependency-free static landing page for CodeAgora's public product story.

## Entry Points

| File | Purpose |
|---|---|
| `index.html` | Single-page landing page markup and content. |
| `src/styles.css` | Responsive visual system and layout. |
| `src/main.js` | Small progressive-enhancement layer for tabs and command copy buttons. |
| `scripts/build.mjs` | Copies static files into `dist/` and reuses the root logo asset. |
| `scripts/dev-server.mjs` | Local static preview server. |
| `scripts/smoke.mjs` | Deterministic package smoke checks. |

## Design
The page uses a product-state hero and compact operational sections rather than a dashboard app. It intentionally does not define configs, session formats, verdict semantics, or provider behavior.


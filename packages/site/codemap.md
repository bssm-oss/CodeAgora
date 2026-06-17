# packages/site

## Responsibility
Astro-authored static landing page for CodeAgora's public product story.

## Entry Points

| File | Purpose |
|---|---|
| `src/pages/index.astro` | Single-page landing markup, content, metadata, and structured data. |
| `src/styles/site.css` | Responsive visual system and layout. |
| `src/scripts/site.js` | Small progressive-enhancement layer for tabs, theme, progress, and copy buttons. |
| `astro.config.mjs` | Astro static build configuration. |
| `scripts/prepare-assets.mjs` | Copies shared logo, social card, robots, and sitemap into Astro `public/`. |
| `scripts/build.mjs` | Prepares public assets and runs `astro build`. |
| `scripts/dev-server.mjs` | Prepares public assets and runs `astro dev`. |
| `scripts/smoke.mjs` | Deterministic package smoke checks. |

## Design
The page uses a product-state hero and compact operational sections rather than a dashboard app. Astro is limited to static site generation. It intentionally does not define configs, session formats, verdict semantics, or provider behavior.

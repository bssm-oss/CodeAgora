<!-- Parent: ../README.md -->

# CodeAgora v0.1.2 Stable Readiness

Audit date: 2026-06-18
Audit checkout: `/Users/justn/Workspaces/repos/bssm-oss/main/justn-hyeok/CodeAgora`
Audited SHA: `87a8febb4d87d378c77a28a91b3cdf23bae0fea9`
Stable version: `0.1.2`
Git tag: `v0.1.2`
npm dist-tag: `latest`
GitHub Release: non-prerelease

## Final Verdict

Status: `PASS`

CodeAgora v0.1.2 is published as the current stable `0.1.x` patch release for
CLI, GitHub Action, MCP, Desktop, and the production landing page. There are no
remaining public-release blockers for v0.1.2.

This document is the current stable readiness snapshot. Older archived evidence
remains historical context unless it names the SHA, date, command path, and
artifact or log link used for a current gate.

## Current Public State

| Check | Status | Evidence |
|---|---:|---|
| npm `@codeagora/review` `latest` dist-tag | `PASS` | `npm view @codeagora/review version` and `npm dist-tag ls @codeagora/review` on 2026-06-18 returned `0.1.2` and `latest: 0.1.2`. |
| npm `@codeagora/mcp` `latest` dist-tag | `PASS` | `npm view @codeagora/mcp version` and `npm dist-tag ls @codeagora/mcp` on 2026-06-18 returned `0.1.2` and `latest: 0.1.2`. |
| GitHub stable release | `PASS` | `gh release view v0.1.2 --json tagName,isDraft,isPrerelease,publishedAt,assets,url` returned `isDraft: false`, `isPrerelease: false`, and published asset set including `CodeAgora_0.1.2_aarch64.dmg`. |
| GitHub Actions release workflow | `PASS` | Release run `27695312660` completed successfully on 2026-06-17 for SHA `87a8febb4d87d378c77a28a91b3cdf23bae0fea9`. |
| GitHub Actions CI workflow | `PASS` | CI run `27695310933` completed successfully on 2026-06-17 for SHA `87a8febb4d87d378c77a28a91b3cdf23bae0fea9`. |
| GitHub Actions bundle workflow | `PASS` | Build Action Bundle run `27695310922` completed successfully on 2026-06-17 for SHA `87a8febb4d87d378c77a28a91b3cdf23bae0fea9`. |
| Vercel production root | `PASS` | `https://codeagora.vercel.app/` and `https://codeagora.justn.me/` returned 200 with `codeagora:commit` set to `87a8febb4d87d378c77a28a91b3cdf23bae0fea9` and structured data `softwareVersion: "0.1.2"`. |
| Vercel social preview image | `PASS` | Production HTML points Open Graph and Twitter metadata at `/assets/social-card.png` with `og:image:type` set to `image/png`; the PNG asset returns 200 with `content-type: image/png`. |

## Required Gates

| Surface | Gate | Status | Evidence |
|---|---|---:|---|
| All | Deterministic release gates | `PASS` | Release run `27695312660` passed typecheck, lint, build, full test, cross-surface parity, security regression, deterministic benchmark, beta smoke, root package dry-run, and MCP package dry-run. |
| CLI | Published package | `PASS` | `@codeagora/review@0.1.2` is published on npm `latest`; release smoke installed the packed tarball and exercised CLI help, providers, init, and dry-run review paths before publish. |
| MCP | Published package | `PASS` | `@codeagora/mcp@0.1.2` is published on npm `latest`; release smoke installed the packed tarball and exercised MCP initialize, `tools/list`, `config_get`, `dry_run`, and auto `review_quick` paths before publish. |
| GitHub Action | Stable action reference | `PASS` | Docs, templates, and CLI init output pin `bssm-oss/CodeAgora@v0.1.2`; release workflow and CI completed successfully for the tag SHA. |
| Desktop | Unsigned preview DMG | `PASS` | GitHub Release `v0.1.2` includes `CodeAgora_0.1.2_aarch64.dmg`, `desktop-unsigned-dmg-evidence.json`, and `desktop-unsigned-dmg-gate.log`; release run passed the unsigned DMG gate. |
| Vercel production | Stable landing deployment | `PASS` | Production aliases serve the v0.1.2 commit metadata and PNG social preview metadata. |

## Stable Manifest Contract

Stable patch releases must not claim Desktop signing, notarization, stapling, or
Tauri updater support unless those gates are reintroduced with fresh evidence.

For v0.1.2:

- Stable tags publish npm `latest` for `@codeagora/review` and `@codeagora/mcp`.
- Stable tags create a non-prerelease GitHub Release.
- Stable tags build a macOS arm64 unsigned Desktop preview DMG with updater
  artifacts disabled.
- Stable tags attach unsigned DMG evidence and release evidence artifacts.
- The release body and user docs must state that the Desktop DMG is unsigned,
  not notarized, has no stable Tauri updater channel, and may trigger macOS
  Gatekeeper warnings.

## Vercel Production Contract

The site build stamps production-check metadata into the generated HTML:

- `<meta name="codeagora:commit" content="...">`
- `data-codeagora-site="astro"`
- `data-codeagora-commit="..."`
- structured data `softwareVersion`

Production readiness requires:

- production root returns 200;
- production HTML contains the expected stable commit SHA;
- production HTML contains current Astro landing markers;
- `/robots.txt` and `/sitemap.xml` resolve with canonical URLs;
- `/assets/codeagora-icon.png`, `/assets/codeagora-wordmark.png`, and
  `/assets/social-card.png` resolve;
- social preview metadata uses PNG, not SVG, for broad crawler compatibility.

## Stop Rule

Allowed readiness states are `PASS`, `BLOCKER`, and `NEEDS-REPRO`.

Any `BLOCKER` or `NEEDS-REPRO` stops a future stable patch release. Do not create
the tag, publish npm `latest`, or mark a GitHub Release as stable until every
current release-surface row is `PASS` with command, run, artifact, or deployment
evidence.

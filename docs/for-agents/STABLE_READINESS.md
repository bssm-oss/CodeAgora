<!-- Parent: ../README.md -->

# CodeAgora v0.1.0 Stable Readiness

Audit date: 2026-06-17  
Audit worktree: `/Users/justn/Workspaces/worktrees/CodeAgora-stable-readiness`  
Audit branch: `work/stable-readiness`  
Audit base SHA: `1ebd18f847c77d893b588436343e736f5274a2d9`  
Target stable version: `0.1.0`  
Target git tag: `v0.1.0`  
Target npm dist-tag: `latest`  
Target GitHub Release: non-prerelease

## Final Verdict

Status: `BLOCKER`

CodeAgora code and release gates are ready for `v0.1.0` stable promotion under the unsigned Desktop preview DMG policy. Public promotion remains blocked until the release workflow publishes npm `latest` and creates the non-prerelease GitHub Release from the accepted stable SHA. `WAIVED`, known-issue acceptance, and hidden post-stable claims are not valid stable readiness states.

Existing archived evidence can support this audit only when it names the SHA, date, exact command path, and artifact or log link. Otherwise it is historical context, not stable release evidence.

## Current Public State

| Check | Status | Evidence |
|---|---:|---|
| npm `@codeagora/review` `latest` dist-tag | `BLOCKER` | `npm view @codeagora/review dist-tags version --json` on 2026-06-17 returned `latest: 0.1.0-alpha.1`, `rc: 0.1.0-rc.5`, and package `version: 0.1.0-alpha.1`. |
| GitHub latest non-prerelease | `BLOCKER` | `gh release view --repo bssm-oss/CodeAgora --json tagName,isPrerelease,publishedAt,name` on 2026-06-17 returned `v0.1.0-alpha.1`, not `v0.1.0`. |
| Newest GitHub prerelease | `BLOCKER` | `gh release list --repo bssm-oss/CodeAgora --limit 10 --json tagName,isPrerelease,isLatest,publishedAt,name` on 2026-06-17 shows newest release entry `v0.1.0-rc.5`, prerelease. |
| Vercel production root | `PASS` | `pnpm evidence:vercel-production` on 2026-06-17 wrote `.sisyphus/evidence/vercel-production-evidence.json` after production deploy and verified `codeagora:commit`, `data-codeagora-site="astro"`, and the expected commit marker. |
| Vercel production crawler files | `PASS` | `pnpm evidence:vercel-production` verified `robots.txt` and `sitemap.xml` resolve with canonical production URLs. |
| Vercel production brand assets | `PASS` | `pnpm evidence:vercel-production` verified `/assets/codeagora-icon.png`, `/assets/codeagora-wordmark.png`, and `/assets/social-card.svg` resolve. |

## Required Gates

| Surface | Gate | Status | Required command or artifact | Stable evidence path |
|---|---|---:|---|---|
| All | Deterministic local gates | `PASS` | `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test --no-file-parallelism`, `pnpm test:security`, `pnpm bench:ci`, `pnpm release:beta-smoke` | `.sisyphus/evidence/*.log` and `.sisyphus/evidence/gate-command-evidence.jsonl` |
| All | Stable manifest | `PASS` | `pnpm evidence:manifest -- --require=stable` | `.sisyphus/evidence/evidence-manifest.json` |
| CLI | Packed stable package install | `PASS` | Installed packed `@codeagora/review@0.1.0` in a temp project and ran `agora --version`, help, providers, init, and dry-run review. | `.sisyphus/evidence/cli-packed-install-smoke.json` |
| CLI | Real-user review smokes | `PASS` | Clean diff, staged diff, patch file, invalid config, missing key, provider failure, timeout runtime. | `.sisyphus/evidence/cli-live-*.json` and sidecar transcripts |
| MCP | Packed SDK tool call | `PASS` | Installed packed `@codeagora/mcp@0.1.0` and called `tools/list` plus `dry_run` through the MCP SDK client. | `.sisyphus/evidence/mcp-packed-sdk-tool-call-smoke.json` |
| MCP | Invalid input and inaccessible path | `PASS` | Ran invalid input and inaccessible repo path through the packed MCP SDK path. | `.sisyphus/evidence/mcp-packed-invalid-input-smoke.json` |
| GitHub Actions | Same-repo PR success | `PASS` | Real same-repository `pull_request` workflow success with review output from PR #585, run `27668645582`, job `81827873765`, verdict `ACCEPT`, review URL `https://github.com/bssm-oss/CodeAgora/pull/585#pullrequestreview-4512752016`. | `.sisyphus/evidence/github-action-same-repo-pr-success.json` |
| GitHub Actions | Failure and degraded paths | `PASS` | `pnpm evidence:github-action-stable` replayed fork PR, missing provider secrets, stale head, oversized diff, provider failure, and comment posting failure through focused Action runtime/reporting/smoke tests. | `.sisyphus/evidence/github-action-*-degraded.json` |
| Desktop | Unsigned preview DMG | `PASS` | macOS arm64 unsigned DMG build with explicit `signed: false`, `notarized: false`, `updaterEnabled: false`, and expected Gatekeeper warning policy | `.sisyphus/evidence/desktop-unsigned-dmg-evidence.json` and `.sisyphus/evidence/desktop-unsigned-dmg-gate.log` |
| Vercel production | Stable landing deployment | `PASS` | `pnpm evidence:vercel-production` after production deploy from stable SHA | `.sisyphus/evidence/vercel-production-evidence.json` |

## Stable Manifest Contract

`pnpm evidence:manifest -- --require=stable` must fail closed unless all required stable entries exist and report `evidenceMode: "real"`.

The stable manifest now requires:

- CLI packed install and live review evidence.
- MCP packed SDK tool-call evidence.
- GitHub Actions same-repo success plus fork, missing secrets, stale head, oversized diff, provider failure, and posting failure paths.
- Desktop unsigned preview DMG evidence and validator gate log. Developer ID signing, notarization, and Tauri updater signing are intentionally deferred for v0.1.0 and must not be claimed by the stable release.
- Vercel production evidence proving the production HTML contains the expected stable commit metadata and current Astro landing markers.

Current stable manifest result after recording unsigned Desktop DMG evidence:

```text
pnpm evidence:manifest -- --require=stable
Wrote .sisyphus/evidence/evidence-manifest.json
```

The release workflow keeps the signed/notarized/updater Desktop path RC-only. Stable tags build an unsigned macOS arm64 DMG with updater artifacts disabled, run `capture-unsigned-dmg-evidence.mjs`, and validate it with `pnpm desktop:unsigned-dmg-gate`. The GitHub Release body must state that the Desktop DMG is unsigned, not notarized, has no Tauri updater channel, and may trigger macOS Gatekeeper warnings.

## Vercel Production Contract

The site build stamps production-check metadata into the generated HTML:

- `<meta name="codeagora:commit" content="...">`
- `data-codeagora-site="astro"`
- `data-codeagora-commit="..."`

`pnpm evidence:vercel-production` validates:

- production root returns 200;
- production HTML contains Astro landing markers and the expected commit SHA;
- `/robots.txt` and `/sitemap.xml` resolve with canonical URLs;
- `/assets/codeagora-icon.png`, `/assets/codeagora-wordmark.png`, and `/assets/social-card.svg` resolve.

## Stop Rule

Any `BLOCKER` or `NEEDS-REPRO` stops stable promotion. Do not create `v0.1.0`, publish npm `latest`, or mark a GitHub Release as stable until every row in this document is `PASS` with linked logs or artifacts.

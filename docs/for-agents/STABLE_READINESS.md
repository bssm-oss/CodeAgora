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

CodeAgora is not ready to promote `v0.1.0` stable. Stable promotion remains blocked until every gate below is `PASS`. `WAIVED`, known-issue acceptance, and post-stable deferral are not valid stable readiness states.

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
| All | Stable manifest | `BLOCKER` | `pnpm evidence:manifest -- --require=stable` | Fails closed until GitHub Actions, Desktop distribution, and release-publication evidence exists. |
| CLI | Packed stable package install | `PASS` | Installed packed `@codeagora/review@0.1.0` in a temp project and ran `agora --version`, help, providers, init, and dry-run review. | `.sisyphus/evidence/cli-packed-install-smoke.json` |
| CLI | Real-user review smokes | `PASS` | Clean diff, staged diff, patch file, invalid config, missing key, provider failure, timeout runtime. | `.sisyphus/evidence/cli-live-*.json` and sidecar transcripts |
| MCP | Packed SDK tool call | `PASS` | Installed packed `@codeagora/mcp@0.1.0` and called `tools/list` plus `dry_run` through the MCP SDK client. | `.sisyphus/evidence/mcp-packed-sdk-tool-call-smoke.json` |
| MCP | Invalid input and inaccessible path | `PASS` | Ran invalid input and inaccessible repo path through the packed MCP SDK path. | `.sisyphus/evidence/mcp-packed-invalid-input-smoke.json` |
| GitHub Actions | Same-repo PR success | `BLOCKER` | Real same-repository `pull_request` workflow success with review output | `.sisyphus/evidence/github-action-same-repo-pr-success.json` |
| GitHub Actions | Failure and degraded paths | `BLOCKER` | Fork PR, missing provider secrets, stale head, oversized diff, provider failure, comment posting failure | `.sisyphus/evidence/github-action-*-degraded.json` |
| Desktop | Stable distribution | `BLOCKER` | macOS arm64 Developer ID signing, notarization, stapling, stable updater manifest, updater artifact signature | `.sisyphus/evidence/desktop-stable-distribution-evidence.json` |
| Desktop | Packaged app QA | `BLOCKER` | Packaged app launch, review flow, visual QA against signed/notarized stable artifact | `.sisyphus/evidence/desktop-stable-*.json` |
| Vercel production | Stable landing deployment | `PASS` | `pnpm evidence:vercel-production` after production deploy from stable SHA | `.sisyphus/evidence/vercel-production-evidence.json` |

## Stable Manifest Contract

`pnpm evidence:manifest -- --require=stable` must fail closed unless all required stable entries exist and report `evidenceMode: "real"`.

The stable manifest now requires:

- CLI packed install and live review evidence.
- MCP packed SDK tool-call evidence.
- GitHub Actions same-repo success plus fork, missing secrets, stale head, oversized diff, provider failure, and posting failure paths.
- Desktop stable distribution, launch, review flow, and visual QA evidence.
- Vercel production evidence proving the production HTML contains the expected stable commit metadata and current Astro landing markers.

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

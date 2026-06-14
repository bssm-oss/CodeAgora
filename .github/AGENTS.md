<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# .github

## Purpose
GitHub Actions workflows, issue templates, and PR configuration. Automates CI/CD, code review posting, PR size labeling, and release builds.

## Key Files / Subdirectories

| File | Purpose |
|------|---------|
| `workflows/ci.yml` | Lint, typecheck, and test on push/PR to main (Node 20, 22) |
| `workflows/release.yml` | Build and publish npm packages on version tag (v*) |
| `workflows/review.yml` | Run CodeAgora review on PRs; requires `OPENROUTER_API_KEY`, skips forks and `review:skip` PRs, posts findings through the local composite Action |
| `workflows/pr-size.yml` | Auto-label PRs by diff size (XS, S, M, L, XL) |
| `workflows/build-action.yml` | Rebuild `dist/action.js` bundle on push to main (auto-commits via `[skip ci]`) |
| `workflows/provider-health.yml` | Scheduled provider health checks across registered API providers |
| `PULL_REQUEST_TEMPLATE.md` | Template for PR description (Summary, Changes, Test Plan, Related Issues) |
| `ISSUE_TEMPLATE/config.yml` | Issue creation settings; blank issues disabled, links to docs |
| `ISSUE_TEMPLATE/bug_report.md` | Bug report form template |
| `ISSUE_TEMPLATE/feature_request.md` | Feature request form template |
| `ISSUE_TEMPLATE/question.md` | Question/discussion form template |

## For AI Agents

### Working In This Directory

- **Workflow syntax**: GitHub Actions YAML (see https://docs.github.com/en/actions)
- **Modify workflows**: Update `.yml` files in `workflows/` directory
- **Node version matrix**: CI tests against Node 20 and 22; update `matrix.node-version` if adding new versions
- **pnpm version**: Currently pinned to `version: 10` in workflow steps; update when upgrading
- **Review workflow**: Checks for `review:skip` label to skip CodeAgora review; respects PR size threshold
- **OpenRouter secret handling**: Pass `OPENROUTER_API_KEY` only through `env: OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`. Do not write provider keys into generated `.ca/config.json`, logs, docs examples, or committed files.
- **Fork PR boundary**: Untrusted fork PRs must skip before provider-backed reviewers run. Do not weaken this to "try without secrets".
- **Action-source verification**: Changes to `action.yml`, `.github/workflows/review.yml`, `.github/workflows/build-action.yml`, or bundled Action runtime inputs/outputs require `pnpm build:action` plus focused Action tests.
- **Evidence boundary**: CI and degraded-path tests prove deterministic policy behavior. Live Action posting evidence requires a real `pull_request` workflow run and matching evidence artifacts.
- **Release triggers**: Triggered only on tags matching `v*` pattern (e.g., `v1.2.3`)
- **Issue templates**: Update YAML frontmatter in `.md` files for form fields and defaults
- **Permissions**: Review workflow has read/write perms for PRs and status checks; release has write for contents

### Key Behaviors

- **CI runs on**: Push to main + all PRs against main
- **Release runs on**: Tags matching `v*`
- **CodeAgora review runs on**: PR opened/synchronized/reopened; skips if `review:skip` label present
- **PR size check runs on**: PR opened/synchronized

<!-- MANUAL: -->

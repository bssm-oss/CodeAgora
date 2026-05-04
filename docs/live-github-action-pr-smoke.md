# Live GitHub Action PR Smoke

Captured on 2026-05-04 against the readiness branch.

## Normal Same-Repository PR

- PR: https://github.com/bssm-oss/CodeAgora/pull/532
- Base: `codex/roadmap-readiness-20260504`
- Head: `codex/live-action-smoke-20260504`
- Workflow run: https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874
- Review job: https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874/job/74219180113
- Review output: https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536
- Head SHA: `784ff6322b85b6b766a26ae4d793bb615a356551`
- Base SHA: `38533d467f9ec7ee97fb4ae8f9176be8046027d6`

Result:

- `review`: success, 22 seconds.
- `size-label`: success, 5 seconds.
- CodeAgora posted a GitHub PR review through the real composite Action path.
- Verdict: `ACCEPT`.
- Session: `2026-05-04/001`.
- Review body reported no issues across 3 reviewers.
- Posting used `post-results: true`, `max-diff-lines: 5000`, and `config-path: .ca/config.json`.
- The first review post attempted `APPROVE`, received GitHub 422 because `GITHUB_TOKEN` cannot approve PRs, then downgraded to `COMMENT` and preserved the review body.

The temporary fixture PR was closed after evidence capture and the remote branch
was deleted.

## Oversized Diff PR

- PR: https://github.com/bssm-oss/CodeAgora/pull/531
- Workflow run: https://github.com/bssm-oss/CodeAgora/actions/runs/25317537322
- Review job: https://github.com/bssm-oss/CodeAgora/actions/runs/25317537322/job/74218381302
- Head SHA: `38533d467f9ec7ee97fb4ae8f9176be8046027d6`
- Base SHA: `0dc5ded15641f3acd8308decd355494bd57f2230`

Result:

- `review`: success, 10 seconds.
- PR checks also passed for CI Node 20, CI Node 22, and PR size label.
- Action detected a diff of 11,483 lines against the 5,000 line limit and skipped review with a structured warning instead of running a partial provider review.

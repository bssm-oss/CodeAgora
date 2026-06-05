# CodeAgora v3 — GitHub Integration Design

> Complete specification for PR review comments, GitHub Actions, SARIF output, and UX design.
> Last updated: 2026-05-04
>
> Note: internal markers such as `codeagora-v3` are compatibility/spec examples, not current branding. For user setup, follow [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) and the current `0.1.0-rc.5` release line.

---

## Table of Contents

1. [Data Flow Overview](#1-data-flow-overview)
2. [PR Review Comments](#2-pr-review-comments)
3. [GitHub Action](#3-github-action)
4. [SARIF Output](#4-sarif-output)
5. [UX Mockups](#5-ux-mockups)
6. [Implementation Reference](#6-implementation-reference)

---

## 1. Data Flow Overview

```
HeadVerdict + ModeratorReport + EvidenceDocument[]
        │
        ▼
github/mapper.ts          ← maps domain types → GitHub API shapes
        │
        ├── createReviewComments()   → POST /repos/{owner}/{repo}/pulls/{pr}/reviews
        ├── createSummaryComment()   → POST /repos/{owner}/{repo}/issues/{pr}/comments
        ├── setCommitStatus()        → POST /repos/{owner}/{repo}/statuses/{sha}
        └── writeSarifFile()         → local SARIF file for caller-managed upload
```

The mapper is the sole boundary between CodeAgora domain types and GitHub API
shapes. All other modules stay unaware of GitHub.

---

## 2. PR Review Comments

### 2.1 Mapping EvidenceDocument → Inline Comment

`EvidenceDocument` carries `filePath` and `lineRange: [start, end]`. GitHub's
pull request review API requires a **diff hunk position** — not an absolute line
number. The position is the 1-based line count within the unified diff hunk that
the comment attaches to.

**Algorithm: lineRange → diff position**

```
GET /repos/{owner}/{repo}/pulls/{pr_number}
  Accept: application/vnd.github.v3.diff

Parse unified diff:
  For each hunk header "@@ -a,b +c,d @@":
    new_start = c, new_count = d
    For each line in hunk:
      hunk_position++          ← counts ALL lines including hunk headers
      if line starts with '+' or ' ':
        current_new_line++
        if current_new_line == target_line:
          → return hunk_position

Side: 'RIGHT' (we comment on the new version)
```

If the target line is not reachable in the diff (unchanged file, deleted line),
fall back to a **file-level comment** with no `position` field, and prepend the
line reference in the comment body.

### 2.2 Severity Badge Map

| Severity         | Badge                | GitHub event    |
|------------------|----------------------|-----------------|
| HARSHLY_CRITICAL | `🔴 HARSHLY CRITICAL` | `REQUEST_CHANGES` |
| CRITICAL         | `🔴 CRITICAL`         | `REQUEST_CHANGES` |
| WARNING          | `🟡 WARNING`          | `COMMENT`       |
| SUGGESTION       | `🔵 SUGGESTION`       | `COMMENT`       |
| DISMISSED        | `✅ DISMISSED`        | (no comment)    |

Only one `createReview` call is made per run. The event is `REQUEST_CHANGES`
if any CRITICAL or HARSHLY_CRITICAL verdict remains, otherwise `COMMENT`.

### 2.3 Inline Comment Format

```markdown
🔴 **CRITICAL** — Unparameterized SQL query allows injection

**Problem:** User input is concatenated directly into the SQL string without
parameterization. An attacker can terminate the query and append arbitrary SQL.

**Evidence:**
1. `query = "SELECT * FROM users WHERE id = " + userId` — no escaping
2. `userId` originates from `req.params.id` with no sanitization upstream
3. PostgreSQL error messages are returned raw to the client, aiding enumeration

**Suggestion:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = $1', [userId])`

<details>
<summary>Discussion summary (2 rounds, consensus reached)</summary>

**Round 1:** s1 (codex/o4-mini) AGREED — confirmed exploitable via `' OR 1=1--`.
s2 (gemini/gemini-2.5-pro) AGREED — noted lack of WAF as additional risk factor.

**Verdict:** CRITICAL confirmed. Consensus reached in round 1.

</details>

<sub>Reviewers: r1-kimi-k2.5 · r3-codex-mini &nbsp;|&nbsp; CodeAgora v3</sub>
```

### 2.4 GitHub API Calls — Review Submission

```typescript
// POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews
await octokit.pulls.createReview({
  owner,
  repo,
  pull_number: prNumber,
  commit_id: headSha,        // must be the HEAD commit of the PR branch
  event: 'REQUEST_CHANGES',  // or 'COMMENT'
  body: summaryCommentBody,  // the summary (see §2.5)
  comments: [
    {
      path: 'src/db/queries.ts',
      position: 14,          // diff hunk position
      body: inlineCommentBody,
    },
    // ... one entry per confirmed EvidenceDocument
  ],
});
```

Unconfirmed issues (1 reviewer only, head-promoted) and SUGGESTION items are
included as inline comments with `COMMENT` event — never `REQUEST_CHANGES`.

---

## 3. GitHub Action

### 3.1 `action.yml`

```yaml
name: CodeAgora Review
description: Multi-agent debate-driven code review for pull requests

inputs:
  config-path:
    description: Path to .ca/config.json relative to repo root
    required: false
    default: .ca/config.json

  github-token:
    description: GitHub token for posting comments and setting status checks
    required: true

  fail-on-reject:
    description: Exit with code 1 when verdict is REJECT (blocks merge via required check)
    required: false
    default: 'true'

  max-diff-lines:
    description: Skip review if diff exceeds this line count (0 = unlimited)
    required: false
    default: '5000'

  post-results:
    description: Post review comments and commit status to GitHub
    required: false
    default: 'true'

outputs:
  verdict:
    description: Final verdict — ACCEPT, REJECT, NEEDS_HUMAN, or SKIPPED
    value: ${{ steps.review.outputs.verdict }}

  review-url:
    description: URL of the posted GitHub review
    value: ${{ steps.review.outputs.review-url }}

  session-id:
    description: CodeAgora session ID for audit trail
    value: ${{ steps.review.outputs.session-id }}

  degraded:
    description: Whether the action ran in degraded or skipped mode
    value: ${{ steps.review.outputs.degraded }}

  degraded-reason:
    description: Stable reason code for degraded or skipped mode
    value: ${{ steps.review.outputs.degraded-reason }}

  head-sha:
    description: Pull request head SHA reviewed by CodeAgora
    value: ${{ steps.review.outputs.head-sha }}

  base-sha:
    description: Pull request base SHA used for diff acquisition
    value: ${{ steps.review.outputs.base-sha }}

runs:
  using: composite
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v6
      with:
        node-version: '20'

    - name: Fetch PR diff
      shell: bash
      run: |
        gh pr diff "$PR_NUMBER" --repo "$REPO" > /tmp/codeagora-pr.diff
      env:
        GH_TOKEN: ${{ inputs.github-token }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        REPO: ${{ github.repository }}

    - name: Run CodeAgora review
      id: review
      shell: bash
      run: |
        node "$ACTION_PATH/dist/action.js" \
          --diff /tmp/codeagora-pr.diff \
          --pr "$PR_NUMBER" \
          --sha "$HEAD_SHA" \
          --repo "$REPO" \
          --fail-on-reject "$FAIL_ON_REJECT" \
          --max-diff-lines "$MAX_DIFF_LINES" \
          --post-results "$POST_RESULTS" \
          --base-sha "$BASE_SHA" \
          --base-repo "$BASE_REPO" \
          --head-repo "$HEAD_REPO" \
          --config-path "$CONFIG_PATH"
      env:
        ACTION_PATH: ${{ github.action_path }}
        GITHUB_TOKEN: ${{ inputs.github-token }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        REPO: ${{ github.repository }}
        FAIL_ON_REJECT: ${{ inputs.fail-on-reject }}
        MAX_DIFF_LINES: ${{ inputs.max-diff-lines }}
        POST_RESULTS: ${{ inputs.post-results }}
        BASE_SHA: ${{ github.event.pull_request.base.sha }}
        BASE_REPO: ${{ github.event.pull_request.base.repo.full_name }}
        HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}
        CONFIG_PATH: ${{ inputs.config-path }}
```

When `post-results` is `false`, required GitHub credentials are unavailable, provider credentials are missing, the diff is too large, or the PR head SHA is stale, the action reports degraded/skipped state through `degraded`, `degraded-reason`, and `verdict` outputs. Failures to read or validate the config file are surfaced via `degraded`/`degraded-reason`, but the input precedence remains: CLI flag > CONFIG_PATH env > default (`.ca/config.json`).

Stable `degraded-reason` values:

```txt
missing-github-token
missing-provider-secrets
fork-missing-provider-secrets
posting-disabled
diff-too-large
config-load-failed
stale-head-sha
github-post-failed
sarif-write-failed
```

Action logs now pair each stable reason with a short why + next step. Common fixes:

| Reason | What it usually means | Next step |
|---|---|---|
| `missing-github-token` | The Action cannot post review/status updates. | Pass `github-token` (usually `${{ secrets.GITHUB_TOKEN }}`) or disable posting explicitly. |
| `missing-provider-secrets` | The config needs a provider secret that is not present. | Add the required provider secret(s) or switch the config to GitHub Models. |
| `fork-missing-provider-secrets` | Fork PR secrets are unavailable. | Use a same-repository PR, GitHub Models, or a fork gate before running CodeAgora. |
| `posting-disabled` | Posting was turned off by workflow input. | Set `post-results: 'true'` if you want PR comments and status checks. |
| `diff-too-large` | The diff exceeded `max-diff-lines`. | Lower the PR size, raise `max-diff-lines`, or split the PR. |
| `config-load-failed` | The config path or JSON/YAML file could not be read. | Fix `.ca/config.json` or `config-path` and rerun. |
| `stale-head-sha` | The PR head changed before posting. | Rerun the workflow on the updated commit SHA. |
| `github-post-failed` | GitHub rejected a posting operation. | Check token scopes and the Action log, then rerun. |
| `sarif-write-failed` | The SARIF file path was not writable/safe. | Use a writable SARIF path or export SARIF elsewhere. |

### 3.2 How the Action Gets the Diff

**PR diff (preferred):** `gh pr diff {number}` returns the unified diff of all files changed in the PR. This is the same diff a reviewer sees in the GitHub UI, and it strips binary files automatically.

**Local fallback:** if GitHub API diff retrieval fails, the action falls back to local `git diff` using the pull request base and head SHAs. This fallback requires a `pull_request` event context and an earlier `actions/checkout` step.

### 3.2.1 Agent CLI and Companion Action Notes

CodeAgora supports CLI reviewer backends such as Claude Code and Codex when those CLIs are installed and authenticated on the runner. The CodeAgora GitHub Action itself does not install or log in to those CLIs; it runs the bundled `dist/action.js` runtime and delegates reviewer execution to the configured backend.

For OAuth-based Claude Code automation, use `anthropics/claude-code-action@v1` as a separate companion workflow/step with `claude_code_oauth_token`. That companion action can post its own PR feedback, while CodeAgora continues to provide the multi-reviewer verdict, sessions, SARIF, and stable Action outputs.

Do not run OAuth-backed companion agent workflows on untrusted fork PRs unless your repository has an explicit approval/gating policy, because GitHub Actions secrets are not available to those runs.

### 3.3 Comment Deduplication

On re-run (e.g. after a force-push or manual re-trigger), the action must not
duplicate review comments from a prior run.

**Strategy: marker comment + dismiss prior review**

1. Before posting, search for existing reviews authored by the bot user:
   ```typescript
   // GET /repos/{owner}/{repo}/pulls/{pr_number}/reviews
   const reviews = await octokit.pulls.listReviews({ owner, repo, pull_number });
   const prior = reviews.data.filter(r =>
     r.user?.login === botLogin &&
     r.body?.includes('<!-- codeagora-v3 -->')
   );
   ```

2. Dismiss each prior review with a neutral message:
   ```typescript
   // PUT /repos/{owner}/{repo}/pulls/{pr_number}/reviews/{review_id}/dismissals
   await octokit.pulls.dismissReview({
     owner, repo, pull_number,
     review_id: prior.id,
     message: 'Superseded by new CodeAgora run',
   });
   ```

3. Post the new review. The HTML comment `<!-- codeagora-v3 -->` in the review
   body is the stable marker used for detection.

Note: dismissed reviews remain visible in the GitHub UI under "Outdated reviews"
— they are not deleted, which preserves the audit trail.

### 3.4 422 Inline Position Fallback

If GitHub rejects the review with a 422 inline-position validation error,
CodeAgora retries once without inline comments and appends the dropped inline
comment count to the summary body. It does not probe subsets of comments with
successful `createReview` calls, because those probes create real PR review
side effects and can duplicate comments.

### 3.5 Status Check Integration

```typescript
// POST /repos/{owner}/{repo}/statuses/{sha}
await octokit.repos.createCommitStatus({
  owner,
  repo,
  sha: headSha,
  state: verdictToState(verdict.decision),   // 'success' | 'failure' | 'pending'
  context: 'CodeAgora / review',
  description: verdictToDescription(verdict),
  target_url: reviewUrl,                     // links to the posted review
});

function verdictToState(decision: HeadVerdict['decision']): 'success' | 'failure' | 'pending' {
  switch (decision) {
    case 'ACCEPT':       return 'success';
    case 'REJECT':       return 'failure';
    case 'NEEDS_HUMAN':  return 'pending';  // pending keeps the check yellow
  }
}

function verdictToDescription(verdict: HeadVerdict): string {
  switch (verdict.decision) {
    case 'ACCEPT':      return 'All issues resolved — ready to merge';
    case 'REJECT':      return `${criticalCount} blocking issue(s) found`;
    case 'NEEDS_HUMAN': return 'Human review required for unresolved issues';
  }
}
```

When `fail-on-reject` is `true`, the action process exits with code 1 on
REJECT. The status check alone is advisory; the exit code is what GitHub reads
to mark the required check as failed.

---

## 4. SARIF Output

### 4.1 Type Mapping

| `EvidenceDocument` field | SARIF field                                | Notes |
|--------------------------|---------------------------------------------|-------|
| `issueTitle`             | `result.message.text`                       | |
| `problem`                | `result.message.markdown`                   | Full problem statement |
| `filePath`               | `result.locations[0].physicalLocation.artifactLocation.uri` | Relative to repo root |
| `lineRange[0]`           | `result.locations[0].physicalLocation.region.startLine` | 1-based |
| `lineRange[1]`           | `result.locations[0].physicalLocation.region.endLine` | |
| `severity`               | `result.level` (see table below)            | |
| `suggestion`             | `result.fixes[0].description.text`          | |
| `evidence`               | `result.relatedLocations` / `result.message.markdown` | Embedded in markdown |

**Severity → SARIF level:**

| Severity         | `result.level` | `result.kind`  |
|------------------|----------------|----------------|
| HARSHLY_CRITICAL | `error`        | `open`         |
| CRITICAL         | `error`        | `open`         |
| WARNING          | `warning`      | `open`         |
| SUGGESTION       | `note`         | `open`         |
| DISMISSED        | (omitted)      | (omitted)      |

### 4.2 SARIF Schema

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "CodeAgora",
          "version": "3.0.0",
          "informationUri": "https://github.com/your-org/codeagora",
          "rules": [
            {
              "id": "CA001",
              "name": "HarshlyCriticalIssue",
              "shortDescription": { "text": "Harshly critical issue detected by multi-agent review" },
              "fullDescription": { "text": "Multiple AI reviewers debated and confirmed an irreversible, high-impact issue." },
              "defaultConfiguration": { "level": "error" },
              "helpUri": "https://github.com/your-org/codeagora/docs/severities#harshly-critical"
            },
            {
              "id": "CA002",
              "name": "CriticalIssue",
              "shortDescription": { "text": "Critical issue detected by multi-agent review" },
              "defaultConfiguration": { "level": "error" },
              "helpUri": "https://github.com/your-org/codeagora/docs/severities#critical"
            },
            {
              "id": "CA003",
              "name": "WarningIssue",
              "shortDescription": { "text": "Warning-level issue detected by multi-agent review" },
              "defaultConfiguration": { "level": "warning" },
              "helpUri": "https://github.com/your-org/codeagora/docs/severities#warning"
            },
            {
              "id": "CA004",
              "name": "Suggestion",
              "shortDescription": { "text": "Suggestion from multi-agent review" },
              "defaultConfiguration": { "level": "note" },
              "helpUri": "https://github.com/your-org/codeagora/docs/severities#suggestion"
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "CA002",
          "level": "error",
          "message": {
            "text": "Unparameterized SQL query allows injection",
            "markdown": "**Problem:** User input is concatenated directly into the SQL string.\n\n**Evidence:**\n1. `query = \"SELECT * FROM users WHERE id = \" + userId`\n2. `userId` originates from `req.params.id` with no sanitization\n\n**Suggestion:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = $1', [userId])`"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "src/db/queries.ts",
                  "uriBaseId": "%SRCROOT%"
                },
                "region": {
                  "startLine": 42,
                  "endLine": 45
                }
              }
            }
          ],
          "fixes": [
            {
              "description": { "text": "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId])" }
            }
          ],
          "properties": {
            "codeagora/sessionId": "001",
            "codeagora/reviewers": ["r1-kimi-k2.5", "r3-codex-mini"],
            "codeagora/discussionId": "d001",
            "codeagora/consensusReached": true,
            "codeagora/rounds": 1
          }
        }
      ],
      "automationDetails": {
        "id": "codeagora/2026-03-09/001"
      }
    }
  ]
}
```

### 4.3 Downstream SARIF Upload

The CodeAgora Action generates a SARIF file, but it does not upload that file to
GitHub Code Scanning. Caller workflows own that handoff so repositories can
choose between Code Scanning upload, artifact upload, both, or neither.

Default path:

```txt
/tmp/codeagora-results.sarif
```

The path can be overridden with `github.sarifOutputPath` in `.ca/config.json`.
CodeAgora validates this path before writing the file.

Example downstream Code Scanning upload:

```yaml
- uses: github/codeql-action/upload-sarif@v4
  if: always()
  with:
    sarif_file: /tmp/codeagora-results.sarif
```

Requirement: Code Scanning must be enabled on the repository. It is free for
public repositories and requires GitHub Advanced Security for private
repositories.

### 4.4 VS Code SARIF Viewer Compatibility

The SARIF Viewer extension reads SARIF 2.1.0 files. To support local dev
workflows, caller workflows can upload the generated SARIF file as an artifact:

```yaml
- name: Upload SARIF artifact
  uses: actions/upload-artifact@v7
  with:
    name: codeagora-sarif
    path: /tmp/codeagora-results.sarif
    retention-days: 30
```

Developers can download the artifact and open it in VS Code with the SARIF
Viewer extension to see inline diagnostics in their editor.

`%SRCROOT%` must resolve correctly — the action sets `uriBaseId` to the repo
root, and `artifactLocation.uri` must be a relative path from repo root (not
absolute). This is already enforced by stripping the `process.cwd()` prefix
from `EvidenceDocument.filePath` during SARIF generation.

---

## 5. UX Mockups

### 5.1 Summary Comment (posted on the PR thread)

The summary comment is posted as part of the review body (visible at the top of
the review in the Files Changed tab and also in the Conversation tab).

---

```
<!-- codeagora-v3 -->

## CodeAgora Review

**Verdict: 🔴 REJECT** · 1 critical · 2 warnings · 3 suggestions

> Reviewed by 5 independent AI agents with debate-driven consensus.
> Session: `2026-03-09/001` · Duration: 47s · Cost: ~$0.28

---

### Blocking Issues

| Severity | File | Line | Issue |
|----------|------|------|-------|
| 🔴 CRITICAL | `src/db/queries.ts` | 42–45 | Unparameterized SQL query allows injection |
| 🔴 CRITICAL | `src/auth/session.ts` | 18 | Session token not invalidated on logout |

These issues must be resolved before merging.

---

### Warnings

<details>
<summary>2 warnings (click to expand)</summary>

| Severity | File | Line | Issue |
|----------|------|------|-------|
| 🟡 WARNING | `src/api/users.ts` | 103 | Missing rate limiting on user enumeration endpoint |
| 🟡 WARNING | `src/components/Form.tsx` | 67 | Form submit has no loading state, allows double-submit |

</details>

---

### Suggestions

<details>
<summary>3 suggestions (click to expand)</summary>

- `src/utils/format.ts:12` — Extract date formatting to a shared util to avoid duplication
- `src/db/queries.ts:8` — Add index on `users.email` for query performance
- `src/api/users.ts:45` — Add JSDoc comment for the `normalizeUser` function

</details>

---

### Agent Consensus Log

<details>
<summary>Discussion d001 — SQL Injection (2 rounds)</summary>

**Issue:** Unparameterized SQL query in `src/db/queries.ts:42`

**Round 1:**
- `s1 (codex/o4-mini)` — AGREED: Confirmed exploitable via `' OR 1=1--`
- `s2 (gemini/gemini-2.5-pro)` — AGREED: Noted absence of WAF as compounding factor

**Consensus reached in round 1.** Severity: CRITICAL

</details>

<details>
<summary>Discussion d002 — Session Invalidation (3 rounds, forced decision)</summary>

**Issue:** Session token not invalidated on logout in `src/auth/session.ts:18`

**Round 1:** s1 AGREED, s2 NEUTRAL (requested more context)
**Round 2:** s1 AGREED, s2 DISAGREED (argued session store TTL is sufficient)
**Round 3:** s1 AGREED, s2 NEUTRAL

**Max rounds reached. Moderator decision:** CRITICAL — TTL-only invalidation
fails for stolen tokens. Explicit invalidation is required.

</details>

---

<sub>
  [CodeAgora v3](https://github.com/your-org/codeagora) ·
  Reviewers: kimi-k2.5, grok-fast, codex-mini, glm-4.7, gemini-flash ·
  Moderator: claude-sonnet ·
  [Session logs](.ca/sessions/2026-03-09/001/)
</sub>
```

---

### 5.2 Inline Comment Format (per EvidenceDocument)

Posted as individual comments within the GitHub review, attached to the
specific diff hunk lines.

**CRITICAL / HARSHLY_CRITICAL:**
```
🔴 **CRITICAL** — Unparameterized SQL query allows injection

**Problem:** User input is concatenated directly into the SQL string without
parameterization. An attacker can terminate the query and append arbitrary SQL.

**Evidence:**
1. `query = "SELECT * FROM users WHERE id = " + userId` — no escaping applied
2. `userId` originates from `req.params.id` — no sanitization upstream
3. PostgreSQL error messages returned raw to client — aids SQL structure enumeration

**Fix:** Replace with a parameterized query:
\```typescript
// Before
const query = "SELECT * FROM users WHERE id = " + userId;

// After
const result = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);
\```

<details>
<summary>Discussion summary — 1 round, consensus reached</summary>

s1 (codex/o4-mini): AGREED — Confirmed exploitable via `' OR 1=1--` payload
s2 (gemini/gemini-2.5-pro): AGREED — Additional risk: no WAF in front of this endpoint

</details>

<sub>Flagged by: r1-kimi-k2.5, r3-codex-mini &nbsp;|&nbsp; CodeAgora v3</sub>
```

**WARNING:**
```
🟡 **WARNING** — Missing rate limiting on user enumeration endpoint

**Problem:** The `/api/users/lookup` endpoint accepts unlimited requests per IP,
enabling automated user enumeration at scale.

**Evidence:**
1. No `express-rate-limit` middleware on this router
2. Response time differs for existing vs. non-existing users (timing oracle)

**Fix:** Add rate limiting middleware before this route handler.

<sub>Flagged by: r2-grok-fast, r4-glm-4.7 &nbsp;|&nbsp; CodeAgora v3</sub>
```

**SUGGESTION:**
```
🔵 **SUGGESTION** — Extract date formatting to a shared utility

`formatDate` is duplicated across 3 files with slight variations.
Consider creating `src/utils/date.ts` with a canonical implementation.

<sub>Flagged by: r5-gemini-flash &nbsp;|&nbsp; CodeAgora v3</sub>
```

**HARSHLY_CRITICAL (escalated, no discussion):**
```
🔴 **HARSHLY CRITICAL** — AWS credentials committed to repository

**Problem:** An AWS access key and secret are present in `src/config/aws.ts`.
This is an irreversible exposure: the key may already be indexed by secret
scanning tools and must be rotated immediately, regardless of whether the PR
is merged.

**Evidence:**
1. `AWS_ACCESS_KEY_ID = "AKIA..."` — real key pattern detected
2. `AWS_SECRET_ACCESS_KEY` set to a 40-character string — real secret pattern
3. File is not in `.gitignore`

**Immediate actions required:**
1. Rotate the AWS credentials NOW via the AWS console
2. Remove the credentials from this file
3. Use environment variables or AWS Secrets Manager instead
4. Check git history for prior exposure: `git log --all -S 'AKIA'`

> ⚠️ This issue was escalated directly to the Head agent (bypassing debate)
> per the HARSHLY_CRITICAL safety rule. Human action is required.

<sub>Flagged by: r1-kimi-k2.5 &nbsp;|&nbsp; Escalated (no debate) &nbsp;|&nbsp; CodeAgora v3</sub>
```

---

### 5.3 NEEDS_HUMAN Verdict Behavior

When `HeadVerdict.decision === 'NEEDS_HUMAN'`, the action takes these steps:

**1. Request reviewers via the API:**
```typescript
// POST /repos/{owner}/{repo}/pulls/{pr_number}/requested_reviewers
// Only works if requester has write access and reviewers are collaborators.
// Falls back gracefully if API returns 422.
await octokit.pulls.requestReviewers({
  owner,
  repo,
  pull_number: prNumber,
  reviewers: humanReviewers,   // from config: github.humanReviewers[]
  team_reviewers: humanTeams,  // from config: github.humanTeams[]
}).catch(() => {/* non-fatal */});
```

**2. Add a label:**
```typescript
await octokit.issues.addLabels({
  owner, repo,
  issue_number: prNumber,
  labels: ['needs-human-review'],
});
```

**3. Status check stays pending:**
The commit status is set to `pending` with description "Human review required
for unresolved issues." This keeps the merge button blocked if the check is
required, without setting it to explicit failure.

**4. The summary comment signals the questions:**

```
## CodeAgora Review

**Verdict: 🟠 NEEDS HUMAN REVIEW**

CodeAgora could not reach a conclusion on the following issues.
A human reviewer has been requested.

### Open Questions

1. **d003 — Optimistic lock bypass** (`src/db/transactions.ts:88`):
   Is the race condition in `updateUserBalance` acceptable given the
   business invariant that balance can never go negative? The debate
   was split: s1 says the existing check is sufficient, s2 says it
   requires a database-level constraint.

2. **d004 — Cache invalidation scope** (`src/cache/user.ts:44`):
   Should cache eviction on user update clear only the user's own
   entries or also dependent aggregates? Requires product decision.

@reviewer1 @reviewer2 — your input is needed on the above.
```

---

### 5.4 ACCEPT Verdict — Minimal Comment

```
<!-- codeagora-v3 -->

## CodeAgora Review

**Verdict: ✅ ACCEPT** · 0 critical · 0 warnings · 4 suggestions

> All issues resolved through multi-agent debate. No blocking items found.

<details>
<summary>4 suggestions (click to expand)</summary>

- `src/utils/format.ts:12` — Consider extracting shared date formatter
- `src/api/index.ts:5` — Unused import `lodash` can be removed
- `src/types/user.ts:33` — Consider using `Readonly<User>` in readonly contexts
- `src/db/queries.ts:67` — Add comment explaining the LEFT JOIN rationale

</details>

<sub>
  [CodeAgora v3](https://github.com/your-org/codeagora) ·
  Session: `2026-03-09/001` · Duration: 31s · Cost: ~$0.15
</sub>
```

---

## 6. Implementation Reference

### 6.1 File Structure

```
src/
└── github/
    ├── mapper.ts          ← EvidenceDocument/HeadVerdict → GitHub API shapes
    ├── diff-parser.ts     ← unified diff → hunk position index
    ├── poster.ts          ← wraps @octokit/rest, posts review + status
    ├── dedup.ts           ← find and dismiss prior CodeAgora reviews
    ├── sarif.ts           ← EvidenceDocument[] → SARIF 2.1.0 JSON
    └── types.ts           ← GitHubReviewComment, SarifResult, etc.

github-action.ts           ← CLI entrypoint for GitHub Actions runner
action.yml                 ← Action manifest
```

### 6.2 `github/types.ts`

```typescript
export interface GitHubReviewComment {
  path: string;
  position: number;    // diff hunk position; omit for file-level comments
  side: 'RIGHT';
  body: string;
}

export interface GitHubReview {
  commit_id: string;
  event: 'REQUEST_CHANGES' | 'COMMENT' | 'APPROVE';
  body: string;           // summary comment; contains <!-- codeagora-v3 -->
  comments: GitHubReviewComment[];
}

export interface DiffPositionIndex {
  // key: "path:newLine" → value: hunk position
  [key: string]: number;
}

export interface PostResult {
  reviewId: number;
  reviewUrl: string;
  verdict: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';
}
```

### 6.3 `github/diff-parser.ts` (algorithm sketch)

```typescript
export function buildDiffPositionIndex(unifiedDiff: string): DiffPositionIndex {
  const index: DiffPositionIndex = {};
  let currentFile = '';
  let hunkPosition = 0;
  let newLineNumber = 0;

  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('--- ')) continue;

    if (line.startsWith('+++ ')) {
      // "+++ b/src/db/queries.ts" → "src/db/queries.ts"
      currentFile = line.slice(6);
      hunkPosition = 0;
      continue;
    }

    if (line.startsWith('@@')) {
      // "@@ -42,8 +42,10 @@" → new start = 42
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      newLineNumber = match ? parseInt(match[1], 10) - 1 : 0;
      hunkPosition++;          // the @@ line itself counts as position 1
      continue;
    }

    if (line.startsWith('-')) {
      hunkPosition++;          // deleted lines count toward position
      continue;                // but do not advance newLineNumber
    }

    if (line.startsWith('+') || line.startsWith(' ')) {
      hunkPosition++;
      newLineNumber++;
      index[`${currentFile}:${newLineNumber}`] = hunkPosition;
    }
  }

  return index;
}

export function resolvePosition(
  index: DiffPositionIndex,
  filePath: string,
  line: number
): number | null {
  return index[`${filePath}:${line}`] ?? null;
}
```

### 6.4 `github/mapper.ts` (key function signatures)

```typescript
import type { EvidenceDocument, HeadVerdict, ModeratorReport, DiscussionVerdict } from '../types/core.js';
import type { GitHubReview, GitHubReviewComment } from './types.js';
import type { DiffPositionIndex } from './diff-parser.js';

/**
 * Maps the full pipeline output to a single GitHub review payload.
 * One createReview() call = one review with N inline comments.
 */
export function mapToGitHubReview(params: {
  verdict: HeadVerdict;
  report: ModeratorReport;
  evidenceDocs: EvidenceDocument[];    // all confirmed docs (not dismissed)
  discussions: DiscussionVerdict[];    // for discussion summaries
  positionIndex: DiffPositionIndex;
  headSha: string;
  sessionId: string;
  sessionDate: string;
}): GitHubReview;

/**
 * Maps a single EvidenceDocument to an inline comment body string.
 * Includes severity badge, problem, evidence list, suggestion, discussion summary.
 */
export function mapToInlineCommentBody(
  doc: EvidenceDocument,
  discussion: DiscussionVerdict | undefined,
  reviewerIds: string[]
): string;

/**
 * Builds the summary review body with verdict header, blocking table,
 * collapsible warnings/suggestions, and agent consensus log.
 */
export function buildSummaryBody(params: {
  verdict: HeadVerdict;
  report: ModeratorReport;
  criticalDocs: EvidenceDocument[];
  warningDocs: EvidenceDocument[];
  suggestionDocs: EvidenceDocument[];
  sessionId: string;
  sessionDate: string;
  durationSeconds: number;
  estimatedCost: string;
}): string;
```

### 6.5 `.ca/config.json` — GitHub section

```jsonc
{
  // ... existing config ...

  "github": {
    // Reviewer teams/users to request on NEEDS_HUMAN verdict
    "humanReviewers": ["reviewer1", "reviewer2"],
    "humanTeams": [],

    // Label to add on NEEDS_HUMAN
    "needsHumanLabel": "needs-human-review",

    // Post inline comments for SUGGESTION severity (can be noisy)
    "postSuggestions": false,

    // Collapse discussion logs in summary comment by default
    "collapseDiscussions": true,

    // Generate a local SARIF output file for caller-managed upload/artifacts
    "sarifOutputPath": "/tmp/codeagora-results.sarif"
  }
}
```

### 6.6 Rate Limit Considerations

The GitHub REST API has a rate limit of 5,000 requests/hour for authenticated
users. A typical CodeAgora run makes these calls:

| Call | Count |
|------|-------|
| `GET /pulls/{pr}/reviews` (dedup check) | 1 |
| `PUT /pulls/{pr}/reviews/{id}/dismissals` | 0–1 per prior run |
| `GET /pulls/{pr}` (diff fetch via gh CLI) | 1 |
| `POST /repos/statuses/{sha}` | 1 |
| `POST /pulls/{pr}/reviews` (with N inline comments) | 1 |
| `POST /pulls/{pr}/requested_reviewers` (NEEDS_HUMAN only) | 0–1 |
| `POST /issues/{pr}/labels` (NEEDS_HUMAN only) | 0–1 |
| Code Scanning SARIF upload | 0 unless the caller workflow adds an upload step |

**Total: 4–6 CodeAgora API calls per run.** Caller-owned SARIF upload steps add
their own GitHub API usage. Rate limits are not a concern for typical runs.

---

*CodeAgora v3 GitHub Integration Design — v1.0*
*All GitHub API endpoints reference the `@octokit/rest` v22 interface.*

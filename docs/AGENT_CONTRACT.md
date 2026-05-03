<!-- Parent: AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-04-27 -->

# Agent Contract

CodeAgora exposes one machine-readable review contract for automation surfaces:

- CLI `agora review --output json`
- CLI `agora review --json-stream`
- CLI `agora sessions list --json` and `agora sessions show --json`
- MCP review tools when `output_format: "json"` is requested

The current contract marker is:

```txt
codeagora.review.v1
```

Only the versioned JSON/NDJSON surfaces in this document are stable machine contracts. Compact MCP output and presentation renderers such as text, Markdown, GitHub-flavored Markdown, HTML, JUnit, and SARIF may change during beta unless they are explicitly versioned here.

## JSON Result

`agora review --output json` writes one JSON object to stdout.

Required top-level fields:

```json
{
  "schemaVersion": "codeagora.review.v1",
  "status": "success",
  "date": "2026-04-27",
  "sessionId": "001",
  "summary": {
    "decision": "ACCEPT",
    "reasoning": "No blocking issues.",
    "totalReviewers": 3,
    "forfeitedReviewers": 0,
    "severityCounts": {
      "HARSHLY_CRITICAL": 0,
      "CRITICAL": 0,
      "WARNING": 0,
      "SUGGESTION": 0
    },
    "topIssues": [],
    "totalDiscussions": 0,
    "resolved": 0,
    "escalated": 0
  },
  "evidenceDocs": [],
  "discussions": []
}
```

For failed pipeline runs:

```json
{
  "schemaVersion": "codeagora.review.v1",
  "status": "error",
  "date": "2026-04-27",
  "sessionId": "001",
  "error": "Pipeline failed"
}
```

Consumers should branch first on `schemaVersion`, then `status`, then `summary.decision`.

## NDJSON Stream

`agora review --json-stream` writes newline-delimited JSON only. It does not also print the normal text formatter.
Each line is one complete JSON object with a `type` discriminator. Consumers should ignore unknown fields and continue reading until a `type: "result"` event arrives.

Progress event:

```json
{"schemaVersion":"codeagora.review.v1","type":"progress","stage":"review","event":"stage-update","progress":40,"message":"2/5 reviewers complete","timestamp":1777248000000}
```

Final result event:

```json
{"type":"result","schemaVersion":"codeagora.review.v1","status":"success","date":"2026-04-27","sessionId":"001","summary":{"decision":"ACCEPT"}}
```

Progress event fields:

| Field | Values |
|-------|--------|
| `type` | `progress` |
| `stage` | `init`, `review`, `discuss`, `verdict`, `complete` |
| `event` | `stage-start`, `stage-update`, `stage-complete`, `stage-error`, `pipeline-complete` |
| `progress` | integer percentage, `0` to `100` |
| `message` | human-readable status string |
| `timestamp` | Unix epoch milliseconds |

Result event fields are the same as JSON Result plus `type: "result"`.
The final result event is always the last contract event emitted by the CLI command.

## Exit Codes

`agora review` uses deterministic exit codes for CI and agent callers:

| Code | Meaning |
|------|---------|
| `0` | Review command completed and no requested failure gate tripped |
| `1` | Review completed, but `--fail-on-reject` or `--fail-on-severity` tripped |
| `2` | User-actionable setup/input/config error |
| `3` | Runtime or pipeline failure |

Notes:

- A `REJECT` verdict alone exits `0` unless `--fail-on-reject` is set.
- `--fail-on-severity` exits `1` when any issue is at or above the configured severity.
- Pipeline results with `status: "error"` exit `3`.

## Session JSON

Session JSON is intentionally smaller than review JSON, but uses the same contract marker.

`agora sessions list --json`:

```json
{
  "schemaVersion": "codeagora.review.v1",
  "sessions": [
    {
      "id": "2026-04-27/001",
      "date": "2026-04-27",
      "sessionId": "001",
      "status": "completed",
      "dirPath": ".ca/sessions/2026-04-27/001"
    }
  ]
}
```

`agora sessions show 2026-04-27/001 --json`:

```json
{
  "schemaVersion": "codeagora.review.v1",
  "entry": {
    "id": "2026-04-27/001",
    "date": "2026-04-27",
    "sessionId": "001",
    "status": "completed",
    "dirPath": ".ca/sessions/2026-04-27/001"
  },
  "metadata": {},
  "verdict": {}
}
```

## Session Artifact Contract

Persisted session artifacts under `.ca/sessions/{YYYY-MM-DD}/{NNN}/` use a dedicated session artifact marker:

```txt
codeagora.session.v1
```

New `metadata.json` files include `schemaVersion: "codeagora.session.v1"`. Terminal pipeline paths also persist readable `result.json` with the same marker for normal reviews, lightweight `--skip-head` reviews, cache hits, empty diffs, auto-approvals, degraded reviewer failures, and pipeline errors when a session directory exists.

Readers that encounter missing `schemaVersion`, missing `metadata.json`, or missing `result.json` must treat the session as `legacy/best-effort`: keep rendering whatever artifacts are available, report zero findings or `unknown`/best-effort decisions where needed, and avoid raw stack traces or filesystem parse errors in user-facing CLI/MCP/desktop output.

`agora sessions show --json` may annotate old metadata as:

```json
{
  "artifactContract": "legacy/best-effort"
}
```

Consumers should branch on the persisted artifact `schemaVersion` when it is present, and otherwise use the legacy/best-effort path without migrating or rewriting user session directories.

## MCP Alignment

MCP review tools default to compact output to preserve agent context. `review_quick` and `review_full` accept either `diff` or `staged: true`; `review_pr` accepts `pr_url` or `pr_number`; review tools also accept shared options such as `reviewer_count`, `reviewer_names`, `provider`, `model`, `timeout_seconds`, `reviewer_timeout_seconds`, `no_cache`, `context_lines`, `repo_path`, and `output_format`.

When `repo_path` is supplied, the MCP server validates that it resolves to an accessible directory inside the server cwd/repository root before invoking the review pipeline.

Default compact response shape:

```json
{
  "decision": "ACCEPT",
  "reasoning": "No blocking issues.",
  "issues": [],
  "summary": "No issues found.",
  "sessionId": "2026-04-27/001"
}
```

For compact MCP output, `decision` is `ACCEPT`, `REJECT`, `NEEDS_HUMAN`, or `ERROR`; `issues` is an array of compact finding objects; `summary` is a short string; and `sessionId` is the review session identifier when available.

When a caller requests `output_format: "json"`, MCP delegates to the same CLI JSON formatter and therefore includes `schemaVersion: "codeagora.review.v1"`.

MCP tool failures keep MCP protocol `isError: true` and return a structured JSON body:

```json
{
  "status": "error",
  "code": "INVALID_REPO_PATH",
  "message": "repo_path is outside the allowed repository boundary",
  "details": {
    "repoPath": "/tmp/outside-repo"
  }
}
```

Review tool error codes are stable strings such as `INVALID_INPUT`, `INVALID_REPO_PATH`, `REVIEW_FAILED`, `REVIEW_PR_FAILED`, and `DRY_RUN_FAILED`. Consumers should branch on `status` and `code`; `details` is optional diagnostic context.

Supported non-compact review output formats:

```txt
text, json, md, github, html, junit, sarif
```

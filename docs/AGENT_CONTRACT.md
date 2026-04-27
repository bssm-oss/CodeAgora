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

## MCP Alignment

MCP review tools default to compact output to preserve agent context.

When a caller requests `output_format: "json"`, MCP delegates to the same CLI JSON formatter and therefore includes `schemaVersion: "codeagora.review.v1"`.

Supported non-compact review output formats:

```txt
text, json, md, github, html, junit, sarif
```

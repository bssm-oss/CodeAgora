<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# l3 — Head Verdict

## Purpose
Head Verdict Layer makes the final review verdict based on moderator report. Uses LLM-based reasoning evaluation when head config is provided, falls back to rule-based logic on failure. Groups issues by file for organized output.

## Key Files

| File | Description |
|------|-------------|
| `verdict.ts` | Verdict generation: LLM-based or rule-based logic, unconfirmed queue handling |
| `grouping.ts` | Issue grouping: organizes findings by file, nested by issue type |
| `writer.ts` | Verdict report writer: formats final output |

## Subdirectories
None (final layer, minimal module structure)

## For AI Agents

### Working In This Directory

**Key Concepts:**
- **LLM-Based Verdict:** Head model evaluates reasoning quality (not just counting severities)
- **Rule-Based Fallback:** Deterministic verdict if LLM unavailable or fails
- **Unconfirmed Queue:** High-severity findings awaiting human confirmation
- **Grouping:** Issues organized by file → category for clarity

**API Entry Point:**
- `makeHeadVerdict()` — main entry: takes ModeratorReport, returns HeadVerdict
- `groupDiff()` — groups findings by file
- `scanUnconfirmedQueue()` — identifies findings requiring human review
- Clean moderator reports with no actionable discussions, suggestions, or unconfirmed issues should remain deterministically ACCEPT; do not call the head model just to reinterpret an empty report.

**Decision Criteria:**
- LLM verdict: evaluates reasoning quality + confidence metrics
- Rule-based: count issues by severity, compute overall risk score
- Confidence scoring: high agreement + clear evidence = high confidence

### Testing Requirements

**LLM-Based Verdict:**
- Head config provided and enabled
- Mock LLM response parsing
- Fallback on timeout/error
- Verdict confidence extraction
- Clean-report guard coverage should stay in tests when touching verdict fallback logic.

**Rule-Based Fallback:**
- Severity weighting (CRITICAL > HIGH > MEDIUM > LOW > WARNING)
- Agreement scoring (multiple reviewers → higher confidence)
- Overall risk calculation
- Reproduce deterministically

**Grouping:**
- Issues grouped by file name
- Nested by category (Security, Performance, Style, etc.)
- Preserve line numbers and locations
- Handle missing files gracefully

**Unconfirmed Queue:**
- CRITICAL findings added automatically
- Configurable threshold for other severities
- Preserved for manual review

**Integration:**
- Full flow: ModeratorReport → verdict + grouping → human review

### Common Patterns

**Verdict Logic:**
1. Check if head config provided and enabled
2. If yes: run LLM-based evaluation
3. On LLM failure: fallback to rule-based
4. Score confidence based on agreement + reasoning
5. Identify unconfirmed findings (auto-review queue)
6. Return HeadVerdict with grouping

**LLM-Based Evaluation:**
- Prompt asks head model to evaluate reasoning quality
- Considers evidence strength, specificity, consensus
- Returns verdict + confidence score
- Handles partial/malformed responses gracefully

**Rule-Based Verdict:**
- Sum critical issues (weight 5)
- Sum high issues (weight 3)
- Sum medium issues (weight 1)
- Risk score = total / (total + 1) → 0-1 range
- Map to verdict tier (PASS, WARN, FAIL)

**Grouping Algorithm:**
```
For each finding:
  group[finding.file] ??= {}
  group[file][finding.category] ??= []
  group[file][category].push(finding)
```

**Confidence Scoring:**
- Base score: agreement count / total reviewers
- Boost: supported by multiple rounds
- Reduce: contested findings (objections)
- Final: 0-1 scale

## Dependencies

### Internal (Core)
- `types/config.ts` — HeadConfig, AgentConfig
- `types/core.ts` — ModeratorReport, HeadVerdict, EvidenceDocument

### External
- `ai` (Vercel AI SDK) — LLM calls for head model
- `@ai-sdk/*` — provider implementations
- `@codeagora/shared` — logger

<!-- MANUAL: -->

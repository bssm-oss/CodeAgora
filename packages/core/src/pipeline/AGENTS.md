<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# pipeline — Orchestrator

## Purpose
Pipeline Orchestrator connects all 4 review layers (L0-L3) into a single cohesive workflow. Handles chunking of large diffs, cost estimation, dryrun simulation, progress tracking, telemetry, auto-approval logic, and compact reporting. This is the main execution engine.

## Key Files

| File | Description |
|------|-------------|
| `orchestrator.ts` | Main pipeline orchestrator: coordinates L0-L3, chunk processing, session management |
| `chunker.ts` | Diff chunking: splits large diffs into reviewable pieces, handles serial vs parallel |
| `cost-estimator.ts` | Cost estimation: predicts API costs before execution |
| `diff-complexity.ts` | Diff complexity analysis: lines changed, files touched, churn rate |
| `dryrun.ts` | Dryrun simulation: preview verdict without executing |
| `progress.ts` | Progress tracking: reports execution progress in real-time |
| `report.ts` | Report generation: final output formatting and serialization |
| `telemetry.ts` | Telemetry collection: metrics, timing, errors |
| `confidence.ts` | Confidence scoring: overall review confidence level |
| `auto-approve.ts` | Auto-approval logic: conditions for auto-merge without human review |
| `compact-formatter.ts` | Compact output formatting: minimal console output |
| `dsl-parser.ts` | DSL parsing: parses decision rules and filters |
| `dsl-types.ts` | DSL type definitions |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `analyzers/` | Pre-analysis modules that enrich review context before pipeline execution |

## For AI Agents

### Working In This Directory

**Key Concepts:**
- **Chunking:** Splits large diffs to limit reviewer load (adaptive: ≤2 serial, >2 parallel with pLimit(3))
- **Cost Estimation:** Predicts API token usage before execution
- **Progress Tracking:** Real-time updates on execution progress
- **Telemetry:** Collects metrics (timing, token usage, success rate, cost)
- **Auto-Approval:** Determines if review passes auto-merge criteria
- **Dryrun:** Previews verdict without executing full pipeline

**API Entry Point:**
- `runPipeline()` — main entry: orchestrates full L0-L3 execution
- `estimateCost()` — predicts API costs
- `runDryrun()` — simulates verdict without execution
- `checkAutoApprove()` — evaluates auto-merge criteria
- Dry-run is provider-free: no LLM calls, no live provider quality signal, and no GitHub posting evidence.
- Dry-run/readiness logic must not over-block CLI backend configs as missing API keys when local CLI tools are the actual runtime dependency.

**State & Session:**
- SessionManager maintains execution state
- Config loaded and cached per session
- Progress callbacks for CLI/UI updates
- Telemetry collected throughout execution

### Testing Requirements

**Chunking:**
- Single chunk for small diffs (≤100 lines)
- Multiple chunks for large diffs (>500 lines)
- Serial execution for ≤2 chunks
- Parallel execution (pLimit(3)) for >2 chunks
- Preserve file boundaries where possible

**Cost Estimation:**
- Token count accuracy for selected models
- API pricing accuracy per provider
- Total cost = sum of chunk costs
- Edge cases: missing model pricing data

**Diff Complexity:**
- Line count calculation (additions + deletions)
- File count from diff
- Churn rate (rate of change)
- Complexity tier (simple/moderate/complex)

**Dryrun:**
- Executes L0 (model selection)
- Skips L1 (no actual API calls)
- Skips L2 (no discussion)
- Skips L3 (no final verdict)
- Returns estimated verdict based on diff analysis

**Progress Tracking:**
- Callback invoked at each stage
- Progress state: pending → executing → complete
- Percentage completion estimate
- Time elapsed / remaining

**Auto-Approval:**
- All findings marked as LOW/WARNING
- Auto-approval confidence > threshold (e.g., 0.9)
- No unconfirmed findings
- User config allows auto-approval

**Integration:**
- Full pipeline: load config → resolve reviewers → chunk diff → execute chunks → deduplicate → discuss → verdict
- Multi-chunk workflows with parallel execution
- Resume from partial state
- Compact output and degraded reason codes are cross-surface contracts for CLI, GitHub Action, MCP, sessions, and Desktop. Keep them backward compatible.

### Common Patterns

**Pipeline Execution:**
1. Load config and session
2. Normalize config (apply mode presets)
3. Estimate cost (optional)
4. Run dryrun (optional)
5. Chunk diff (adaptive parallel)
6. For each chunk:
   - L0: resolve reviewers
   - L1: execute reviewers in parallel
   - L2: deduplicate and discuss
   - L3: make verdict
7. Aggregate chunk verdicts
8. Check auto-approval
9. Emit telemetry and return report

**Chunking Strategy:**
- Target chunk size: 300-500 lines
- Adaptive concurrency:
  - 1-2 chunks: serial
  - 3+ chunks: pLimit(3) parallel
- Try to preserve file boundaries
- Each chunk independently processes L1-L3

**Cost Estimation:**
```
per_chunk_cost = (
  input_tokens * provider.input_price +
  output_tokens * provider.output_price
) * reviewers_count

total_cost = sum(all_chunk_costs)
```

**Progress Callback:**
```typescript
progress({
  phase: 'l1-reviewing',
  chunk: 2,
  totalChunks: 5,
  percentage: 40,
  elapsed: 45000,
  estimated: 112000,
})
```

**Auto-Approval Conditions:**
1. All findings severity ≤ MEDIUM
2. Confidence score > config.autoApproveThreshold
3. No unconfirmed findings
4. Config.autoApprove enabled
5. Optional: max findings threshold

**Telemetry Metrics:**
- Total execution time
- Tokens used (input + output)
- Cost incurred
- Reviewers executed (successes + failures)
- Issues found by severity
- Confidence score
- Auto-approval result

## Dependencies

### Internal (Core)
- `l0/index.ts` — resolveReviewers
- `l1/reviewer.ts` — executeReviewers
- `l2/moderator.ts` — runModerator
- `l3/verdict.ts` — makeHeadVerdict
- `config/loader.ts` — loadConfig
- `session/manager.ts` — SessionManager
- `types/config.ts` — all config types
- `types/core.ts` — ReviewOutput, ModeratorReport, HeadVerdict

### External
- `@codeagora/shared` — diff parsing, logger, utils
- `pLimit` — concurrency limiting for parallel chunk execution

<!-- MANUAL: -->

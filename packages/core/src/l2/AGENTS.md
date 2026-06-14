<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# l2 — Discussion & Debate

## Purpose
Discussion Layer moderates debate among reviewers, coordinates supporter models to challenge findings, deduplicates issues, applies threshold filtering, and produces a final moderated report. This layer adds reasoning quality and cross-reviewer consensus.

## Key Files

| File | Description |
|------|-------------|
| `moderator.ts` | Main orchestrator: coordinates discussion rounds, selects supporters, manages lifecycle |
| `threshold.ts` | Threshold filtering: removes issues with low severity/agreement |
| `deduplication.ts` | Deduplication: merges redundant findings, consolidates locations |
| `devils-advocate-tracker.ts` | Tracks which models play devil's advocate role |
| `objection.ts` | Objection handling: processes model objections, re-evaluates findings |
| `event-emitter.ts` | Event streaming: emits discussion progress events |
| `writer.ts` | Discussion report writer: formats moderator findings |

## Subdirectories
None (single layer orchestration)

## For AI Agents

### Working In This Directory

**Key Concepts:**
- **Discussion Round:** Supporters evaluate existing findings, may agree or object
- **Supporter Pool:** Models chosen from config that participate in debate
- **Deduplication:** Groups same issue reported by multiple reviewers
- **Threshold:** Minimum severity/agreement required to keep finding
- **Devil's Advocate:** Supporter assigned to challenge consensus (improve reasoning)

**API Entry Point:**
- `runModerator()` — main entry: takes evidence documents, runs discussion rounds, returns ModeratorReport
- `applyThreshold()` — filters low-severity/low-agreement issues
- `deduplicateDiscussions()` — merges redundant findings
- `ModeratorConfig.enabled === false` means unresolved discussions skip forced moderator decision and escalate directly to L3/head.

**State Management:**
- Discussion state persisted per session (for resume capability)
- Event emitter provides real-time updates to CLI/UI

### Testing Requirements

**Deduplication:**
- Same issue reported by multiple reviewers (exact match)
- Similar issues with different wording (fuzzy matching)
- Preserve all locations/line numbers
- Consolidate recommendations

**Threshold Filtering:**
- Min severity config (e.g., MEDIUM and above)
- Min agreement config (e.g., 2+ reviewers)
- Graceful removal of filtered issues

**Discussion Rounds:**
- Supporter selection based on config
- Parallel execution of supporters (Promise.allSettled)
- Objection detection and re-evaluation
- Devil's advocate assignment and enforcement

**Moderator Report:**
- Structured output with findings, discussions, verdicts
- Event emission at each stage
- Resume from partial state

**Integration:**
- Full flow: L1 evidence → dedup → threshold → discussion rounds → L3 verdict
- Presets may intentionally use one supporter plus devil's advocate for low-cost Action runs; do not assume all production configs have 2-5 supporters.

### Common Patterns

**Discussion Flow:**
1. Receive ReviewOutput[] from L1
2. Deduplicate issues across reviewers
3. Apply threshold (remove low severity/agreement)
4. Run discussion rounds (supporters challenge/confirm)
5. Consolidate objections
6. Return ModeratorReport to L3

**Supporter Coordination:**
- Pool of 2-5 models configured (typically)
- Selected based on specialty or diversity
- Each round: all supporters evaluate all findings
- Promise.allSettled for parallelism
- Partial failures handled gracefully

**Deduplication Strategy:**
- Exact match: same file + line + title
- Fuzzy match: same file + similar title
- Merge: consolidate locations, recommendations, supporters
- Preserve confidence metrics

**Threshold Logic:**
- Min severity: filter out LOW/WARNING if config requires MEDIUM+
- Min agreement: require N reviewers to flag before keeping
- Can be disabled (keep all) or strict (high threshold)

**Devil's Advocate:**
- Assigned to 1 supporter per round
- Asked to argue against consensus (strengthen reasoning)
- Objections from devil's advocate weighted equally to others
- Helps prevent groupthink

**Event Emission:**
- Round start/end events
- Finding confirmed/objected events
- Supporter response events
- Full event stream for live CLI updates

## Dependencies

### Internal (Core)
- `l1/backend.ts` — backend execution for supporters
- `types/config.ts` — ModeratorConfig, SupporterPoolConfig, AgentConfig
- `types/core.ts` — ReviewOutput, Discussion, DiscussionVerdict, ModeratorReport

### External
- `@codeagora/shared` — diff parsing, path validation, logger
- Node.js `fs/promises` — reading diff files for context
- Node.js `path` — path manipulation

<!-- MANUAL: -->

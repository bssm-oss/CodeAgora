<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-06-14 -->

# l1 — Parallel Reviewers

## Purpose
Parallel Reviewers Layer executes multiple reviewer models concurrently, each producing an evidence document. Handles multiple backends (API via Vercel AI SDK, CLI via spawn), parses reviewer responses, manages circuit breaker, and coordinates with L0 health monitoring.

## Key Files

| File | Description |
|------|-------------|
| `backend.ts` | Backend abstraction: API or CLI execution, response handling |
| `api-backend.ts` | API backend: direct Vercel AI SDK calls (deprecated; use backend.ts) |
| `reviewer.ts` | Reviewer executor: parallel batch execution, evidence document writing |
| `parser.ts` | Response parser: markdown structure → structured issue objects |
| `circuit-breaker.ts` | Circuit breaker: auto-blocks repeated failing reviewers |
| `provider-registry.ts` | Registry of available providers (OpenAI, Anthropic, Google, Groq, etc.) |
| `writer.ts` | Evidence document writer: formats review output |

## Subdirectories
None (single layer execution)

## For AI Agents

### Working In This Directory

**Key Concepts:**
- **Evidence Document:** Each reviewer produces a markdown document with ## Issue sections
- **Backend Abstraction:** API (direct SDK) vs CLI (spawn subprocess) handling
- **Circuit Breaker:** Auto-blocks providers after repeated failures (prevent cascade)
- **Parser:** Converts markdown issues into structured ReviewerFinding objects

**API Entry Point:**
- `executeReviewers()` — main entry: takes ReviewerInput[], runs all in parallel, returns ReviewOutput[]
- `parseEvidenceResponse()` — converts reviewer response to findings
- `executeBackend()` — low-level backend execution (API or CLI)
- Local CLI backends include tool-specific argument shapes. Keep Codex, Claude, OpenCode, Cursor, Antigravity, and other CLI spawn behavior covered by backend tests/smokes before declaring support.

**Concurrency Model:**
- Reviewers within a chunk: Promise.allSettled batch (concurrency 5)
- All results collected even if some fail
- Circuit breaker integrated: skips blocked providers

### Testing Requirements

**Parser:**
- Valid markdown with ## Issue sections
- Missing fields (Problem, Evidence, Severity, Suggestion) — use defaults
- Invalid severity values — default to WARNING
- Fuzzy file path matching against diff file list
- Empty response handling

**Backend Execution:**
- API backend: mock Vercel AI SDK responses
- CLI backend: mock spawn execution, validate sanitized args
- CLI backend changes should also be smoke-tested through `scripts/cli-clean-diff-smoke.mjs` where practical.
- Timeout handling (skip failed, continue with rest)
- Error responses (non-zero exit code)

**Circuit Breaker:**
- Track failure count per provider
- Block after threshold (typically 3)
- Reset on success
- Blocked providers skipped entirely

**Provider Registry:**
- All supported providers listed
- Model validation per provider
- Missing provider handling (graceful skip)

**Integration:**
- Full parallel batch execution
- Mixed success/failure scenarios
- All reviewers fail → exit with error
- Some reviewers fail → continue with rest

### Common Patterns

**Reviewer Execution Flow:**
1. Receive ReviewerConfig[] (concrete models)
2. Check circuit breaker (skip blocked)
3. Build backend execution for each reviewer
4. Execute all in parallel (Promise.allSettled)
5. Parse responses (skip unparseable)
6. Return ReviewOutput[] with findings

**Backend Selection:**
- Config specifies backend (api or cli)
- API: direct Vercel AI SDK call
- CLI: spawn process, read stdout, validate exit code
- Omit model flags for CLI model values that mean auto/default when the target CLI expects that behavior.

**Evidence Document Structure:**
```markdown
# Review of {filename}

## Issue Title
### Problem
{description}

### Evidence
{code snippet or observation}

### Severity
CRITICAL | HIGH | MEDIUM | LOW | WARNING

### Suggestion
{fix recommendation}
```

**Parser Behavior:**
- Skips malformed issue blocks (logs warning)
- Defaults unrecognized severity to WARNING
- Fuzzy file path matching (contains any suffix from diff file list)
- Concatenates multiple Problem/Evidence/Suggestion blocks if present

**Shell Safety:**
- CLI backend uses spawn() (never exec)
- Args sanitized via sanitizeShellArg() before shell execution
- No shell interpretation of model output

## Dependencies

### Internal (Core)
- `l0/health-monitor.ts` — health status tracking
- `types/config.ts` — ReviewerConfig, AgentConfig
- `types/core.ts` — ReviewOutput, ReviewerFinding

### External
- `ai` (Vercel AI SDK) — LLM provider abstraction for API backend
- `@ai-sdk/*` — provider implementations
- `@codeagora/shared` — diff parsing, path validation, logger
- Node.js `child_process.spawn` — CLI backend execution

<!-- MANUAL: -->

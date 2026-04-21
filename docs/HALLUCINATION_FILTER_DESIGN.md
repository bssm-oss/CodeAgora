# Hallucination Filter Design — 4-Layer Defense

**Date**: 2026-04-01
**Status**: Approved for Implementation
**Target**: v2.2.0 stable

---

## Problem Statement

Free-tier LLM reviewers (llama, qwen, gemma) produce high false positive rates in code review. In a test with 14 findings, 0 were valid. The existing L2 debate dismissed 5/14, but 9 hallucinations survived.

**Root Cause**: Hallucinations survive through 4 specific pipeline paths.

---

## Hallucination Survival Paths

### Path 1: HARSHLY_CRITICAL Skips Debate
HC findings are auto-escalated with 0 rounds of discussion. A hallucinated HC goes directly to the Head verdict unchallenged.

**Evidence**: d005 in test — "TypeScript Module Import Typo" at 51% confidence, 0 rounds, escalated as HC.

### Path 2: Supporters Agree Without Evidence
Supporters receive the claim but not the actual code or static analysis results. Conformity bias causes them to agree with "CRITICAL" framing.

**Evidence**: Free-MAD research (2025) — "LLMs follow majority even when wrong."

### Path 3: Findings Reference Non-Existent Code
Findings reference files not in the diff, lines outside diff hunks, or fabricated code snippets. The pipeline doesn't validate these references.

**Evidence**: `octokit/request/dist-bundle/index.js:64704` — file not in diff. `difff-classifier` — string doesn't exist in codebase.

### Path 4: Single-Reviewer Findings Pass Threshold
1/5 reviewers finding CRITICAL is enough to create a Discussion (threshold=1). The other 4 who DIDN'T find it constitute strong negative evidence that's ignored.

**Evidence**: MAD research — "90% of MAD value comes from majority voting alone."

---

## 4-Layer Filter Design

### Layer 1: Pre-Debate Hallucination Check

**When**: After L1, before L2 threshold
**Cost**: $0 (pure code, no model calls)
**Blocks**: Path 3

Programmatic validation of every evidence document. The filter has grown from 3 checks in the original design to **7 checks** as of 2026-04-20:

| # | Check | Effect |
|---|-------|--------|
| 1 | File existence | `doc.filePath` must be in diff file list → else hard-remove |
| 2 | Line range | `doc.lineRange` must overlap a diff hunk ±10 lines → else hard-remove |
| 3 | Code quote verification | Backtick-quoted code must appear in diff → fabricated > 50% → confidence × 0.5 |
| 4 | Self-contradiction | Claim of "added" vs actual removals (or vice versa) → confidence × 0.5 |
| 5 | Speculative language | Hedge markers ("may not exist", "potentially broken") → confidence × 0.7 |
| 6 | Evidence quality (#468) | 0–1 score from evidence list length + problem length + specificity markers → multiplier 0.7 + 0.3 × score |
| 7 | Finding-class prior (#468 follow-up) | Empirically FP-heavy categories (ReDoS, may-throw, missing-validation, missing-null-guard, zero-width) → per-class multiplier 0.5–0.85 |

Checks 1–2 are hard removes. Checks 3–7 apply multiplicative penalties that compound — a finding that trips speculation (×0.7) + evidence (×0.7) + class prior (×0.7) ends at 0.34× its raw confidence.

```typescript
function filterHallucinations(docs, diffContent): { filtered, removed, uncertain }
```

**Expected impact**: with all seven checks active, the 2026-04-20 baseline showed the `fp-moderator-regex` fixture's phantom CRITICAL findings moved from must-fix (100% confidence) to verify/ignore (43% or below) across multiple runs.

#### Finding-class priors table

`packages/core/src/pipeline/finding-class-scorer.ts` exports `FINDING_CLASS_PRIORS` — the one place to tune per-class multipliers. Ordered so specific classes match before `generic-potential`. Each entry maps multiple regex patterns to a single id + multiplier. To add a new class when an FP pattern emerges empirically, append a new entry with patterns matched against `issueTitle + problem`.

#### Witness-based corroboration echo dampener (#5)

`computeL1Confidence` applies an additional ×0.75 dampener when:
- 3+ co-located findings exist with non-empty evidence
- Majority share the same fingerprint (first 80 normalised chars of joined `evidence[]`)

This catches correlated-failure cascades where multiple reviewers latch onto the same superficial cue instead of corroborating independently.

### Layer 2: Corroboration Scoring

**When**: After L1, integrated with `computeL1Confidence`
**Cost**: $0 (math on existing data)
**Blocks**: Path 4

Strengthen the existing corroboration signal:

- 1/N reviewers found it → confidence penalty (× 0.5)
- 2/N found it → no change
- 3+/N found it → confidence boost (× 1.2)

**Diff size correction**: For large diffs (>500 lines), relax the penalty for single-reviewer findings — legitimate bugs in large diffs may only be caught by one specialist reviewer.

**Interaction with threshold**: Single-reviewer CRITICAL findings with penalized confidence (<20%) should NOT create Discussions — route to unconfirmed queue for Head review instead.

### Layer 3: Enhanced MAD (Debate Strengthening)

**When**: L2 discussion phase
**Cost**: $0 (same model calls, different prompts)
**Blocks**: Paths 1 and 2

#### 3a. HARSHLY_CRITICAL Debate Requirement

Remove the HC auto-escalation. All findings go through at least 1 round of debate.

- **Majority AGREE** (>50%) → HC severity preserved
- **Majority DISAGREE** (>50%) → downgrade to CRITICAL or DISMISSED
- Tie → escalate as HC (benefit of the doubt for serious claims)

**Risk mitigation**: Real HC issues (actual security vulnerabilities) will still survive because multiple models will independently corroborate them. The debate adds ~30 seconds but prevents false REJECT.

#### 3b. Adversarial Supporter Prompt

Replace agreement-seeking prompt with adversarial prompt:

```
Current: "이 이슈에 대해 동의/반대/중립?"
```

```
Improved:
"리뷰어가 다음을 주장합니다:
[claim]

실제 코드:
[code snippet from diff]

정적 분석 결과:
- tsc: [diagnostics or "이 파일에 에러 없음"]
- 파일 분류: [RENAME/LOGIC/CONFIG/...]
- 이 패턴 사용 빈도: [N회 (레포 내)]

이 주장을 검증하세요:
- 반증할 수 있다면: DISAGREE + 구체적 반증 근거
- 반증이 불가능하다면: AGREE + 왜 반증할 수 없는지 설명

양쪽 모두 구체적 근거를 제시해야 합니다."
```

Key change: Both AGREE and DISAGREE require explicit reasoning. This eliminates lazy agreement ("seems right") and forces evidence-based judgment.

#### 3c. Static Analysis Evidence in Debate

Inject Pre-Analysis results into the moderator prompt:

```
Evidence from static analysis:
- [RENAME] tagged file — identifier rename, not logic change
- tsc --noEmit: 0 errors on this file
- This import pattern (.js extension) used in 47 other files
- Changed function imported by 3 files (LOW impact)
```

This gives supporters concrete facts to reason about, reducing reliance on the claiming reviewer's framing.

### Layer 4: Post-Debate Confidence Gate

**When**: After L2, before L3 verdict
**Cost**: $0 (already partially implemented in #229/#236)
**Blocks**: Residual hallucinations

- DISMISSED → removed (already implemented)
- CRITICAL+ with avgConfidence < 15% → NEEDS_HUMAN, not REJECT (already implemented)
- Post-debate single-corroboration findings → downgrade to SUGGESTION

---

## Expected Impact

### Simulation on PR #404 Test (14 findings, 0 valid)

| Finding | Current Result | With 4-Layer Filter |
|---------|---------------|-------------------|
| `octokit/.../index.js:68453` | WARNING (survived) | Layer 1: REMOVED (file not in diff) |
| `.js import "typo"` (HC) | HC (survived, 0 rounds) | Layer 3a: debated → Layer 3c: "47 files same pattern" → DISMISSED |
| `difff-classifier` fabrication | CRITICAL (survived) | Layer 1: REMOVED (code quote not in diff) |
| `external` removal danger (HC) | HC 84% (survived) | Layer 2: 1/5 corroboration → conf penalty → Layer 3b: adversarial debate → DISMISSED |
| Various low-confidence | WARNING/CRITICAL | Layer 1 or Layer 3: REMOVED/DISMISSED |

**Expected: 14 → 0-1 survivors** (vs current 9 survivors)

### Cost Analysis

| Layer | Model Cost | Compute Cost | Implementation |
|-------|-----------|-------------|----------------|
| Layer 1 | $0 | Negligible (string ops) | 1-2 days |
| Layer 2 | $0 | Negligible (math) | Half day |
| Layer 3 | $0 | Same as current | 1-2 days |
| Layer 4 | $0 | Negligible | Already done |
| **Total** | **$0** | **Negligible** | **~4 days** |

---

## Implementation Priority

### Phase 1 (Highest ROI, ~1.5 days)
- **Layer 1**: `hallucination-filter.ts` — file/line/quote verification
- **Layer 3a**: Remove HC auto-escalation in `moderator.ts` (1 line + majority check)

### Phase 2 (~1.5 days)
- **Layer 3b**: Adversarial supporter prompt in `moderator.ts`
- **Layer 3c**: Static analysis evidence injection (Pre-Analysis → moderator prompt)

### Phase 3 (~1 day)
- **Layer 2**: Corroboration scoring enhancement in `confidence.ts`
- **Layer 4**: Post-debate gate refinements (mostly done)

---

## Academic Basis

- **Debate or Vote (NeurIPS 2025)**: 90% of MAD value from majority voting — corroboration is the key signal
- **Free-MAD (2025)**: Anti-conformity mechanism essential — adversarial prompts break conformity bias
- **Identity Bias in MAD (2025)**: Anonymization + evidence-based reasoning reduces framing effects
- **Qodo Benchmark 1.0**: Multi-agent cross-validation achieves F1 60.1% — single agent peaks at ~40%

---

## Key Design Decisions

1. **HC debate uses majority vote, not unanimous** — prevents one bad DISAGREE from suppressing real vulnerabilities
2. **Both AGREE and DISAGREE require reasoning** — eliminates lazy agreement and lazy disagreement
3. **Layer 1 hard-deletes, Layer 2 soft-penalizes** — obvious fakes are removed, borderline cases get reduced confidence
4. **Corroboration penalty scales with diff size** — large diffs may legitimately have single-reviewer findings
5. **Zero additional model cost** — all improvements from better use of existing pipeline

---

## Success Criteria

- False positive rate: 14/14 (100%) → <3/14 (<21%)
- No real bugs missed (measured by injecting known bugs into test diffs)
- Debate DISMISSED rate: 5/8 (63%) → 7/8+ (88%+)
- Zero increase in per-review cost

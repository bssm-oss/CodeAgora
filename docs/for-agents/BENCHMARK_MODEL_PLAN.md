<!-- Parent: ./BENCHMARK_MEASUREMENT_PLAN.md -->

# Benchmark Model Plan

This plan defines the benchmark tracks and model-role mapping strategy for comparing raw single-model review, Claude/Codex-only CodeAgora, and OpenRouter-only CodeAgora.

## Goals

The benchmark should compare three different review modes:

1. **Raw single review**: one model reviews a diff with a normal code-review prompt.
2. **Codex-Claude only Agora**: CodeAgora pipeline using only local Claude/Codex CLI backends.
3. **OpenRouter Agora**: CodeAgora pipeline using only OpenRouter API models.

The fixed CodeAgora topology for tracks 2 and 3 is:

| Layer | Count |
|---|---:|
| L1 reviewers | 5 |
| L2 supporters | 2 |
| Devil's advocate | 1 |
| Head | 1 |

## Track 1: Raw Single Review

Purpose: measure how well Claude/Codex perform as ordinary single-model code reviewers without CodeAgora's multi-agent protocol.

### Inputs

- Benchmark fixture `diff.patch` files.
- A short, natural code-review prompt.
- No CodeAgora reviewer protocol.
- No L2 debate.
- No head verdict.
- No rules/hallucination filter beyond later scorer mapping.

### Prompt Shape

Use a concise prompt such as:

```text
Review this diff. Focus only on real production bugs, security vulnerabilities, and logic errors introduced by the change. Ignore style, naming, and speculative concerns. If there are no actionable issues, say so clearly.

<diff>
...
</diff>
```

### Raw Models

| Target | Command shape | Known usable model |
|---|---|---|
| Claude raw | `claude -p --model <model>` | `sonnet` |
| Codex raw | `codex exec -m <model> -` | `gpt-5.5` |

### Output Plan

Store raw model outputs first:

```text
bench-out-claude-raw-<scope>/<fixture-id>.md
bench-out-codex-raw-<scope>/<fixture-id>.md
```

Then manually map raw findings into scorer-compatible JSON:

```text
bench-out-claude-raw-json-<scope>/<fixture-id>.json
bench-out-codex-raw-json-<scope>/<fixture-id>.json
```

Score mapped output with:

```bash
pnpm bench:fn -- --results ./bench-out-claude-raw-json-<scope>
pnpm bench:fn -- --results ./bench-out-codex-raw-json-<scope>
```

## Track 2: Codex-Claude Only Agora

Purpose: measure CodeAgora's multi-agent value using only local Claude/Codex CLI backends.

### Constraints

- All L1 reviewers, supporters, devil's advocate, and head must be Claude or Codex.
- No OpenRouter/API models.
- Use CodeAgora's normal L1/L2/L3 pipeline.
- Use the fixed topology: 5 reviewers, 2 supporters, 1 DA, 1 head.

### Known Local Model Choices

| Backend | Model | Status |
|---|---|---|
| `claude` | `sonnet` | Verified working locally. |
| `codex` | `gpt-5.5` | Verified working locally. |
| `claude` | `claude` | Not usable locally; model alias rejected. |
| `codex` | `codex` | Not usable locally with current account. |
| `codex` | `gpt-5`, `gpt-5.1` | Not usable locally with current account. |

### Recommended Mapping: Balanced CLI Ensemble

| Role | Backend | Model | Reason |
|---|---|---|---|
| reviewer 1 | `claude` | `sonnet` | Strong reasoning and grounded review. |
| reviewer 2 | `codex` | `gpt-5.5` | Strong coding-oriented review. |
| reviewer 3 | `claude` | `sonnet` | Adds second Claude pass for consistency. |
| reviewer 4 | `codex` | `gpt-5.5` | Adds second Codex pass for coding signal. |
| reviewer 5 | `codex` | `gpt-5.5` | Slight bias toward code-agent detection breadth. |
| supporter 1 | `claude` | `sonnet` | Good verifier/summarizer. |
| supporter 2 | `codex` | `gpt-5.5` | Good implementation-oriented challenge. |
| devil's advocate | `claude` | `sonnet` | Conservative critique and FP suppression. |
| head | `claude` | `sonnet` | Prefer stable final synthesis. |

### Alternative Mapping: Codex-Heavy

Use if Claude latency or quota becomes limiting.

| Role | Backend | Model |
|---|---|---|
| reviewers 1-4 | `codex` | `gpt-5.5` |
| reviewer 5 | `claude` | `sonnet` |
| supporter 1 | `codex` | `gpt-5.5` |
| supporter 2 | `claude` | `sonnet` |
| devil's advocate | `claude` | `sonnet` |
| head | `codex` | `gpt-5.5` |

### Result Directory Naming

```text
bench-out-agora-cli-mixed-<scope>
bench-out-agora-cli-codex-heavy-<scope>
```

## Track 3: OpenRouter Only Agora

Purpose: measure CodeAgora's multi-agent performance using OpenRouter API models only.

### Constraints

- All L1 reviewers, supporters, devil's advocate, and head must use:

```json
{ "backend": "api", "provider": "openrouter", "model": "..." }
```

- No Claude/Codex local CLI backends.
- Use fixed topology: 5 reviewers, 2 supporters, 1 DA, 1 head.

### OpenRouter Model Selection Strategy

Because OpenRouter availability and pricing change often, model IDs should be validated immediately before live runs. Use these families when available:

| Family | Role fit |
|---|---|
| Qwen Coder | Code-focused reviewer, good low-cost detection. |
| DeepSeek | Reasoning, moderation, devil's advocate, synthesis. |
| Grok Code | Fast code reviewer, useful diversity. |
| MiniMax | Low-cost diverse reviewer. |
| NVIDIA Nemotron | Diverse cheap/free reviewer. |
| Claude via OpenRouter | Quality reviewer/head if budget allows. |
| OpenAI via OpenRouter | Head/synthesis or quality reviewer if budget allows. |
| Gemini via OpenRouter | Broad reasoning diversity. |

### Variant A: Free Smoke

Purpose: zero/near-zero-cost sanity check, not final quality evidence.

Use existing baseline when available:

| Role | Model |
|---|---|
| reviewer 1 | `qwen/qwen3-coder:free` |
| reviewer 2 | `minimax/minimax-m2.5:free` |
| reviewer 3 | `nvidia/nemotron-3-super-120b-a12b:free` |
| reviewer 4 | another available free coding/reasoning model |
| reviewer 5 | another available free diverse model |
| supporter 1 | `qwen/qwen3.6-plus:free` |
| supporter 2 | another available free reasoning model |
| devil's advocate | `nvidia/nemotron-nano-9b-v2:free` or equivalent |
| head | `qwen/qwen3-30b-a3b:free` or strongest available free model |

Caveat: free models may be unavailable, rate-limited, slow, or unstable.

### Variant B: Low-Cost Diverse

Purpose: main cheap candidate.

Starting point from existing config:

| Role | Model |
|---|---|
| reviewer 1 | `qwen/qwen3-coder-30b-a3b-instruct` |
| reviewer 2 | `xiaomi/mimo-v2-flash` |
| reviewer 3 | `nvidia/nemotron-3-nano-30b-a3b:nitro` |
| reviewer 4 | `x-ai/grok-code-fast-1` |
| reviewer 5 | `minimax/minimax-m2.5` |
| supporter 1 | `baidu/ernie-4.5-21b-a3b-thinking` |
| supporter 2 | `qwen/qwen3.6-plus` |
| devil's advocate | `tencent/hunyuan-a13b-instruct` |
| head | `deepseek/deepseek-v3.2` |

### Variant C: Balanced Quality/Cost

Purpose: practical quality/cost candidate.

| Role | Model |
|---|---|
| reviewer 1 | `x-ai/grok-code-fast-1` |
| reviewer 2 | `qwen/qwen3-coder` |
| reviewer 3 | `minimax/minimax-m2.5` |
| reviewer 4 | `deepseek/deepseek-v3.2` |
| reviewer 5 | `google/gemini-2.5-flash` or current Gemini Flash equivalent |
| supporter 1 | `deepseek/deepseek-r1` or current reasoning equivalent |
| supporter 2 | `qwen/qwen3.6-plus` |
| devil's advocate | `deepseek/deepseek-r1` |
| head | `openai/gpt-5.4-mini` or current best affordable head model |

### Variant D: Quality Reference

Purpose: estimate upper-bound quality. Run only after smoke passes.

| Role | Model |
|---|---|
| reviewer 1 | strongest Claude model available on OpenRouter |
| reviewer 2 | strongest OpenAI model available on OpenRouter |
| reviewer 3 | strongest Gemini model available on OpenRouter |
| reviewer 4 | strongest DeepSeek reasoning/coding model available |
| reviewer 5 | strongest Qwen Coder model available |
| supporter 1 | strongest Claude/OpenAI reasoning model available |
| supporter 2 | strongest DeepSeek/Gemini reasoning model available |
| devil's advocate | strong reasoning model with conservative critique behavior |
| head | strongest synthesis model available and affordable |

Caveat: exact model IDs must be checked before execution.

## Run Scopes

### Smoke Scope

Use three fixtures first:

```text
authz-admin-bypass
null-deref-early-access
fp-docs-only-runbook
```

This validates:

- auth/authz recall,
- null/early access recall,
- clean docs-only FP behavior.

### Full Scope

Use all 20 golden-bug fixtures after smoke passes.

### Variance Scope

For finalist configs, run at least three times:

```text
run1
run2
run3
```

Measure TP/FP/FN variance, fixture-level pass/fail variance, latency variance, and error rate.

## Naming Convention

Use explicit result directory names:

```text
bench-out-raw-claude-smoke
bench-out-raw-codex-smoke
bench-out-agora-cli-mixed-smoke
bench-out-agora-openrouter-free-smoke
bench-out-agora-openrouter-low-cost-smoke
bench-out-agora-openrouter-balanced-smoke
bench-out-agora-openrouter-quality-smoke
```

For full runs:

```text
bench-out-agora-cli-mixed-full
bench-out-agora-openrouter-low-cost-full
bench-out-agora-openrouter-balanced-full
bench-out-agora-openrouter-quality-full
```

## Metrics To Compare

| Metric | Applies to raw | Applies to Agora |
|---|---:|---:|
| TP / FP / FN | yes, after manual mapping | yes |
| precision / recall / F1 | yes | yes |
| FP clean-rate | yes | yes |
| recall@3 / @5 / @10 | yes, after mapping rank | yes |
| wall time | yes | yes |
| total backend calls | no | yes |
| tokens | maybe, backend-dependent | maybe, backend-dependent |
| cost | maybe | maybe |
| model errors/timeouts | yes | yes |
| role impact | no | yes |

## Decision Rules

1. Do not compare raw Claude/Codex directly against OpenRouter Agora as the same product surface; they answer different questions.
2. Use raw review to estimate single-model baseline quality.
3. Use Codex-Claude only Agora to estimate local CLI multi-agent value.
4. Use OpenRouter Agora to estimate hosted/API multi-agent value.
5. Promote a config to full benchmark only if smoke passes with no FP on clean fixture and no backend errors.
6. Treat OpenRouter free results as availability/sanity evidence, not stable quality evidence.

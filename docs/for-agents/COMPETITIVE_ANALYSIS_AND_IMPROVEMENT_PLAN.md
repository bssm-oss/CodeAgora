# Competitive Analysis & Performance Improvement Plan

**Date**: 2026-04-09
**Project**: CodeAgora
**Status**: Research Complete

---

## 1. Competitive Landscape (2026)

### Service Comparison

| Service | Models | Price (Pro) | Architecture | Key Strength |
|---------|--------|-------------|-------------|-------------|
| **CodeRabbit** | OpenAI o3/o4-mini + GPT-4.1 (task routing) | $24/user/mo | Hybrid pipeline + agentic verification | 4 Git platforms, 40+ linters, sequence diagrams |
| **Qodo** | GPT-5 (default), Claude, Gemini, Mistral, Ollama | $30/user/mo | Multi-agent parallel (4 specialists) | F1 #1 (60.1%), test generation, self-hosting |
| **Greptile** | Claude Agent SDK | $30/dev/mo | Graph-based + agentic exploration | 82% bug catch rate, codebase-aware |
| **Copilot** | GPT-4.1, Pro+ Claude Opus 4.6/o3 | $10-19/mo | Single agent + CodeQL/ESLint | Zero setup, 60M+ reviews, GitHub native |
| **Graphite** | Claude (version undisclosed) | $40/user/mo | Stacked PR + single agent | Small PRs maximize AI accuracy, merge queue |

### CodeAgora's Unique Position
- **Only service with inter-reviewer debate mechanism** (L2 Discussion)
- Multi-LLM parallel review + hallucination filter + head verdict
- Weakness: diff-only context, no static analysis integration, no learning loop

---

## 2. Boosting Cheap LLM Intelligence

### 2.1 Mixture of Agents (MoA)
- **Paper**: Together AI (arXiv 2406.04692, 2024)
- **Result**: Open-source models beat GPT-4o (AlpacaEval 65.1% vs 57.5%)
- **Mechanism**: Layer cheap models; each layer sees all previous outputs as auxiliary info
- **CodeAgora**: L1->L2->L3 already maps to MoA. Explicitly inject L1 outputs into L2 prompts

### 2.2 Self-Consistency (CoT-SC)
- **Paper**: Wang et al. (ICLR 2023)
- **Result**: GSM8K +17.9%, SVAMP +11.0%, AQuA +12.2%
- **Mechanism**: Sample N reasoning paths at high temperature, majority vote
- **CodeAgora**: Run same reviewer 3x, keep only severity/location-consistent issues

### 2.3 FrugalGPT (Cascading)
- **Paper**: Chen et al. (Stanford, arXiv 2305.05176)
- **Result**: 98% cost reduction at equivalent performance, or +4% accuracy at same cost
- **Mechanism**: Cheap model first; escalate to expensive model only on low confidence
- **CodeAgora**: 60-70% of PRs are trivial -> small model handles "no issues", complex ones go to Opus

### 2.4 Self-Refine
- **Paper**: Madaan et al. (NeurIPS 2023)
- **Result**: Average +20% absolute improvement across 7 tasks
- **Mechanism**: Generate -> self-feedback -> refine loop
- **CodeAgora**: Reviewer generates draft, then self-asks "are there false positives or duplicates?"

### 2.5 Verifier/Critic Pattern
- **Paper**: DeepMind GenRM; Math-Shepherd (ACL 2024)
- **Result**: Consistently outperforms discriminative verifiers
- **CodeAgora**: Hallucination filter is deterministic critic. Extend with LLM-based verification for CRITICAL+

### 2.6 Knowledge Distillation
- **Paper**: Hinton et al. 2015; LIMA (Zhou et al. 2023)
- **Result**: 700x smaller model achieves equivalent performance; 1000 examples sufficient
- **CodeAgora**: Collect thousands of Opus reviews -> fine-tune Llama-8B for code review

### 2.7 Few-shot + Structured Output
- **Result**: Example selection causes performance swing from chance to near-SOTA
- **CodeAgora**: Switch to `generateObject()` + Zod schema. Add good/bad review examples to prompts

---

## 3. Reducing False Positives

### 3.1 Hybrid Static + LLM (HIGHEST IMPACT)
- **Paper**: SAST-Genius (arXiv 2509.15433), ZeroFalse (arXiv 2510.02534), LLM4PFA
- **Result**: **91% FP reduction** (225->20), **94-98%** in industry
- **Current**: Only tsc diagnostics
- **Action**: Add ESLint/Semgrep -> cross-validate LLM findings with static analysis

### 3.2 Chain-of-Verification (CoVe)
- **Paper**: Dhuliawala et al. (Meta, ACL Findings 2024)
- **Result**: Hallucinated entities **77% reduction** (2.95->0.68), QA F1 +23%
- **Key**: Verification must NOT see the original draft (prevents hallucination copying)
- **Action**: Add self-verification step to L1 reviewer prompts

### 3.3 Grounding Agent
- **Impl**: Greptile v3/v4
- **Result**: Comment acceptance rate **19%->55%+** (2 weeks)
- **Current**: File/line existence check only
- **Action**: For CRITICAL+, agent reads actual code snippets and validates LLM claims

### 3.4 Adversarial Validation
- **Paper**: Free-MAD (arXiv 2509.11035), DebateCV (2025)
- **Result**: SLM debate achieves GPT-4o jury-level consensus
- **Current**: L2 discussion already does this
- **Action**: Add anti-conformity mechanism to moderator (suppress majority bias)

### 3.5 Multi-Reviewer Corroboration
- **Paper**: Debate or Vote (NeurIPS 2025 Spotlight)
- **Result**: Qodo multi-agent F1 60.1% (+20%p vs single)
- **Current**: confidence.ts with corroboration scoring
- **Action**: Dynamic k/N threshold by diff size; shuffle reviewer order

### 3.6 Feedback Loop (HIGHEST LONG-TERM ROI)
- **Impl**: Greptile, CodeRabbit, Sourcery
- **Result**: Greptile acceptance rate 19%->55%+ (2 weeks)
- **Current**: Not implemented
- **Action**: Collect GitHub resolved/dismissed -> embedding clusters -> auto-suppress repeats

### 3.7 Confidence Calibration
- **Paper**: SteerConf (2025), QA-Calibration (ICLR 2025)
- **Result**: AUROC +29%, ECE -16%
- **Current**: LLM confidence weighted 0.6
- **Action**: Reduce to 0.3, increase corroboration weight

---

## 4. Improving Codebase Context Awareness

### 4.1 Tree-sitter AST (BEST COST/BENEFIT)
- **Paper**: Codebase-Memory (arXiv 2603.27277)
- **Result**: 10x token reduction vs file exploration, sub-ms queries
- **Current**: Regex-based export extraction
- **Action**: Replace with tree-sitter -> accurate symbols + call relationships

### 4.2 Code Graph
- **Impl**: Greptile, CodeGraphContext (Neo4j+MCP), FalkorDB
- **Result**: Greptile acceptance rate 30%->43%
- **Current**: grep 1-hop importer only
- **Action**: Graph DB for multi-hop impact analysis

### 4.3 Context Window Optimization
- **Impl**: Aider (PageRank + binary search)
- **Result**: Effective with just 1K tokens
- **Current**: +/-20 lines surrounding context
- **Action**: Rank symbols by importance, fill token budget optimally

### 4.4 Call Chain Extension
- **Impl**: ops-codegraph-tool (11 languages, transitive dependencies)
- **Current**: 1-hop grep
- **Action**: Extend impact-analyzer.ts to 2-3 hop DFS/BFS

### 4.5 Code RAG
- **Impl**: Voyage Code 3, hybrid BM25 + dense retrieval
- **Current**: Not implemented
- **Action**: Embed code chunks -> vector search for similar patterns/past bugs

### 4.6 Agentic Exploration (ULTIMATE GOAL)
- **Impl**: Greptile v3, Copilot Code Review (2026.03)
- **Result**: Copilot +8.1% positive feedback, Greptile 3x critical bug detection
- **Current**: Static context only
- **Action**: Give L1 reviewers tool-calling capability or agentify pre-analysis

---

## 5. Implementation Roadmap

### Phase 1: Prompt-Only Changes (1-2 days)
- [ ] Add CoVe self-verification to L1 prompts -> FP 77% reduction (hallucinations)
- [ ] Self-Consistency: 3x sampling per reviewer -> cheap model accuracy +17%
- [ ] Switch to `generateObject()` + Zod schema -> parser failure rate ~0%

### Phase 2: Extend Existing Code (1-2 weeks)
- [ ] ESLint/Semgrep static analysis cross-validation -> FP 91-98% reduction (SAST domain)
- [ ] Cascading: trivial PR small model fast-path -> 80% cost reduction
- [ ] Tree-sitter symbol extraction -> accurate call graph
- [ ] Call chain 2-3 hop extension -> quantified blast radius

### Phase 3: Architecture Extension (2-4 weeks)
- [ ] Context window optimization (PageRank-based) -> auto-inject relevant code
- [ ] Grounding agent (CRITICAL+ verification) -> acceptance rate 2-3x
- [ ] Feedback loop (dismiss pattern learning) -> long-term auto FP suppression
- [ ] Code RAG + incremental indexing -> full codebase awareness

---

## 6. Key References

### Competitive Analysis
- [CodeRabbit + OpenAI](https://openai.com/index/coderabbit/)
- [Qodo 2.0 Multi-Agent](https://www.qodo.ai/blog/introducing-qodo-2-0-agentic-code-review/)
- [Greptile v3 Agentic Review](https://www.greptile.com/blog/greptile-v3-agentic-code-review)
- [Copilot Agentic Architecture (2026.03)](https://github.blog/changelog/2026-03-05-copilot-code-review-now-runs-on-an-agentic-architecture/)
- [Graphite + Claude](https://graphite.com/blog/how-graphite-uses-claude)

### LLM Intelligence Boosting
- [Mixture of Agents (Together AI, 2024)](https://arxiv.org/abs/2406.04692)
- [Self-Consistency (Wang et al., ICLR 2023)](https://arxiv.org/abs/2203.11171)
- [FrugalGPT (Stanford, 2023)](https://arxiv.org/abs/2305.05176)
- [Self-Refine (NeurIPS 2023)](https://arxiv.org/abs/2303.17651)
- [Multi-Agent Debate (ICML 2024)](https://arxiv.org/abs/2305.14325)

### False Positive Reduction
- [SAST-Genius Hybrid (arXiv 2509.15433)](https://arxiv.org/abs/2509.15433)
- [Chain-of-Verification (Meta, ACL 2024)](https://arxiv.org/abs/2309.11495)
- [Free-MAD Anti-Conformity (2025)](https://arxiv.org/abs/2509.11035)
- [Debate or Vote (NeurIPS 2025)](https://openreview.net/forum?id=iUjGNJzrF1)
- [Qodo F1 Benchmark](https://www.qodo.ai/blog/how-we-built-a-real-world-benchmark-for-ai-code-review/)

### Codebase Context
- [Codebase-Memory Tree-sitter (arXiv 2603.27277)](https://arxiv.org/html/2603.27277v1)
- [Aider Repository Map](https://aider.chat/2023/10/22/repomap.html)
- [LocAgent Graph Reasoning (arXiv 2503.09089)](https://arxiv.org/html/2503.09089v1)
- [Repo-Level RAG Survey (arXiv 2510.04905)](https://arxiv.org/abs/2510.04905)

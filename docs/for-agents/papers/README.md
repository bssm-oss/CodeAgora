# CodeAgora 논문 프로그램 로드맵

> CodeAgora는 하나의 논문이 아니라, 여러 연구 질문과 엔지니어링 결과물이 결합된 **논문 프로그램**이다.

이 문서는 CodeAgora에서 논문화할 수 있는 주제를 체계적으로 정리한다. 목적은 “무엇을 쓸 수 있는가”를 나열하는 데 그치지 않고, 각 후보가 어떤 연구 질문을 갖는지, 어떤 기여를 주장할 수 있는지, 어떤 코드와 문서가 근거가 되는지, 어떤 실험이 추가로 필요한지를 한눈에 볼 수 있게 하는 것이다. 대부분의 개별 문서는 아직 연구 초안이며, 실제 결과표와 반복 실험이 채워지기 전까지 제품 안정성 주장으로 사용하지 않는다.

## 우선순위 체계

| 등급 | 의미 |
|------|------|
| P0 | 프로젝트의 핵심 정체성과 직접 연결되며, 가장 먼저 논문화해야 하는 주제 |
| P1 | 독립 논문으로 충분히 강하지만, P0 논문과 연결될 때 설득력이 커지는 주제 |
| P2 | 엔지니어링 사례·운영 경험·보조 실험으로 가치가 큰 주제 |
| P3 | 추후 데이터나 사용자 연구가 축적되면 논문화 가치가 커지는 주제 |

## 추천 첫 5편

1. **CodeAgora 시스템 논문**
   - 전체 구조를 먼저 정리해야 다른 논문의 공통 배경이 생긴다.
2. **환각 및 오탐 필터링 논문**
   - LLM 코드 리뷰의 가장 큰 실패 모드인 plausible false positive를 직접 다룬다.
3. **멀티 에이전트 토론 논문**
   - CodeAgora의 차별점인 L2 debate와 합의 구조를 전면에 세운다.
4. **Golden-bug 벤치마크 논문**
   - 다른 논문들의 평가 기반을 제공한다.
5. **모델 선택 및 품질 추적 논문**
   - 다중 모델 시스템의 운영성과 비용 대비 품질 문제를 다룬다.

이 다섯 편은 서로 의존한다. 시스템 논문은 전체 구조를 설명하고, 벤치마크 논문은 평가 기준을 제공하며, 필터링·토론·모델 선택 논문은 각각 품질 개선 메커니즘을 독립적으로 설명한다.

## 논문 골격 파일 목록

| 번호 | 파일 | 우선순위 |
|------|------|----------|
| 01 | [CodeAgora: 멀티-LLM 코드 리뷰 시스템 아키텍처](01-system-architecture.md) | P0 |
| 02 | [로컬 우선 코드 리뷰 도구의 설계](02-local-first-review.md) | P2 |
| 03 | [멀티 인터페이스 코드 리뷰 플랫폼](03-multi-interface-platform.md) | P2 |
| 04 | [병렬 LLM 리뷰어의 다양성과 중복 제거](04-parallel-reviewers-dedup.md) | P1 |
| 05 | [구조화된 멀티 에이전트 토론을 이용한 코드 리뷰 합의](05-structured-multi-agent-debate.md) | P0 |
| 06 | [최종 판정 에이전트와 책임 추적](06-final-verdict-accountability.md) | P1 |
| 07 | [LLM 코드 리뷰의 환각 및 오탐 필터링](07-hallucination-fp-filtering.md) | P0 |
| 08 | [신뢰도 보정과 Confidence Trace](08-confidence-trace-calibration.md) | P1 |
| 09 | [Evidence 기반 Finding Class Prior](09-finding-class-priors.md) | P1 |
| 10 | [Golden-bug Fixture를 이용한 코드 리뷰 회귀 벤치마크](10-golden-bug-benchmark.md) | P0 |
| 11 | [High-confidence Corroborated False Positive 분석](11-corroborated-false-positives.md) | P1 |
| 12 | [중앙집중형 테스트 아키텍처와 Mock LLM Backend](12-deterministic-llm-testing.md) | P2 |
| 13 | [다중 LLM Provider 추상화](13-provider-abstraction.md) | P1 |
| 14 | [모델 선택과 품질 추적](14-model-selection-quality-tracking.md) | P0 |
| 15 | [운영 복원력: Circuit Breaker, Timeout, Fallback](15-operational-resilience.md) | P1 |
| 16 | [비용 최적화와 Debate Cost Reduction](16-cost-optimization.md) | P2 |
| 17 | [Reviewer Output Parser와 JSON Schema 강제](17-reviewer-output-parser.md) | P1 |
| 18 | [모델 Capability별 프롬프트 티어링](18-prompt-tiering.md) | P1 |
| 19 | [Explainable Code Review Session](19-explainable-review-session.md) | P2 |
| 20 | [GitHub PR 리뷰 자동화와 SARIF/Inline Comment 통합](20-github-pr-automation.md) | P2 |
| 21 | [MCP 기반 IDE 통합](21-mcp-ide-integration.md) | P2 |
| 22 | [보안 리뷰 자동화와 취약점 탐지](22-security-review-automation.md) | P2 |
| 23 | [릴리스 엔지니어링과 패키지 표면 재정의](23-release-engineering.md) | P2 |
| 24 | [인간-에이전트 협업 기반 릴리스 프로세스](24-human-agent-release-process.md) | P3 |

## 추가 발견 후보: 레포 전반 탐색 후 보강

레포 전체를 다시 훑어본 결과, 기존 24편에는 포함되어 있으나 충분히 독립적으로 강조되지 않은 시스템들이 확인되었다. 아래 항목들은 바로 25번 이후 논문으로 확장하거나, 기존 논문의 보강 섹션으로 흡수할 수 있다.

| 후보 | 주제 | 핵심 질문 | 주요 앵커 | 권장 처리 |
|------|------|-----------|-----------|-----------|
| 25 | Pre-review Impact Analysis | 리뷰 전에 diff의 성격과 영향 범위를 어떻게 추정할 수 있는가? | `packages/core/src/pipeline/analyzers/diff-classifier.ts`, `packages/core/src/pipeline/analyzers/impact-analyzer.ts` | 독립 논문 또는 01 보강 |
| 26 | Session-Centric Review Platform | CLI, MCP, desktop surface를 session model 하나로 묶을 수 있는가? | `packages/core/src/session/manager.ts`, `packages/cli/src/commands/sessions.ts`, `packages/mcp/src/index.ts`, `packages/desktop/src/api/desktop-bridge.ts` | 독립 논문 권장 |
| 27 | Finding-to-PR Position Mapping | LLM finding을 GitHub PR diff 위치에 안정적으로 매핑하려면 무엇이 필요한가? | `packages/github/src/diff-parser.ts`, `packages/github/src/mapper.ts`, `packages/shared/src/utils/issue-mapper.ts` | 20 보강 또는 독립 논문 |
| 28 | Review Event Streaming | multi-agent review pipeline의 진행 상황을 desktop-local UI나 향후 plugin integration으로 어떻게 흘릴 수 있는가? | `packages/core/src/pipeline/progress.ts`, `packages/desktop/src/api/desktop-bridge.ts` | 19/03 보강 또는 독립 문서 |
| 29 | Learning Rules and Review Memory | 조직별 규칙과 학습된 패턴을 리뷰 파이프라인에 어떻게 주입할 수 있는가? | `packages/core/src/learning/store.ts`, `packages/core/src/rules/loader.ts` | 독립 논문 후보 |
| 30 | Desktop Review Cockpit | desktop UI가 코드 리뷰 setup, progress, diff, debate 탐색을 어디까지 지원할 수 있는가? | `packages/desktop/src/main.ts`, `packages/desktop/src/api/desktop-bridge.ts`, `docs/archived/DESKTOP_APP_CONSOLIDATION.md` | UX case study |
| 31 | Desktop Observability | desktop UI가 multi-agent review observability를 어떻게 제공하는가? | `packages/desktop/src/main.ts`, `packages/desktop/src/api/desktop-bridge.ts`, `docs/archived/DESKTOP_APP_CONSOLIDATION.md` | 03/19 보강 또는 독립 논문 |
| 32 | Package Surface Governance | public package surface를 release engineering의 API contract로 관리할 수 있는가? | `.github/workflows/release.yml`, `action.yml`, `package.json`, `docs/release-alpha2-paper.md` | 23 보강 |

### 추가 후보 우선순위

1. **26 Session-Centric Review Platform**: 제품 표면 전체를 하나로 묶는 강한 시스템 논문 후보다. 기존 03, 19, 21을 연결하는 umbrella가 될 수 있다.
2. **25 Pre-review Impact Analysis**: LLM 호출 이전의 deterministic analysis 계층을 보여준다. hallucination filtering과 함께 “LLM 이전/이후 guardrail” 논문으로 묶을 수 있다.
3. **27 Finding-to-PR Position Mapping**: GitHub 통합의 어려운 핵심 문제다. LLM output을 실제 review comment 위치로 옮기는 practical systems contribution이다.
4. **29 Learning Rules and Review Memory**: 조직별 리뷰 정책과 장기 학습을 연결할 수 있어, 향후 CodeAgora의 차별점이 될 수 있다.
5. **31 Desktop Observability**: multi-agent review를 사람이 이해 가능한 local runtime으로 보여주는 UX/observability 논문 후보다.

---

## A. 시스템 및 아키텍처

### 1. CodeAgora: 멀티-LLM 코드 리뷰 시스템 아키텍처

- **핵심 질문**: 다수의 LLM을 병렬 리뷰어, 토론자, 최종 판정자로 구성하면 코드 리뷰 시스템을 어떻게 설계할 수 있는가?
- **기여**: Pre-analysis, L0 모델 지능, L1 병렬 리뷰, hallucination/evidence filter, L2 debate, L3 verdict로 이어지는 계층적 파이프라인 정식화.
- **근거/소스**: `docs/for-agents/ARCHITECTURE.md`, `docs/for-agents/1_PRD.md`, `docs/3_V3_DESIGN.md`, `README.md`.
- **필요 평가**: 단일 모델 리뷰, 단순 majority vote, CodeAgora 전체 파이프라인의 결과 비교.
- **우선순위**: P0.

### 2. 로컬 우선 코드 리뷰 도구의 설계

- **핵심 질문**: 서버 중심 SaaS가 아니라 로컬 CLI와 `.ca/` 세션 저장소 중심으로 코드 리뷰 자동화를 제공하면 어떤 장단점이 있는가?
- **기여**: API 키 로컬 보관, 세션 로컬 저장, GitHub Actions 선택적 통합, privacy/security trade-off 정리.
- **근거/소스**: `docs/for-users/CONFIGURATION.md`, `docs/for-agents/ARCHITECTURE.md`, `docs/for-users/TROUBLESHOOTING.md`.
- **필요 평가**: 로컬 저장 방식의 위협 모델, 사용자 설정 실패 사례, 서버 기반 도구와의 비교.
- **우선순위**: P2.

### 3. 멀티 인터페이스 코드 리뷰 플랫폼

- **핵심 질문**: CLI, GitHub Action, MCP, desktop app을 하나의 코드 리뷰 경험으로 통합하려면 어떤 경계가 필요한가?
- **기여**: 동일한 파이프라인을 여러 사용자 인터페이스로 노출하는 distribution architecture.
- **근거/소스**: `docs/for-users/EXTENSIONS.md`, `docs/archived/DESKTOP_APP_CONSOLIDATION.md`, `docs/for-users/5_GITHUB_INTEGRATION.md`, `docs/archived/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md`.
- **필요 평가**: 인터페이스별 사용 시나리오, 동일 세션 재사용성, UX friction 분석.
- **우선순위**: P2.

---

## B. 멀티 에이전트 리뷰와 토론

### 4. 병렬 LLM 리뷰어의 다양성과 중복 제거

- **핵심 질문**: 여러 모델이 독립적으로 리뷰할 때 발견 다양성은 증가하는가, 중복과 노이즈는 어떻게 제어할 수 있는가?
- **기여**: L1 reviewer fan-out, finding normalization, deduplication, reviewer role 분리.
- **근거/소스**: `docs/for-agents/ARCHITECTURE.md`, `src/tests/l1-*`, `src/tests/l2-dedup*`.
- **필요 평가**: reviewer 수별 unique finding, duplicate rate, false positive 변화.
- **우선순위**: P1.

### 5. 구조화된 멀티 에이전트 토론을 이용한 코드 리뷰 합의

- **핵심 질문**: 단순 투표보다 구조화된 반론과 지지 토론이 코드 리뷰 판정 품질을 개선하는가?
- **기여**: L2 moderator, supporter pool, objection round, forced decision schema를 통한 debate protocol.
- **근거/소스**: `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`, `docs/for-agents/ARCHITECTURE.md`, `src/tests/l2-*`.
- **필요 평가**: no-debate baseline, majority-vote baseline, L2 debate 결과의 precision/recall 및 설명력 비교.
- **우선순위**: P0.

### 6. 최종 판정 에이전트와 책임 추적

- **핵심 질문**: 다수 리뷰와 토론 결과를 최종 verdict로 합성할 때 어떤 정보가 보존되어야 하는가?
- **기여**: L3 verdict, top issues, final summary, ACCEPT/REJECT/NEEDS_HUMAN 판정 구조.
- **근거/소스**: `docs/for-agents/ARCHITECTURE.md`, `src/tests/l3-*`, `src/tests/pipeline-*`.
- **필요 평가**: verdict stability, 사람이 보는 triage usefulness, top issue ordering 품질.
- **우선순위**: P1.

---

## C. 환각, 오탐, 신뢰도

### 7. LLM 코드 리뷰의 환각 및 오탐 필터링

- **핵심 질문**: LLM이 실제 diff에 없는 문제를 그럴듯하게 주장하는 현상을 어떻게 줄일 수 있는가?
- **기여**: file/line validation, evidence quality scoring, speculation penalty, no-issues log gating, lonely high-severity dampener.
- **근거/소스**: `docs/for-agents/HALLUCINATION_FILTER_DESIGN.md`, `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`, `src/tests/learning-filter*`, `src/tests/confidence*`.
- **필요 평가**: 필터 전후 false positive rate, high-severity hallucination 감소, recall 손실 분석.
- **우선순위**: P0.

### 8. 신뢰도 보정과 Confidence Trace

- **핵심 질문**: LLM 리뷰 결과의 confidence를 단일 점수가 아니라 추적 가능한 보정 과정으로 표현할 수 있는가?
- **기여**: confidence trace, active participants denominator, corroboration, model-specific multiplier, L2-adjustment 기록.
- **근거/소스**: `src/tests/confidence*`, `src/tests/l2-*`, `docs/for-agents/ARCHITECTURE.md`.
- **필요 평가**: calibration curve, expected calibration error, confidence와 실제 correctness의 상관관계.
- **우선순위**: P1.

### 9. Evidence 기반 Finding Class Prior

- **핵심 질문**: finding type, witness, evidence strength를 이용해 리뷰 결과의 사전확률을 조정할 수 있는가?
- **기여**: finding-class priors, witness-based corroboration, missing-null-guard prior, artifact pattern prior.
- **근거/소스**: 최근 `feat(filter)`/`feat(chunker)` 커밋 계열, `docs/for-agents/ARCHITECTURE.md`, 관련 테스트.
- **필요 평가**: class별 precision/recall, prior ablation, prior가 recall을 손상시키는 사례 분석.
- **우선순위**: P1.

---

## D. 벤치마크와 평가

### 10. Golden-bug Fixture를 이용한 코드 리뷰 회귀 벤치마크

- **핵심 질문**: LLM 코드 리뷰 품질을 재현 가능하게 측정하려면 어떤 fixture와 scoring 체계가 필요한가?
- **기여**: recall cases, FP regression cases, expectedFindings schema, precomputed result scoring, live pipeline scoring.
- **근거/소스**: `benchmarks/golden-bugs/`, `README.md` benchmark section, `src/tests/*bench*`.
- **필요 평가**: recall@k, FP per fixture, seed fixture 확장, model/provider별 비교.
- **우선순위**: P0.

### 11. High-confidence Corroborated False Positive 분석

- **핵심 질문**: 여러 모델이 같은 잘못된 주장을 강화할 때, 합의 기반 시스템은 어떻게 실패하는가?
- **기여**: 단순 corroboration의 한계, high-confidence FP blind spot, FP regression fixture 설계.
- **근거/소스**: `README.md` baseline section, `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`, golden-bug FP fixtures.
- **필요 평가**: corroboration-only baseline, evidence-filtered corroboration, debate-enabled filtering 비교.
- **우선순위**: P1.

### 12. 중앙집중형 테스트 아키텍처와 Mock LLM Backend

- **핵심 질문**: 비결정적인 LLM 시스템을 어떻게 결정적으로 테스트할 수 있는가?
- **기여**: `src/tests/` 중앙집중형 테스트, pattern-based mock backend, E2E fork isolation, 3000+ 테스트 운영 경험.
- **근거/소스**: `src/AGENTS.md`, `src/tests/AGENTS.md`, `src/tests/helpers/mock-backend.ts`.
- **필요 평가**: test flake rate, mock fidelity, 실제 provider와 mock 결과 차이.
- **우선순위**: P2.

---

## E. 모델 선택, 프로바이더, 운영 안정성

### 13. 다중 LLM Provider 추상화

- **핵심 질문**: API backend와 CLI backend를 함께 사용하는 코드 리뷰 시스템에서 provider 차이를 어떻게 추상화할 수 있는가?
- **기여**: Vercel AI SDK 기반 API provider, CLI provider, provider registry, 환경 변수 로딩, graceful fallback.
- **근거/소스**: `docs/for-users/PROVIDERS.md`, `docs/for-agents/ARCHITECTURE.md`, `src/tests/l1-provider*`, `src/tests/providers-env-vars*`.
- **필요 평가**: provider별 latency/cost/availability, provider failure 시 recovery.
- **우선순위**: P1.

### 14. 모델 선택과 품질 추적

- **핵심 질문**: 모델의 건강 상태와 과거 품질을 이용해 리뷰어를 동적으로 선택할 수 있는가?
- **기여**: L0 model registry, health monitor, quality tracker, multi-armed bandit, capability tiering.
- **근거/소스**: `src/tests/l0-*`, `docs/for-users/PROVIDERS.md`, `docs/for-agents/ARCHITECTURE.md`.
- **필요 평가**: static model selection 대비 품질/비용/실패율 변화.
- **우선순위**: P0.

### 15. 운영 복원력: Circuit Breaker, Timeout, Fallback

- **핵심 질문**: LLM provider 장애와 응답 지연을 코드 리뷰 파이프라인이 어떻게 견딜 수 있는가?
- **기여**: circuit breaker, reviewer timeout, fallback model, Promise.allSettled 기반 partial success.
- **근거/소스**: `src/tests/l1-circuit-breaker*`, `src/tests/l1-reviewer-timeout*`, `src/tests/l1-reviewer-fallback*`.
- **필요 평가**: 장애 주입 실험, partial result quality, timeout budget sensitivity.
- **우선순위**: P1.

### 16. 비용 최적화와 Debate Cost Reduction

- **핵심 질문**: 멀티 모델·멀티 라운드 리뷰의 비용을 어떻게 제한하면서 품질을 유지할 수 있는가?
- **기여**: cheap/free provider 우선순위, reviewer budget, debate round reduction, cost tracking.
- **근거/소스**: `docs/for-users/PROVIDERS.md`, `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`, `src/tests/pipeline-cost*`.
- **필요 평가**: cost-quality Pareto curve, provider mix ablation, debate round ablation.
- **우선순위**: P2.

---

## F. 파서, 프롬프트, 설명 가능성

### 17. Reviewer Output Parser와 JSON Schema 강제

- **핵심 질문**: 자유형 LLM 리뷰 출력을 안정적인 finding schema로 변환하려면 어떤 파서 전략이 필요한가?
- **기여**: JSON output mode, schema validation, parser fallback, unparseable response debug preview.
- **근거/소스**: `src/tests/l1-parser*`, `src/tests/l2-parser-rewrite*`, 최근 `feat(parser)` 계열 커밋.
- **필요 평가**: parser success rate, malformed output recovery, provider/model별 format compliance.
- **우선순위**: P1.

### 18. 모델 Capability별 프롬프트 티어링

- **핵심 질문**: 모델 능력에 따라 reviewer prompt를 다르게 설계하면 비용 대비 품질이 개선되는가?
- **기여**: tiered reviewer prompt, model capability classifier, prompt specialization.
- **근거/소스**: 최근 `feat(prompt)` 커밋, `src/tests/l0-family-classifier*`, `docs/for-users/PROVIDERS.md`.
- **필요 평가**: 동일 모델군에서 prompt tier별 품질/비용/latency 비교.
- **우선순위**: P1.

### 19. Explainable Code Review Session

- **핵심 질문**: 자동 코드 리뷰가 왜 특정 finding을 채택·기각했는지 추적 가능한가?
- **기여**: session history, `explain_session`, confidence trace viewer, discussion trace, top issue provenance.
- **근거/소스**: `docs/for-users/EXTENSIONS.md`, `docs/archived/DESKTOP_APP_CONSOLIDATION.md`, `src/tests/cli-sessions*`, `src/tests/session*`, `src/tests/confidence*`.
- **필요 평가**: explanation usefulness, debugging time reduction, human reviewer agreement.
- **우선순위**: P2.

---

## G. 통합, 보안, 릴리스

### 20. GitHub PR 리뷰 자동화와 SARIF/Inline Comment 통합

- **핵심 질문**: LLM 코드 리뷰 결과를 GitHub PR 워크플로우에 자연스럽게 통합하려면 어떤 출력 형식이 필요한가?
- **기여**: PR diff parsing, inline review comment, status check, SARIF output, skip label.
- **근거/소스**: `docs/for-users/5_GITHUB_INTEGRATION.md`, `src/tests/github-*`, `action.yml`.
- **필요 평가**: annotation precision, developer triage time, CI failure policy 비교.
- **우선순위**: P2.

### 21. MCP 기반 IDE 통합

- **핵심 질문**: 코드 리뷰 파이프라인을 MCP tool set으로 노출하면 AI IDE에서 어떤 상호작용이 가능해지는가?
- **기여**: `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, config tools로 구성된 MCP interface.
- **근거/소스**: `docs/for-users/EXTENSIONS.md`, `packages/mcp/`, `src/tests/sprint6-mcp*`.
- **필요 평가**: IDE 워크플로우 latency, tool granularity, quick/full review UX 비교.
- **우선순위**: P2.

### 22. 보안 리뷰 자동화와 취약점 탐지

- **핵심 질문**: LLM 기반 코드 리뷰가 보안 취약점 탐지에서 어떤 강점과 한계를 갖는가?
- **기여**: security persona, SARIF mapping, severity calibration, evidence requirement.
- **근거/소스**: `src/tests/github-sarif*`, `src/tests/l1-reviewer*`, `docs/for-agents/HALLUCINATION_FILTER_DESIGN.md`.
- **필요 평가**: security benchmark, CWE별 precision/recall, severity misclassification 분석.
- **우선순위**: P2.

### 23. 릴리스 엔지니어링과 패키지 표면 재정의

- **핵심 질문**: 복잡한 monorepo CLI/MCP 프로젝트에서 공개 패키지 표면을 어떻게 안정적으로 재정의하고 배포할 수 있는가?
- **기여**: legacy 2.x에서 `@codeagora/review`/`@codeagora/mcp` alpha surface로 전환, SHA-pinned release workflow, clean install smoke, tag recovery.
- **근거/소스**: `docs/release-alpha2-paper.md`, `.github/workflows/release.yml`, `package.json`, `packages/mcp/package.json`.
- **필요 평가**: release failure taxonomy, pre-publish smoke effectiveness, package install success rate.
- **우선순위**: P2.

### 24. 인간-에이전트 협업 기반 릴리스 프로세스

- **핵심 질문**: 인간 의사결정과 에이전트 실행을 결합하면 릴리스 검증 및 복구를 어떻게 수행할 수 있는가?
- **기여**: human-in-the-loop approval, agent-assisted diagnosis, failed tag rerun strategy, verification checklist.
- **근거/소스**: `docs/release-alpha2-paper.md`, v0.1.0-alpha.2 release process.
- **필요 평가**: 수동 릴리스 대비 오류 발견 속도, 복구 시간, 의사결정 로그 분석.
- **우선순위**: P3.

---

## 논문 묶음 간 의존 관계

| 선행 논문 | 후속 논문 |
|----------|----------|
| 시스템 아키텍처 | L1/L2/L3, UX, MCP, GitHub 통합 |
| Golden-bug 벤치마크 | 환각 필터, confidence calibration, 모델 선택 |
| 환각 필터 | high-confidence FP, 보안 리뷰 자동화 |
| 모델 선택 | 비용 최적화, 운영 복원력 |
| 릴리스 엔지니어링 | 인간-에이전트 릴리스 프로세스 |

## 각 후보를 실제 논문으로 바꾸는 템플릿

각 논문은 다음 다섯 요소가 채워져야 한다.

1. **Claim**
   - 이 논문이 주장하는 한 문장. 예: “구조화된 L2 debate는 단순 투표보다 high-severity false positive를 줄인다.”
2. **Method**
   - 알고리즘, 파이프라인, 시스템 구조, 구현 세부사항.
3. **Evidence**
   - 코드, 테스트, 문서, 벤치마크 fixture, release run, session trace.
4. **Experiment**
   - baseline, ablation, benchmark, user study, failure injection 중 최소 하나.
5. **Threats to Validity**
   - fixture 규모, 모델 편향, provider drift, 실제 사용자 데이터 부족, 재현성 한계.

## 공통 평가 지표 후보

| 영역 | 지표 |
|------|------|
| 리뷰 품질 | precision, recall@k, false positive rate, false negative rate |
| 신뢰도 | calibration error, confidence/correctness correlation |
| 토론 | disagreement resolution rate, accepted/rejected finding accuracy |
| 운영 | latency, timeout rate, provider failure recovery rate |
| 비용 | tokens, API cost, cost per accepted finding |
| UX | time-to-triage, explanation helpfulness, rerun frequency |
| 릴리스 | smoke pass rate, publish failure point, recovery time |

## 참고 문서와 소스 앵커

- `docs/for-agents/ARCHITECTURE.md`
- `docs/for-agents/1_PRD.md`
- `docs/3_V3_DESIGN.md`
- `docs/for-users/5_GITHUB_INTEGRATION.md`
- `docs/archived/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md`
- `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`
- `docs/for-agents/HALLUCINATION_FILTER_DESIGN.md`
- `docs/for-users/PROVIDERS.md`
- `docs/for-users/EXTENSIONS.md`
- `docs/archived/DESKTOP_APP_CONSOLIDATION.md`
- `docs/release-alpha2-paper.md`
- `benchmarks/golden-bugs/`
- `src/tests/`
- `packages/mcp/`
- `.github/workflows/`

## 운영 원칙

- 논문 후보는 기능 설명이 아니라 연구 질문으로 시작한다.
- 숫자는 실제 실험으로 얻은 것만 사용한다.
- “새롭다”보다 “측정 가능하다”를 우선한다.
- 시스템 논문은 넓게, 후속 논문은 좁고 깊게 쓴다.
- 모든 논문은 최소 하나의 재현 가능한 benchmark 또는 test anchor를 가져야 한다.

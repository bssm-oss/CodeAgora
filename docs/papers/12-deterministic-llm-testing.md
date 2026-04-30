# 중앙집중형 테스트 아키텍처와 Mock LLM Backend

## 초록 초안

본 논문은 비결정적인 LLM 기반 시스템을 결정적으로 테스트하기 위한 CodeAgora의 테스트 아키텍처를 다룬다. CodeAgora는 중앙집중형 `src/tests/` 구조와 pattern-based mock backend를 사용하여 pipeline, parser, provider, TUI, GitHub integration을 반복 가능하게 검증한다.

## 핵심 연구 질문

비결정적인 LLM 시스템을 어떻게 결정적으로 테스트할 수 있는가?

## 주장

LLM 시스템 테스트는 실제 모델 호출에 의존하지 않는 deterministic mock layer와, 실제 provider를 대상으로 하는 별도 smoke/live gate를 분리해야 한다.

## 방법

- pattern-based mock backend를 사용한다.
- L0-L3, CLI, GitHub, TUI 테스트를 중앙에서 관리한다.
- E2E 테스트는 fork pool로 격리한다.
- release smoke는 실제 packaged artifact를 대상으로 수행한다.

## 근거와 소스 앵커

- `src/AGENTS.md`
- `src/tests/AGENTS.md`
- `src/tests/helpers/mock-backend.ts`
- `vitest.config.ts`

## 실험 설계

- mock 기반 테스트와 live smoke의 failure detection 비교.
- flake rate 측정.
- mock response coverage 분석.

## 타당성 위협

- mock은 실제 모델의 format drift를 완전히 반영하지 못한다.
- 테스트 수가 많아도 실제 사용 시나리오가 빠질 수 있다.

## 작성 TODO

- test taxonomy 작성.
- mock backend API 설명.
- release failure case와 연결.

## 확장 본문 초안

LLM 시스템 테스트의 난점은 모델 출력이 비결정적이라는 데 있다. 같은 prompt라도 시간, provider, model version, temperature, backend 상태에 따라 응답이 달라질 수 있다. 이런 시스템을 실제 provider 호출에만 의존해 테스트하면 CI는 느리고 비싸며 flaky해진다. CodeAgora의 테스트 아키텍처는 deterministic mock backend와 live smoke를 분리해 이 문제를 다룬다.

중앙집중형 `src/tests/` 구조는 각 package 옆에 테스트를 흩어 놓지 않고, 기능 영역별로 L0, L1, L2, L3, config, CLI, GitHub, pipeline, TUI 테스트를 관리한다. 이 구조는 cross-package behavior를 검증하기 쉽고, vitest 설정과 alias resolution을 한 곳에서 관리할 수 있게 한다. Mock LLM backend는 prompt pattern에 따라 deterministic response를 반환하여 parser, reviewer, moderator, verdict logic을 안정적으로 테스트한다.

Deterministic test가 모든 문제를 잡을 수는 없다. 실제 provider의 output drift, rate limit, packaging 문제는 mock으로 재현하기 어렵다. 따라서 release 단계에서는 `npm pack` 후 clean install smoke, published package smoke, targeted live checks가 필요하다. 이 분리는 “빠른 결정적 회귀 테스트”와 “느리지만 실제 환경을 반영하는 smoke test”의 역할을 명확히 한다.

평가는 flake rate, test runtime, mock coverage, live smoke failure detection을 중심으로 할 수 있다. 또한 parser failure 사례를 mock fixture로 축적하면 과거 provider drift를 회귀 테스트로 고정할 수 있다. 이 논문은 LLM application engineering에서 테스트 가능성을 확보하는 실무적 기여를 제공한다.

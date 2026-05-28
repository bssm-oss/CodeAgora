# 다중 LLM Provider 추상화

## 초록 초안

본 논문은 CodeAgora가 API backend와 CLI backend를 함께 지원하기 위해 사용하는 provider abstraction을 다룬다. 다양한 provider는 인증, latency, 비용, 모델명, 실패 방식이 다르므로, 코드 리뷰 파이프라인은 provider 차이를 격리하면서도 모델별 특성을 활용해야 한다.

## 핵심 연구 질문

API backend와 CLI backend를 함께 사용하는 코드 리뷰 시스템에서 provider 차이를 어떻게 추상화할 수 있는가?

## 주장

provider abstraction은 단순한 SDK wrapper가 아니라, 인증, health, capability, fallback, cost 정보를 함께 관리하는 운영 계층이어야 한다.

## 방법

- provider registry로 모델과 provider를 등록한다.
- Vercel AI SDK provider와 CLI backend를 분리한다.
- 환경 변수와 credentials를 표준화한다.
- fallback과 graceful degradation을 지원한다.

## 근거와 소스 앵커

- `docs/for-users/PROVIDERS.md`
- `docs/for-agents/ARCHITECTURE.md`
- `src/tests/l1-provider*`
- `src/tests/providers-env-vars*`

## 실험 설계

- provider별 latency, cost, failure rate 측정.
- provider 장애 주입 실험.
- API backend와 CLI backend 결과 비교.

## 타당성 위협

- provider 정책과 모델 목록이 빠르게 변한다.
- 동일 모델명이라도 provider별 동작이 다를 수 있다.

## 작성 TODO

- provider registry schema 정리.
- provider capability matrix 작성.
- failure taxonomy 추가.

## 확장 본문 초안

### 1. 서론

LLM 코드 리뷰 시스템에서 provider 추상화는 단순히 여러 API 클라이언트를 하나의 함수로 감싸는 문제가 아니다. 코드 리뷰는 비용, 응답 시간, 모델 가용성, 출력 형식, 인증 방식, 실패 복구 정책이 모두 결과 품질에 영향을 주는 복합적 작업이다. 특히 CodeAgora처럼 병렬 리뷰어와 토론 계층을 갖는 시스템에서는 provider 하나의 실패가 전체 파이프라인 실패로 이어지지 않아야 한다. 따라서 provider abstraction은 모델 호출 인터페이스뿐 아니라 모델 메타데이터, provider health, credential discovery, fallback 가능성, 출력 정규화 가능성을 함께 다루는 운영 계층이어야 한다.

CodeAgora의 설계는 API backend와 CLI backend를 동시에 고려한다. API backend는 Vercel AI SDK 계열 provider를 통해 OpenAI, Anthropic, Google, Groq, OpenRouter 등 다양한 모델을 호출할 수 있게 하며, CLI backend는 Claude Code, Gemini CLI, Codex CLI 같은 로컬/구독형 도구를 리뷰어로 편입한다. 이 이중 구조는 단일 SDK 기반 시스템보다 복잡하지만, 실제 개발 환경에서 사용 가능한 모델 자원을 더 넓게 활용할 수 있다는 장점이 있다.

### 2. 문제 배경

Provider마다 실패 방식은 다르다. 어떤 provider는 rate limit을 반환하고, 어떤 provider는 긴 대기 후 timeout을 유발하며, 어떤 CLI backend는 인증되지 않은 상태에서 interactive prompt를 요구할 수 있다. 또한 동일한 이름의 모델이라도 provider별 context window, output style, pricing, availability가 다를 수 있다. 이런 차이를 L1 reviewer 코드가 직접 처리하면 reviewer 구현은 provider-specific 조건문으로 오염되고, 새로운 provider 추가 비용이 커진다.

따라서 provider abstraction은 세 가지 경계를 제공해야 한다. 첫째, 호출 경계는 prompt와 model request를 표준화한다. 둘째, 운영 경계는 health, timeout, retry, fallback을 표준화한다. 셋째, 의미 경계는 모델의 capability, expected output format, role suitability를 표준화한다. CodeAgora의 provider registry와 관련 테스트는 이 세 경계를 분리하는 방향으로 설계되어 있다.

### 3. 시스템 설계

CodeAgora에서 provider abstraction은 모델 선택 계층과 reviewer 실행 계층 사이에 위치한다. L0는 후보 모델의 health와 quality signal을 바탕으로 reviewer 구성을 제안하고, L1은 provider abstraction을 통해 실제 backend를 실행한다. 이때 provider registry는 모델명, provider 종류, backend type, environment variable 요구사항, capability tier를 연결하는 역할을 한다.

API backend는 공통 message/request 형태로 정규화될 수 있지만, CLI backend는 process spawning, stdin/stdout 처리, timeout, output capture가 필요하다. 이 차이를 감추기 위해 CodeAgora는 backend execution을 reviewer logic과 분리한다. reviewer는 “이 모델에게 이 역할의 리뷰를 요청한다”는 의도만 표현하고, provider layer는 해당 요청이 API 호출인지 CLI 실행인지 결정한다.

### 4. 평가 계획

본 논문의 평가는 세 축으로 구성할 수 있다. 첫째, 확장성 평가는 새로운 provider를 추가할 때 수정해야 하는 파일과 테스트 수를 측정한다. 둘째, 운영성 평가는 provider 장애 주입 시 pipeline이 partial success로 종료되는지, fallback이 작동하는지 확인한다. 셋째, 품질 평가는 동일 diff를 여러 provider 조합으로 리뷰하여 finding diversity, latency, cost를 비교한다.

### 5. 논의

Provider abstraction은 모든 차이를 지워서는 안 된다. 모델과 provider의 차이는 리뷰 품질에 실제로 영향을 주므로, abstraction은 차이를 숨기기보다 안전하게 표현해야 한다. 예를 들어 capability tier, context limit, cost class는 상위 계층이 알아야 하는 정보다. 이 점에서 CodeAgora의 provider abstraction은 uniform interface와 provider metadata 사이의 균형을 추구한다.

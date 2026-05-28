# 운영 복원력: Circuit Breaker, Timeout, Fallback

## 초록 초안

본 논문은 LLM provider 장애와 지연에 대응하는 CodeAgora의 운영 복원력 설계를 다룬다. 외부 모델 API와 CLI backend는 timeout, rate limit, auth failure, malformed output 등 다양한 실패를 일으킨다. CodeAgora는 circuit breaker, timeout, fallback, partial success 처리를 통해 리뷰 파이프라인을 중단 없이 진행한다.

## 핵심 연구 질문

LLM provider 장애와 응답 지연을 코드 리뷰 파이프라인이 어떻게 견딜 수 있는가?

## 주장

LLM 코드 리뷰 파이프라인은 모든 reviewer의 성공을 가정해서는 안 되며, partial result를 유효한 품질 신호로 처리해야 한다.

## 방법

- reviewer별 timeout을 설정한다.
- 실패 provider에 circuit breaker를 적용한다.
- fallback model을 사용한다.
- `Promise.allSettled` 방식으로 partial completion을 수용한다.
- failure를 session trace에 기록한다.

## 근거와 소스 앵커

- `src/tests/l1-circuit-breaker*`
- `src/tests/l1-reviewer-timeout*`
- `src/tests/l1-reviewer-fallback*`
- `docs/for-agents/ARCHITECTURE.md`

## 실험 설계

- provider failure injection.
- timeout budget sensitivity analysis.
- partial result 품질 평가.

## 타당성 위협

- synthetic failure가 실제 provider 장애와 다를 수 있다.
- partial success가 실제 bug recall을 낮출 수 있다.

## 작성 TODO

- failure state diagram 작성.
- fallback policy table 작성.
- 장애 주입 테스트 결과 정리.

## 확장 본문 초안

### 1. 서론

LLM 기반 코드 리뷰 파이프라인은 외부 시스템 의존성이 높다. API provider는 rate limit, transient outage, authentication error를 발생시킬 수 있고, CLI backend는 local binary absence, interactive prompt, process hang을 유발할 수 있다. CodeAgora처럼 여러 reviewer를 병렬 실행하는 시스템은 이런 실패를 전체 실패로 취급하면 실용성이 크게 떨어진다. 운영 복원력의 핵심은 일부 reviewer가 실패해도 나머지 evidence를 바탕으로 유효한 결과를 산출하는 것이다.

본 논문은 CodeAgora의 circuit breaker, timeout, fallback, partial success 설계를 정리한다. 이 설계는 LLM call을 deterministic function처럼 가정하지 않고, 실패 가능한 distributed operation으로 취급한다. 따라서 리뷰 품질뿐 아니라 failure containment와 recovery path가 시스템의 핵심 품질 속성이 된다.

### 2. 문제 배경

기존 CI 작업은 컴파일이나 테스트처럼 성공/실패가 명확한 작업을 수행한다. 반면 LLM 리뷰는 여러 외부 모델 호출을 포함하고, 각 호출은 독립적으로 실패할 수 있다. 모든 reviewer가 성공할 때만 pipeline을 진행하면 availability가 급격히 낮아진다. 반대로 실패를 무시하면 중요한 reviewer의 부재가 결과 품질을 왜곡할 수 있다.

CodeAgora는 이 문제를 partial success와 traceable failure로 다룬다. reviewer 실패는 숨겨지지 않고 session trace와 summary에 반영되어야 하며, L2와 L3는 참여한 reviewer 수와 active participant denominator를 고려해야 한다. 이는 operational resilience와 confidence calibration이 연결되는 지점이다.

### 3. 방법

Timeout은 reviewer별로 설정되어 slow provider가 전체 pipeline을 붙잡지 못하게 한다. Circuit breaker는 반복 실패하는 provider를 임시 차단하여 불필요한 재시도를 줄인다. Fallback은 동일 역할을 수행할 수 있는 대체 모델을 호출하는 방식으로 partial coverage를 회복한다. Promise.allSettled 기반 실행은 모든 reviewer 결과를 성공/실패로 수집하고, 실패한 reviewer를 명시적으로 기록한다.

이 구조에서 중요한 점은 fallback이 원래 reviewer와 완전히 동일한 의미를 갖지 않는다는 것이다. fallback model은 capability와 cost가 다를 수 있으므로 결과 confidence와 provenance에 반영되어야 한다. 따라서 resilience mechanism은 단순히 “성공처럼 보이게 만들기”가 아니라, 실패와 대체 과정을 설명 가능한 형태로 남기는 방식이어야 한다.

### 4. 평가 계획

장애 주입 실험은 provider timeout, API error, malformed output, missing CLI binary, rate limit을 포함할 수 있다. 각 조건에서 pipeline completion rate, partial result quality, fallback activation rate, latency overhead를 측정한다. 또한 fallback이 recall을 유지하는지, false positive를 증가시키는지 평가해야 한다.

### 5. 논의

운영 복원력은 품질과 충돌할 수 있다. 너무 공격적인 timeout은 느리지만 정확한 모델을 배제할 수 있고, fallback은 비용을 증가시킬 수 있다. 반대로 느슨한 timeout은 CI experience를 악화시킨다. 따라서 CodeAgora의 resilience 정책은 user-configurable budget과 quality target을 함께 고려해야 한다.

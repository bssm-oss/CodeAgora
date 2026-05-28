# 모델 Capability별 프롬프트 티어링

## 초록 초안

본 논문은 모델 능력에 따라 reviewer prompt를 다르게 설계하는 prompt tiering 전략을 다룬다. 모든 모델에 동일한 긴 prompt를 주는 것은 비용과 성능 면에서 비효율적일 수 있다. CodeAgora는 model capability tier를 기준으로 prompt complexity와 reviewer role을 조정한다.

## 핵심 연구 질문

모델 능력에 따라 reviewer prompt를 다르게 설계하면 비용 대비 품질이 개선되는가?

## 주장

prompt는 모델 능력과 역할에 맞게 계층화되어야 하며, 이는 비용과 output compliance를 모두 개선할 수 있다.

## 방법

- model family와 capability를 분류한다.
- tier별 reviewer prompt를 정의한다.
- 저비용 모델에는 좁은 task를 부여한다.
- 고성능 모델에는 종합 판단과 토론 역할을 부여한다.

## 근거와 소스 앵커

- 최근 `feat(prompt)` 계열 변경
- `src/tests/l0-family-classifier*`
- `docs/for-users/PROVIDERS.md`
- `docs/for-agents/ARCHITECTURE.md`

## 실험 설계

- 동일 모델에서 generic prompt와 tiered prompt 비교.
- output format compliance 측정.
- cost-quality trade-off 측정.

## 타당성 위협

- prompt 효과는 모델 버전에 민감하다.
- capability tier 기준이 주관적일 수 있다.

## 작성 TODO

- prompt tier table 작성.
- role별 prompt excerpt 추가.
- ablation experiment 설계.

## 확장 본문 초안

### 1. 서론

프롬프트는 모델의 능력과 역할에 맞게 설계되어야 한다. 모든 모델에 동일한 긴 system prompt와 동일한 reviewer instruction을 제공하면 비용, latency, output compliance 측면에서 비효율이 생길 수 있다. CodeAgora의 prompt tiering은 모델 family와 capability tier에 따라 reviewer prompt의 복잡도와 기대 역할을 조정하는 전략이다.

본 논문은 prompt tiering을 cost optimization과 model selection 사이의 연결 계층으로 본다. 모델 선택이 “누가 리뷰할 것인가”를 결정한다면, prompt tiering은 “그 모델에게 어떤 형태의 일을 맡길 것인가”를 결정한다.

### 2. 문제 배경

고성능 모델은 복잡한 지시, 다중 기준, structured output을 더 잘 따를 수 있다. 반면 저비용 또는 작은 모델은 좁고 구체적인 task에서 더 안정적일 수 있다. 예를 들어 작은 모델에게 전체 architecture review와 JSON schema compliance를 동시에 요구하면 실패 가능성이 커진다. 대신 특정 파일의 null guard, obvious bug, config mismatch처럼 좁은 task를 맡기면 비용 대비 유용한 signal을 얻을 수 있다.

따라서 prompt는 model capability와 reviewer role에 맞게 tiering되어야 한다. Tiered prompt는 모델별 약점을 감추는 것이 아니라, 각 모델이 잘 수행할 수 있는 작업 범위 안에서 기여하도록 만드는 방법이다.

### 3. 방법

Prompt tiering은 세 단계로 설계할 수 있다. 첫째, model family classifier와 provider metadata를 이용해 모델 capability tier를 추정한다. 둘째, tier별 reviewer role을 정의한다. 예를 들어 lower tier는 syntax-level issue, config consistency, obvious runtime error를 담당하고, higher tier는 architecture, security reasoning, L2 debate moderation을 담당한다. 셋째, output schema 요구 강도와 explanation 요구량을 tier에 따라 조절한다.

이 설계는 L0 model selection과 L1 reviewer execution 사이에 위치한다. Model selector가 reviewer portfolio를 구성하면 prompt tiering layer는 각 reviewer에게 적절한 prompt template을 할당한다. 결과적으로 동일한 diff라도 모델 portfolio에 따라 prompt plan이 달라질 수 있다.

### 4. 평가 계획

평가는 generic prompt baseline과 tiered prompt를 비교하는 방식으로 수행할 수 있다. 주요 지표는 parser compliance, valid finding rate, false positive rate, cost per useful finding, latency다. 또한 모델 크기 또는 provider family별로 prompt tiering 효과가 어떻게 달라지는지 분석해야 한다.

### 5. 논의

Prompt tiering은 모델을 차별적으로 사용하는 전략이므로, 잘못 설계하면 특정 모델의 잠재력을 과소평가할 수 있다. 또한 모델 업데이트로 capability가 바뀌면 tier assignment도 갱신되어야 한다. 따라서 prompt tiering은 고정 규칙보다 관찰 가능한 quality signal과 함께 운영되어야 한다.

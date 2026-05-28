# 모델 선택과 품질 추적

## 초록 초안

본 논문은 CodeAgora의 L0 model intelligence 계층을 다룬다. L0는 model registry, family classifier, health monitor, quality tracker, multi-armed bandit를 통해 리뷰어 선택을 정적 설정에서 동적 운영 문제로 확장한다.

## 핵심 연구 질문

모델의 건강 상태와 과거 품질을 이용해 리뷰어를 동적으로 선택할 수 있는가?

## 주장

멀티-LLM 코드 리뷰 시스템에서는 모델 선택이 품질, 비용, latency, provider availability를 동시에 고려하는 online decision problem이다.

## 방법

- model registry로 candidate model을 관리한다.
- health monitor로 provider 상태를 추적한다.
- quality tracker로 성공률과 품질 신호를 기록한다.
- bandit strategy로 모델 선택을 조정한다.
- capability tiering으로 prompt와 역할을 조정한다.

## 근거와 소스 앵커

- `src/tests/l0-*`
- `docs/for-users/PROVIDERS.md`
- `docs/for-agents/ARCHITECTURE.md`
- `src/tests/l0-model-selector*`

## 실험 설계

- static model selection 대비 동적 선택 비교.
- provider degradation 상황에서 quality 유지 여부 측정.
- cost-quality Pareto curve 작성.

## 타당성 위협

- 충분한 historical quality data가 없으면 bandit 성능 평가가 어렵다.
- 모델 품질이 task distribution에 강하게 의존한다.

## 작성 TODO

- L0 architecture diagram 작성.
- model selection objective 정의.
- offline replay evaluation 설계.

## 확장 본문 초안

### 1. 서론

멀티-LLM 코드 리뷰에서 “어떤 모델을 사용할 것인가”는 정적 설정 파일의 문제가 아니라 지속적인 운영 문제다. 모델은 시간에 따라 성능이 변하고, provider는 rate limit이나 장애를 겪으며, 특정 모델은 보안 finding에는 강하지만 formatting이나 JSON compliance에는 약할 수 있다. CodeAgora의 L0 model intelligence 계층은 이런 변동성을 관리하기 위해 model registry, health monitor, quality tracker, model selector, bandit strategy를 분리한다.

본 논문의 중심 주장은 모델 선택을 단순한 preference ordering으로 보지 말아야 한다는 것이다. 코드 리뷰 시스템에서 모델 선택은 비용, latency, availability, historical correctness, role suitability를 동시에 고려하는 online decision problem이다. 특히 L1 병렬 reviewer, L2 debate, L3 verdict는 서로 다른 성격의 작업이므로 모든 계층에 같은 모델을 배치하는 것은 비효율적이다.

### 2. 문제 배경

대부분의 LLM application은 특정 모델을 기본값으로 정하고 실패 시 대체 모델을 호출한다. 그러나 코드 리뷰에서는 모델 다양성 자체가 가치가 된다. 서로 다른 모델이 서로 다른 bug class를 발견할 수 있고, 같은 finding을 독립적으로 지지할 때 confidence signal로 사용할 수 있기 때문이다. 동시에 모델 다양성은 비용 증가와 output heterogeneity를 초래한다. 따라서 모델 선택 계층은 diversity와 reliability를 함께 조절해야 한다.

CodeAgora의 L0 테스트군은 model registry, health monitor, quality tracker, specificity scorer 등 여러 하위 문제를 다룬다. 이는 모델 선택을 “가장 좋은 모델 하나”를 고르는 문제가 아니라, 리뷰 파이프라인의 여러 위치에 적절한 모델 portfolio를 배치하는 문제로 보는 설계 선택을 반영한다.

### 3. 방법

L0 계층은 먼저 사용 가능한 provider와 model을 registry에 등록한다. 각 모델은 family, capability, backend type, cost class, health state 같은 metadata를 갖는다. Health monitor는 최근 호출 실패, timeout, provider unavailability를 추적하고, quality tracker는 과거 리뷰 결과에서 얻은 성공률이나 유효 finding signal을 축적한다. Model selector는 이 정보를 이용해 reviewer 후보를 구성한다.

Multi-armed bandit은 장기적으로 품질 좋은 모델을 더 자주 선택하면서도 새로운 모델이나 회복된 provider를 탐색할 수 있는 메커니즘이다. CodeAgora에서 bandit은 완성된 평가 논문을 위해 더 많은 empirical data가 필요하지만, 구조적으로는 static selection보다 운영 변화에 강한 선택 전략을 제공한다.

### 4. 평가 계획

평가는 offline replay와 live benchmark로 나눌 수 있다. Offline replay는 동일한 benchmark result history를 사용해 static selection, health-only selection, quality-aware selection, bandit selection을 비교한다. Live benchmark는 golden-bug fixture를 대상으로 모델 조합별 recall@k, FP rate, cost, latency를 측정한다. 장애 주입 실험에서는 특정 provider를 실패 상태로 만들고 selector가 회피 또는 fallback을 수행하는지 확인한다.

### 5. 한계와 논의

품질 추적은 feedback loop를 요구한다. 자동으로 correctness label을 얻기 어렵기 때문에 초기에는 benchmark fixture와 regression test의 결과가 주요 signal이 된다. 또한 모델 선택이 특정 benchmark에 과적합될 위험이 있다. 따라서 L0 논문은 모델 선택 알고리즘뿐 아니라 평가 데이터의 다양성과 drift 대응 전략을 함께 다뤄야 한다.

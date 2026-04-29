# 비용 최적화와 Debate Cost Reduction

## 초록 초안

본 논문은 멀티 모델 코드 리뷰에서 품질과 비용을 함께 최적화하는 문제를 다룬다. CodeAgora는 무료 또는 저비용 provider, reviewer budget, debate round control, cost tracking을 통해 비용 증가를 제어하면서 리뷰 품질을 유지하려 한다.

## 핵심 연구 질문

멀티 모델·멀티 라운드 리뷰의 비용을 어떻게 제한하면서 품질을 유지할 수 있는가?

## 주장

LLM 코드 리뷰 비용 최적화는 단순히 저렴한 모델을 고르는 문제가 아니라, 어떤 단계에 어떤 모델을 배치할지 결정하는 pipeline allocation 문제이다.

## 방법

- provider별 비용과 latency를 추적한다.
- cheap/free provider를 baseline reviewer로 사용한다.
- 고비용 모델은 head verdict나 hard case에 제한적으로 사용한다.
- debate round 수와 supporter 수를 조정한다.

## 근거와 소스 앵커

- `docs/PROVIDERS.md`
- `docs/MAD_RESEARCH_AND_IMPROVEMENTS.md`
- `src/tests/pipeline-cost*`
- `README.md` benchmark section

## 실험 설계

- cost-quality Pareto curve 작성.
- debate round ablation.
- provider mix ablation.
- cost per accepted finding 측정.

## 타당성 위협

- provider 가격 정책이 변동될 수 있다.
- 품질 지표가 비용 최적화의 실제 효용을 완전히 반영하지 못할 수 있다.

## 작성 TODO

- cost accounting schema 정리.
- budget-aware pipeline variant 설계.
- 비용 표준화 방법 작성.

## 확장 본문 초안

### 1. 서론

멀티-LLM 코드 리뷰는 품질을 높일 수 있지만 비용을 빠르게 증가시킨다. 여러 reviewer를 병렬 실행하고, 토론 라운드를 수행하며, 최종 head agent까지 호출하면 단일 모델 리뷰보다 더 많은 token과 API call이 필요하다. CodeAgora의 비용 최적화 문제는 “가장 싼 모델을 고른다”가 아니라, pipeline의 어느 단계에 어떤 비용 등급의 모델을 배치할지 결정하는 문제다.

본 논문은 CodeAgora의 비용 추적과 debate cost reduction 가능성을 정리한다. 특히 무료 또는 저비용 provider를 L1 reviewer로 활용하고, 고비용 모델은 hard case, L2 moderation, L3 verdict 같은 단계에 제한적으로 배치하는 전략을 다룬다.

### 2. 문제 배경

코드 리뷰에서 모든 diff가 동일한 난이도를 갖지는 않는다. 문서 변경이나 작은 refactor에는 저비용 모델과 간단한 filter만으로 충분할 수 있지만, 보안 취약점이나 복잡한 concurrency bug는 더 강한 모델과 토론이 필요할 수 있다. 따라서 비용 최적화는 static model choice가 아니라 change complexity, risk, reviewer disagreement에 따라 동적으로 비용을 배분하는 문제다.

또한 debate는 품질 향상 가능성과 비용 증가를 동시에 가진다. 모든 finding에 대해 다중 라운드 토론을 수행하면 비용이 과도해진다. 반대로 debate를 지나치게 줄이면 high-confidence FP나 reviewer conflict를 해결하지 못한다. 비용 최적화 논문은 이 trade-off를 정량화하는 것을 목표로 한다.

### 3. 방법

CodeAgora는 provider별 비용과 모델 class를 추적할 수 있는 구조를 갖는다. L1에서는 다수의 저비용 reviewer로 coverage를 확보하고, L2에서는 disagreement나 high-severity finding처럼 가치가 높은 후보에만 토론 비용을 집중할 수 있다. L3는 최종 summary와 verdict를 생성하므로, 더 강한 모델을 제한적으로 사용하는 후보가 된다.

Budget-aware pipeline variant는 세 가지 형태로 설계할 수 있다. 첫째, cheap mode는 L1과 filter 중심으로 빠르게 결과를 낸다. 둘째, balanced mode는 high-risk finding에만 L2를 적용한다. 셋째, thorough mode는 더 많은 reviewer와 debate round를 허용한다. 이 세 모드는 사용자 비용 한도와 CI latency 요구사항에 맞춰 선택될 수 있다.

### 4. 평가 계획

평가는 cost-quality Pareto curve를 중심으로 한다. 각 pipeline variant에 대해 cost per review, cost per accepted finding, recall@k, FP rate, latency를 측정한다. Provider mix ablation은 Groq/free-tier 중심, OpenRouter 혼합, premium head model 포함 조건을 비교한다. Debate round ablation은 라운드 수가 품질과 비용에 미치는 영향을 측정한다.

### 5. 논의

비용 최적화는 품질 저하와 분리해서 논의할 수 없다. 저비용 모델을 많이 사용하는 전략은 다양성을 제공할 수 있지만, output parser 실패나 hallucination을 증가시킬 수 있다. 따라서 비용 논문은 provider abstraction, prompt tiering, hallucination filter 논문과 함께 읽혀야 한다.

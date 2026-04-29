# CodeAgora: 멀티-LLM 코드 리뷰 시스템 아키텍처

## 초록
본 논문은 CodeAgora의 전체 시스템 아키텍처를 기술한다. CodeAgora는 Pre-analysis, L0 모델 지능, L1 병렬 리뷰, hallucination/evidence filter, L2 토론, L3 최종 판정으로 구성된 멀티-LLM 코드 리뷰 파이프라인이다. 단일 LLM 기반 리뷰의 한계를 극복하기 위해, 다양한 모델의 독립적 분석과 증거 기반 토론, 계층적 합의 구조를 도입하였다. 본 논문은 각 계층의 설계 원리와 역할, 시스템 전체의 데이터 흐름, 확장성 및 신뢰성 확보 방안을 상세히 설명한다. 또한, 기존 단일 모델 리뷰와의 비교 실험 설계와 잠재적 한계점, 향후 실증 연구 방향을 제시한다.

## 키워드
멀티-LLM, 코드 리뷰, 시스템 아키텍처, 계층적 파이프라인, 증거 기반 토론, 자동화

## 1. 서론
최근 대형 언어 모델(LLM)을 활용한 코드 리뷰 자동화가 활발히 연구되고 있으나, 단일 모델 기반 접근법은 편향, 증거 부족, 오탐지 등 여러 한계를 가진다. CodeAgora는 이러한 문제를 해결하기 위해, 여러 LLM이 독립적으로 코드를 분석하고, 각자의 증거와 주장을 토론하며, 최종적으로 합의된 판정을 내리는 계층적 파이프라인을 제안한다. 본 논문은 CodeAgora의 전체 구조와 각 계층의 설계 원리를 체계적으로 정리한다.

## 2. 배경 및 문제 정의
기존 LLM 기반 코드 리뷰는 단일 모델의 판단에 의존하여, 다양한 관점의 결여, hallucination(허상) 문제, 증거 부족, 판정의 불안정성 등 한계를 보인다. 또한, 리뷰 결과의 신뢰성과 설명 가능성, 확장성 측면에서도 제약이 있다. 본 연구는 다수의 LLM을 병렬로 활용하고, 증거 기반 토론과 계층적 합의 구조를 도입함으로써, 기존 한계를 극복하고자 한다.

## 3. 시스템 설계
CodeAgora는 다음과 같은 6단계 파이프라인으로 구성된다.

1. **Pre-analysis**: 코드 diff와 영향 범위를 사전 분석하여, 리뷰의 초점을 명확히 한다.
2. **L0 모델 지능**: 다양한 LLM 및 provider의 상태를 모니터링하고, 최적의 reviewer pool을 구성한다.
3. **L1 병렬 리뷰**: 각 LLM이 독립적으로 코드를 분석하고 finding을 생성한다.
4. **Hallucination/Evidence Filter**: 각 finding의 증거 유무와 허상 가능성을 검증한다.
5. **L2 토론**: reviewer 간의 상충되는 finding을 토론하여, 합의 또는 반박 과정을 거친다.
6. **L3 최종 판정**: 토론 결과와 증거를 종합하여, head agent가 ACCEPT/REJECT/NEEDS_HUMAN verdict를 내린다.

각 계층은 독립적이면서도 상호 연계되어, 전체 시스템의 신뢰성과 확장성을 보장한다.

## 4. 평가 계획 및 예비 근거
- 단일 모델 리뷰, 단순 majority vote, CodeAgora 전체 파이프라인의 성능을 비교한다.
- L2 토론 및 hallucination filter의 ablation 실험을 통해 각 계층의 기여도를 분석한다.
- reviewer 수 변화에 따른 precision, recall@k, latency를 측정한다.
- 예비 테스트는 `src/tests/pipeline-*`에서 진행 중이며, 실제 PR 데이터셋을 활용한 추가 실험이 필요하다.

## 5. 논의 및 한계
- 실험 fixture가 실제 PR의 다양성을 충분히 대표하지 못할 수 있다.
- provider drift로 인해 모델 응답 품질이 시간에 따라 달라질 수 있다.
- 사람 reviewer와의 비교 기준 설정이 주관적일 수 있다.
- 시스템 다이어그램, 각 계층의 입출력 스키마 정리가 추가로 필요하다.

## 6. 결론
CodeAgora는 멀티-LLM 기반 계층적 코드 리뷰 시스템으로, 기존 단일 모델 리뷰의 한계를 극복하고자 한다. 각 계층의 설계 원리와 데이터 흐름을 체계적으로 정립하였으며, 향후 실증적 평가와 ablation 연구를 통해 효과성을 검증할 예정이다.

## 참고문헌 및 소스 앵커
- `docs/ARCHITECTURE.md`
- `docs/1_PRD.md`
- `docs/3_V3_DESIGN.md`
- `README.md`
- `src/tests/pipeline-*`

## TODO
- 시스템 다이어그램 추가
- 각 계층의 입출력 스키마 정리
- baseline 및 ablation 결과 표 작성

## 확장 본문 초안

CodeAgora의 핵심 가정은 코드 리뷰를 하나의 LLM 호출로 환원할 수 없다는 데 있다. 실제 코드 리뷰는 변경 이해, 위험도 추정, 버그 후보 탐지, 근거 확인, 반론 수용, 최종 의사결정이라는 여러 하위 작업으로 구성된다. 단일 모델에게 이 모든 단계를 한 번에 맡기면 출력은 간결해질 수 있지만, 어떤 finding이 어떤 증거에서 나왔는지, 어떤 반론을 통과했는지, 왜 최종적으로 채택되었는지 추적하기 어렵다.

CodeAgora는 이 문제를 계층적 파이프라인으로 해결한다. Pre-analysis는 diff를 리뷰 가능한 구조로 바꾸고, L0는 어떤 모델을 어떤 역할에 배치할지 결정한다. L1은 독립적인 병렬 리뷰를 수행하며, filter 계층은 hallucination과 evidence 부족을 억제한다. L2는 finding 간 충돌과 합의를 토론으로 처리하고, L3는 최종 verdict와 triage를 생성한다. 이 구조는 모델 하나의 추론 능력보다 시스템 전체의 검증 경로를 중시한다.

LLM 코드 리뷰의 실패는 실제 버그를 놓치는 false negative, 실제 diff에 근거하지 않은 plausible false positive, 그리고 결과가 맞더라도 provenance가 부족해 신뢰하기 어려운 문제로 나눌 수 있다. CodeAgora의 시스템 기여는 이 실패 모드를 각 계층의 책임으로 분리한다는 데 있다. L1은 다양성을 만들고, filter는 사실성을 확인하며, L2는 충돌을 다루고, L3는 사용자가 행동할 수 있는 결론을 만든다.

시스템 평가는 end-to-end 품질과 계층별 기여를 함께 측정해야 한다. Golden-bug benchmark는 recall과 FP regression을 측정하는 기반이 될 수 있다. Ablation은 L2 제거, filter 제거, L0 정적 모델 선택, 단일 reviewer 구성 등을 포함한다. 주요 지표는 recall@k, false positive rate, latency, cost, accepted finding precision, verdict stability다.

계층적 구조는 복잡도를 증가시킨다. 단일 LLM 호출보다 구현과 테스트가 어렵고, 각 계층 간 schema 정합성이 필요하다. 그러나 복잡성은 검증 가능성과 교환된다. CodeAgora는 “더 똑똑한 모델 하나”보다 “실패를 분리하고 추적할 수 있는 시스템”을 선택한다.

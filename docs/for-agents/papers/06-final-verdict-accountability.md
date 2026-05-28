# 최종 판정 에이전트와 책임 추적

## 초록 초안

본 논문은 CodeAgora의 L3 최종 판정 계층을 다룬다. L3는 L1 리뷰, evidence filter, L2 토론 결과를 종합하여 ACCEPT, REJECT, NEEDS_HUMAN 형태의 verdict를 생성한다. 본 논문은 최종 판정이 어떤 정보를 보존해야 하는지와 top issue provenance를 어떻게 추적할 수 있는지를 논의한다.

## 핵심 연구 질문

다수 리뷰와 토론 결과를 최종 verdict로 합성할 때 어떤 정보가 보존되어야 하는가?

## 주장

최종 판정은 단순 요약이 아니라 evidence, disagreement, confidence 변화, rejected finding의 이유를 포함하는 accountability layer여야 한다.

## 방법

- L2 결과를 severity와 confidence 기준으로 정렬한다.
- top issues를 최종 summary에 반영한다.
- verdict와 human action을 분리한다.
- rejected finding의 provenance를 보존한다.

## 근거와 소스 앵커

- `docs/for-agents/ARCHITECTURE.md`
- `src/tests/l3-*`
- `src/tests/pipeline-*`
- `src/tests/confidence*`

## 실험 설계

- 동일 입력에 대한 verdict stability 측정.
- top issue ordering 품질 평가.
- 사람이 보는 triage usefulness 평가.

## 타당성 위협

- 최종 verdict의 정답 기준을 정의하기 어렵다.
- human usefulness 평가는 사용자군에 따라 달라진다.

## 작성 TODO

- verdict schema 추가.
- accepted/rejected finding provenance 예시 작성.
- NEEDS_HUMAN 기준 정리.

## 확장 본문 초안

최종 verdict는 코드 리뷰 파이프라인의 사용자 접점이다. 개발자는 수십 개의 reviewer observation과 debate trace를 모두 읽을 시간이 없기 때문에, 시스템은 행동 가능한 결론을 제공해야 한다. 그러나 결론이 너무 압축되면 책임 추적이 사라진다. CodeAgora의 L3 계층은 verdict generation과 accountability 사이의 균형을 다룬다.

최종 판정은 요약 문제가 아니라 의사결정 provenance 문제다. ACCEPT, REJECT, NEEDS_HUMAN 같은 verdict는 단순 label이 아니라 어떤 finding이 must-fix인지, 어떤 finding이 rejected되었는지, 어떤 uncertainty가 남았는지를 포함해야 한다. 자동 리뷰 시스템의 최종 출력이 “문제 있음” 또는 “문제 없음”에 그치면 개발자는 그 판단을 검증하기 어렵다. 특히 false positive가 많은 시스템에서는 최종 verdict가 신뢰를 잃는다.

L3는 L1 finding, filter result, L2 debate decision, confidence trace를 입력으로 받는다. 먼저 accepted finding과 rejected finding을 분리하고, accepted finding을 severity, confidence, actionability 기준으로 정렬한다. 이후 top issues를 summary에 반영하고, 전체 verdict를 생성한다. NEEDS_HUMAN은 evidence가 충돌하거나 high-severity finding의 confidence가 불충분한 경우에 사용될 수 있다.

Accountability를 위해 L3 output은 각 top issue가 어떤 reviewer와 evidence에서 왔는지, debate에서 어떤 반론을 통과했는지, confidence가 어떻게 조정되었는지를 참조할 수 있어야 한다. 평가는 verdict stability, top issue ordering, human triage usefulness를 포함한다. 같은 diff를 여러 번 실행했을 때 verdict가 얼마나 안정적인지, 사람이 중요하다고 판단한 issue가 top issue에 포함되는지 측정할 수 있다.

최종 verdict는 과도한 확신을 피해야 한다. LLM 시스템은 uncertainty를 제거하는 것이 아니라 명시해야 한다. 따라서 NEEDS_HUMAN은 실패가 아니라 책임 있는 자동화의 일부로 해석되어야 한다.

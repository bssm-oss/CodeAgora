# 구조화된 멀티 에이전트 토론을 이용한 코드 리뷰 합의

## 초록 초안

본 논문은 CodeAgora의 L2 토론 계층을 다룬다. L2는 병렬 리뷰어가 생성한 finding을 단순 투표로 처리하지 않고, moderator와 supporter pool을 통해 반론, 지지, 강제 판정 과정을 수행한다. 목표는 합의의 품질과 설명 가능성을 동시에 높이는 것이다.

## 핵심 연구 질문

단순 투표보다 구조화된 반론과 지지 토론이 코드 리뷰 판정 품질을 개선하는가?

## 주장

구조화된 debate protocol은 reviewer agreement를 그대로 신뢰하는 방식보다 high-confidence false positive를 발견하고, 최종 verdict의 근거를 더 명확하게 만든다.

## 방법

- L1 finding을 토론 후보로 정리한다.
- supporter가 finding의 증거를 보강하거나 약화한다.
- moderator가 충돌을 구조화한다.
- forced decision schema로 최종 토론 결과를 안정화한다.

## 근거와 소스 앵커

- `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`
- `docs/for-agents/ARCHITECTURE.md`
- `src/tests/l2-*`
- `src/tests/l2-moderator-parallel*`

## 실험 설계

- no-debate baseline과 majority-vote baseline 비교.
- L2 debate 적용 전후 precision과 recall@k 측정.
- 토론 trace의 human usefulness 평가.

## 타당성 위협

- debate가 모델 간 같은 편향을 공유하면 오판을 강화할 수 있다.
- 토론 비용이 latency와 API cost를 증가시킨다.

## 작성 TODO

- debate state machine 작성.
- forced decision schema 설명 추가.
- representative debate trace 포함.

## 확장 본문 초안

멀티 에이전트 토론은 CodeAgora의 가장 차별적인 계층이다. 여러 reviewer가 finding을 생성한 뒤, 시스템은 단순히 다수결을 취하지 않는다. 다수 모델이 같은 주장을 반복해도 그 주장이 실제 diff에 근거하지 않을 수 있기 때문이다. L2 debate는 finding을 지지하고 반박하는 과정을 구조화하여, 최종 verdict가 어떤 논증을 통과했는지 기록한다.

L2를 “LLM끼리 대화하게 하는 기능”으로만 이해하면 핵심을 놓친다. Debate의 목적은 더 긴 텍스트를 생성하는 것이 아니라, finding의 evidence, counter-evidence, severity, actionability를 판정하는 것이다. 단순 majority vote는 모델 간 독립성과 correctness를 가정하지만, LLM들은 같은 학습 데이터와 유사한 추론 패턴을 공유할 수 있다. 특히 보안 취약점처럼 흔한 narrative가 있는 문제에서는 여러 모델이 같은 false positive를 생성할 수 있다.

L2 입력은 deduplicated finding cluster다. 각 cluster는 원 finding, supporting reviewers, evidence, confidence를 포함한다. Debate 단계는 finding별로 objection과 support를 생성하고, moderator가 최종 stance를 정한다. Forced decision은 accept, reject, needs-human 같은 상태와 reasoning summary를 포함한다.

중요한 설계 원칙은 debate가 evidence-bound여야 한다는 점이다. 모델이 일반적인 가능성을 말하는 것이 아니라, 실제 diff와 연결된 근거를 제시해야 한다. 평가는 no-debate, majority vote, structured debate를 비교한다. Golden-bug benchmark에서 recall@k와 FP rate를 측정하고, high-confidence FP fixture에서 debate가 잘못된 corroboration을 약화하는지 확인한다.

Debate는 비용과 latency를 증가시킨다. 모든 finding에 debate를 적용하기보다 high-severity, low-evidence, high-disagreement finding에 집중하는 adaptive debate가 필요하다.

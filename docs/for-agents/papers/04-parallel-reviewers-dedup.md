# 병렬 LLM 리뷰어의 다양성과 중복 제거

## 초록 초안

본 논문은 다수 LLM 리뷰어를 병렬로 실행할 때 발생하는 발견 다양성, 중복, 충돌을 다룬다. CodeAgora의 L1 계층은 여러 리뷰어가 독립적으로 finding을 생성하게 하고, 이후 정규화와 deduplication을 통해 토론 가능한 단위로 변환한다.

## 핵심 연구 질문

여러 모델이 독립적으로 리뷰할 때 발견 다양성은 증가하는가, 중복과 노이즈는 어떻게 제어할 수 있는가?

## 주장

병렬 리뷰는 단일 모델보다 더 넓은 finding coverage를 제공하지만, deduplication과 finding normalization 없이는 토론과 최종 판정 단계의 비용을 증가시킨다.

## 방법

- L1 reviewer fan-out으로 독립 finding을 수집한다.
- finding schema로 출력을 정규화한다.
- 파일, 라인, issue type, evidence 기반으로 중복을 묶는다.
- 충돌 finding은 L2 토론 후보로 넘긴다.

## 근거와 소스 앵커

- `docs/for-agents/ARCHITECTURE.md`
- `src/tests/l1-*`
- `src/tests/l2-dedup*`
- `src/tests/l1-reviewer*`

## 실험 설계

- reviewer 수별 unique finding 수 측정.
- duplicate rate와 L2 토론 비용 측정.
- 동일 provider 다중 모델과 다중 provider 비교.

## 타당성 위협

- finding equivalence 판단 기준이 결과에 영향을 준다.
- 모델 간 독립성이 실제로는 provider나 학습 데이터에 의해 제한될 수 있다.

## 작성 TODO

- dedup key 정의 정리.
- reviewer diversity metric 설계.
- L1 output 예시 추가.

## 확장 본문 초안

병렬 LLM 리뷰어의 목적은 같은 답을 여러 번 얻는 것이 아니라, 서로 다른 관점에서 bug candidate를 찾는 것이다. 보안 중심 reviewer, 논리 오류 중심 reviewer, 일반 reviewer는 같은 diff를 보고도 다른 finding을 생성할 수 있다. 그러나 병렬화는 중복과 충돌을 함께 만든다. 따라서 L1의 다양성은 L2와 L3가 사용할 수 있는 정규화된 finding으로 변환되어야 한다.

CodeAgora의 L1 계층은 독립성을 강조한다. Reviewer들은 서로의 출력을 보지 않고 diff를 분석한다. 이 독립성은 corroboration signal의 전제가 된다. 하지만 독립 리뷰 결과를 그대로 합치면 같은 issue가 여러 표현으로 반복되고, line number가 약간 다르거나 severity가 다른 finding이 중복될 수 있다.

중복 제거는 단순 문자열 유사도 문제가 아니다. 두 finding은 다른 문장으로 쓰였지만 같은 root cause를 가리킬 수 있고, 반대로 같은 파일과 라인을 가리키지만 다른 문제를 말할 수 있다. 코드 리뷰 deduplication은 file, hunk, symbol, issue class, evidence, suggested fix를 함께 고려해야 한다.

또한 중복 제거는 품질 신호를 버리는 과정이 아니다. 여러 독립 reviewer가 같은 finding을 제기했다는 사실은 confidence signal이 될 수 있다. 따라서 deduplication은 finding을 하나로 합치되, 지지한 reviewer 목록과 evidence variant를 보존해야 한다. 평가에서는 reviewer 수와 조합을 바꾸며 unique true positive, duplicate rate, false positive rate를 측정한다. 과도한 dedup은 서로 다른 문제를 하나로 합쳐 false negative를 만들 수 있고, 약한 dedup은 L2 비용을 증가시킨다.

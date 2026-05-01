# Explainable Code Review Session

## 초록 초안

본 논문은 자동 코드 리뷰 세션의 설명 가능성을 다룬다. CodeAgora는 session history, `explain_session`, confidence trace viewer, discussion trace를 통해 특정 finding이 왜 채택되거나 기각되었는지 추적할 수 있게 한다.

## 핵심 연구 질문

자동 코드 리뷰가 왜 특정 finding을 채택·기각했는지 추적 가능한가?

## 주장

자동 리뷰 시스템은 최종 verdict만 제공해서는 부족하며, finding의 provenance와 confidence 변화 과정을 설명해야 개발자가 신뢰할 수 있다.

## 방법

- 각 review session을 저장한다.
- finding별 source reviewer와 evidence를 연결한다.
- L2 debate trace와 L3 verdict를 연결한다.
- `explain_session`과 UI를 통해 질의 가능하게 한다.

## 근거와 소스 앵커

- `docs/EXTENSIONS.md`
- `docs/DESKTOP_APP_CONSOLIDATION.md`
- `src/tests/cli-sessions*`
- `src/tests/session*`
- `src/tests/confidence*`

## 실험 설계

- explanation helpfulness 사용자 평가.
- debugging time reduction 측정.
- rejected finding explanation의 정확도 평가.

## 타당성 위협

- explanation 품질은 정량화하기 어렵다.
- 너무 많은 trace가 사용자에게 cognitive load를 줄 수 있다.

## 작성 TODO

- session schema 작성.
- explain_session 예시 추가.
- UX evaluation plan 작성.

## 확장 본문 초안

### 1. 서론

자동 코드 리뷰 시스템이 개발자에게 신뢰를 얻으려면 최종 결과만 제시해서는 부족하다. “이 finding이 왜 나왔는가”, “왜 다른 finding은 기각되었는가”, “어떤 reviewer가 어떤 evidence를 근거로 삼았는가”, “토론 과정에서 confidence가 어떻게 바뀌었는가”를 추적할 수 있어야 한다. CodeAgora의 explainable session 설계는 이러한 요구를 session history, confidence trace, discussion trace, `explain_session` 도구로 다룬다.

본 논문은 explainability를 모델 내부 해석 가능성의 문제가 아니라, 코드 리뷰 pipeline provenance의 문제로 본다. 즉, LLM의 hidden state를 설명하는 것이 아니라, 시스템이 생성하고 변환한 evidence와 decision path를 보존하고 질의 가능하게 만드는 것이 목표다.

### 2. 문제 배경

LLM 리뷰 결과는 종종 단정적인 문장으로 표현된다. 개발자는 그 주장이 실제 diff에 근거하는지, 여러 모델이 독립적으로 지지했는지, 토론 과정에서 반박이 있었는지 알기 어렵다. 이런 불투명성은 false positive가 발생했을 때 신뢰를 빠르게 훼손한다. 특히 high-severity finding은 개발자의 시간을 많이 소모하므로, 해당 finding의 provenance가 명확해야 한다.

CodeAgora는 리뷰를 session 단위로 저장하고, 각 finding의 생성자, evidence, confidence adjustment, debate result를 연결할 수 있는 구조를 지향한다. 이는 단순 로그 저장이 아니라, 최종 verdict를 역추적할 수 있는 설명 계층이다.

### 3. 방법

Explainable session은 네 종류의 정보를 보존한다. 첫째, reviewer output provenance는 어떤 모델과 backend가 finding을 생성했는지 기록한다. 둘째, evidence provenance는 finding이 어떤 파일과 diff hunk에 연결되는지 기록한다. 셋째, confidence trace는 보정 전후의 score와 이유를 기록한다. 넷째, debate trace는 finding이 L2에서 지지, 반박, 기각된 과정을 기록한다.

`explain_session`은 이 정보를 사람이 이해할 수 있는 설명으로 재구성하는 interface다. MCP나 CLI에서 session id를 입력하면, 시스템은 최종 verdict뿐 아니라 주요 finding의 의사결정 경로를 요약할 수 있다. Desktop app은 동일 정보를 시각적으로 탐색하는 경로가 될 수 있다.

### 4. 평가 계획

평가는 explanation usefulness를 중심으로 한다. 사용자에게 최종 verdict만 제공한 조건과 explanation trace를 제공한 조건을 비교해 triage time, perceived trust, false positive rejection speed를 측정할 수 있다. 또한 rejected finding explanation이 실제 evidence 부족과 일치하는지 사람이 평가할 수 있다.

### 5. 논의

설명 가능성에는 비용이 있다. 너무 많은 trace는 사용자를 압도하고, 너무 적은 trace는 신뢰를 주지 못한다. 따라서 explainable session은 raw log dump가 아니라 사용자의 질문에 맞춘 progressive disclosure를 제공해야 한다.

# Reviewer Output Parser와 JSON Schema 강제

## 초록 초안

본 논문은 자유형 LLM 리뷰 출력을 안정적인 finding schema로 변환하는 parser 전략을 다룬다. LLM은 provider, 모델, prompt에 따라 서로 다른 형식의 응답을 생성한다. CodeAgora는 JSON output mode, schema validation, parser fallback, unparseable response debug preview를 통해 이 문제를 완화한다.

## 핵심 연구 질문

자유형 LLM 리뷰 출력을 안정적인 finding schema로 변환하려면 어떤 파서 전략이 필요한가?

## 주장

LLM 기반 코드 리뷰 시스템의 안정성은 모델 품질뿐 아니라 output parser의 견고성에 크게 의존한다.

## 방법

- reviewer에게 JSON output mode를 요구한다.
- Zod 또는 JSON schema로 output을 검증한다.
- 실패 시 fallback parser와 rewrite parser를 사용한다.
- unparseable response를 debug preview로 보존한다.

## 근거와 소스 앵커

- `src/tests/l1-parser*`
- `src/tests/l2-parser-rewrite*`
- 최근 `feat(parser)` 계열 변경
- `docs/ARCHITECTURE.md`

## 실험 설계

- parser success rate 측정.
- provider/model별 format compliance 비교.
- malformed output recovery rate 측정.

## 타당성 위협

- 테스트 response가 실제 모델 drift를 충분히 반영하지 못할 수 있다.
- 강한 schema 요구가 모델의 자연어 설명 품질을 낮출 수 있다.

## 작성 TODO

- output schema 추가.
- parser failure taxonomy 작성.
- rewrite parser 사례 정리.

## 확장 본문 초안

### 1. 서론

LLM 코드 리뷰 시스템에서 parser는 품질의 숨은 병목이다. 모델이 정확한 문제를 지적하더라도 파일명, 라인 번호, severity, 설명, evidence가 안정적인 구조로 추출되지 않으면 후속 deduplication, filtering, debate, GitHub annotation이 모두 불안정해진다. CodeAgora는 reviewer output을 finding schema로 변환하기 위해 JSON output mode, schema validation, fallback parser, parser rewrite를 결합한다.

본 논문은 parser를 단순한 문자열 후처리가 아니라 LLM 시스템의 신뢰성 계층으로 다룬다. 출력 형식 실패는 기능 실패가 아니라 pipeline 전체의 semantic integrity를 해치는 오류이기 때문이다.

### 2. 문제 배경

LLM은 같은 prompt에도 markdown list, prose report, JSON-like text, malformed JSON, localized headings 등 다양한 형식으로 응답한다. Provider나 모델 버전이 바뀌면 output style도 변한다. 자유형 출력은 사람이 읽기에는 유용할 수 있지만, 자동 시스템은 구조화된 finding을 필요로 한다.

CodeAgora의 L1 parser는 이 간극을 메운다. Parser가 성공하면 finding은 file, line, severity, category, message, evidence 등으로 정규화된다. Parser가 실패하면 debug preview와 rewrite path가 필요하다. 이때 중요한 것은 실패를 조용히 무시하지 않고, 어떤 모델이 어떤 방식으로 format compliance에 실패했는지 기록하는 것이다.

### 3. 방법

첫 번째 전략은 모델에게 JSON output mode를 요구하는 것이다. 하지만 모델이 항상 valid JSON을 반환하지는 않으므로 Zod 또는 JSON schema validation으로 구조를 확인한다. 두 번째 전략은 fallback parser다. 이는 markdown heading, bullet, code fence 같은 흔한 패턴에서 finding을 추출한다. 세 번째 전략은 parser rewrite다. L2 또는 별도 rewrite step을 통해 자유형 응답을 schema-compatible structure로 변환할 수 있다.

Unparseable response debug preview는 개발자와 시스템 운영자에게 중요하다. parser failure를 단순히 “no finding”으로 처리하면 실제 버그를 잃을 수 있다. 반면 malformed output을 무조건 finding으로 수용하면 false positive가 늘어난다. 따라서 parser failure는 별도 상태로 추적되어야 한다.

### 4. 평가 계획

Parser 논문의 평가는 format compliance와 recovery rate를 중심으로 한다. 모델별 valid JSON rate, fallback extraction success rate, rewrite success rate, malformed output에 의한 false positive/false negative를 측정한다. 또한 parser strictness를 조절하여 recall과 precision의 trade-off를 분석할 수 있다.

### 5. 논의

강한 schema enforcement는 downstream 안정성을 높이지만, 모델이 생성하는 풍부한 설명을 잃을 수 있다. 반대로 자유형 설명을 보존하면 parser 부담이 커진다. CodeAgora의 방향은 machine-readable finding과 human-readable explanation을 분리해 둘 다 보존하는 것이다.

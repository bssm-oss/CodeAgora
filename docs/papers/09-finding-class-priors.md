# Evidence 기반 Finding Class Prior

## 초록

본 논문은 LLM 기반 코드 리뷰 시스템에서 finding class(지적 유형)와 evidence strength(증거 강도)를 활용한 사전확률(prior) 보정 방식을 제안한다. 모든 코드 리뷰 finding이 동일한 신뢰 기반을 갖지 않으며, null guard 누락, artifact-only 변경, witness(증인)가 있는 finding 등은 서로 다른 prior를 요구한다. CodeAgora는 finding class 분류, witness 기반 corroboration, 반복 bug prior, artifact pattern prior 등 다양한 요소를 결합하여, 모델 confidence score를 보완하고 evidence가 약한 high-severity finding의 오탐을 억제한다.

## 키워드

LLM, 코드 리뷰, finding class, prior, evidence strength, corroboration, CodeAgora

## 서론

LLM 기반 코드 리뷰 시스템은 각 finding에 대해 신뢰도(confidence) 점수를 산출하지만, 모든 finding이 동일한 사전확률(prior)을 갖는 것은 아니다. 예를 들어, null guard 누락과 같은 반복적 버그 유형, artifact-only(자동 생성/변환) 변경, 여러 reviewer의 corroboration(합의) 여부, 증거의 강도 등은 finding의 신뢰도 해석에 중요한 영향을 미친다. 본 논문은 CodeAgora가 finding class와 evidence strength를 기반으로 prior를 동적으로 조정하는 방식을 제안하고, 그 효과와 한계를 분석한다.

## 배경 및 문제 정의

기존 LLM 코드 리뷰 시스템은 finding별 confidence score에만 의존하는 경향이 있다. 그러나 실제로는 finding의 유형, 증거의 강도, witness의 존재, artifact 패턴 등 다양한 맥락적 요소가 finding의 신뢰도에 영향을 준다. 예를 들어, null guard 누락은 실제로 자주 발견되는 버그 유형이므로 prior가 높게 설정되어야 하며, artifact-only 변경은 오탐 가능성이 높으므로 prior를 낮춰야 한다. witness(다수 reviewer의 corroboration)가 있는 finding은 신뢰도가 높아질 수 있다. 이러한 요소를 반영하지 않으면, evidence가 약한 high-severity finding이 과도하게 강조되거나, 반복적 버그 유형이 과소평가될 수 있다.

## 방법 및 시스템 설계

CodeAgora의 finding class prior 보정은 다음과 같은 단계로 구성된다.

1. **Finding class 분류**: 각 finding을 버그 유형, 취약점 종류, 스타일/성능/보안 등 class로 분류한다.
2. **Witness 기반 corroboration 적용**: 동일 finding에 대해 여러 reviewer가 독립적으로 지적한 경우 corroboration 점수를 부여한다.
3. **반복 bug prior 정의**: null guard 누락, input validation 미흡 등 반복적으로 발견되는 버그 유형에 대해 prior를 높게 설정한다.
4. **Artifact pattern prior 조정**: 자동 생성/변환된 코드, 포맷팅/빌드 산출물 등 artifact-only 변경에 대해서는 prior를 낮춘다.
5. **Evidence strength 반영**: finding이 제시하는 증거(코드 스니펫, diff anchor, 테스트 등)의 강도에 따라 prior를 동적으로 조정한다.

이러한 prior 보정은 모델 confidence score와 결합되어, evidence가 약한 high-severity finding의 오탐을 억제하고, 반복적 버그 유형의 recall을 높인다.

## 평가 계획 및 예비 증거

CodeAgora의 finding class prior 보정 효과를 평가하기 위해 다음과 같은 실험 설계를 제안한다.

- class별 precision과 recall 측정 및 prior 적용 전후 비교
- prior 적용 전후 severity distribution(심각도 분포) 변화 분석
- prior ablation study(계층별 제거 실험)를 통한 기여도 평가

예비적으로, `docs/ARCHITECTURE.md`, 최근 `feat(filter)`/`feat(chunker)` 계열 변경, 관련 confidence/filter 테스트 등에서 prior 보정의 효과와 사례가 관찰되었다.

## 논의 및 한계

prior 보정은 특정 코드베이스나 데이터셋에 과적합(overfit)될 위험이 있으며, 새로운 bug class 등장 시 일반화가 제한될 수 있다. 또한, prior rule의 설계가 주관적일 수 있고, evidence strength 평가 기준이 일관되지 않을 수 있다. prior가 지나치게 강하게 적용되면, 실제로 중요한 finding이 누락될 위험도 존재한다. 따라서 prior와 confidence의 균형, class taxonomy의 지속적 갱신이 필요하다.

## 결론

LLM 기반 코드 리뷰의 finding class prior 보정은 evidence 기반 신뢰도 해석의 핵심 요소이다. CodeAgora는 finding class 분류, witness corroboration, 반복 bug prior, artifact pattern prior, evidence strength 반영 등 다층적 전략을 통해 모델 confidence score를 보완한다. 향후에는 class taxonomy 확장, prior rule 자동화, 실제 benchmark fixture 기반 평가가 필요하다.

## 참고문헌 및 소스 앵커

- `docs/ARCHITECTURE.md`
- 최근 `feat(filter)` 계열 변경
- 최근 `feat(chunker)` 계열 변경
- 관련 confidence/filter 테스트

## TODO (실증적 완성 과제)

- finding class taxonomy 작성
- prior rule table 작성
- class별 benchmark fixture 확장

## 확장 본문 초안

모든 finding은 동일한 사전확률을 갖지 않는다. 예를 들어 null guard 누락은 특정 코드 패턴과 직접 연결될 때 비교적 검증 가능하지만, “잠재적 race condition” 같은 finding은 더 많은 실행 맥락을 요구한다. Artifact-only 변경에 대한 finding은 실제 production behavior와 연결되지 않을 가능성이 크다. Finding class prior는 이런 차이를 confidence 보정에 반영하려는 시도다.

CodeAgora에서 prior는 모델 판단을 대체하지 않는다. Prior는 모델이 생성한 finding을 evidence, witness, class context와 함께 재평가하는 보조 신호다. Witness-based corroboration은 독립적인 reviewer가 같은 root cause를 지적했는지 확인하고, missing-null-guard prior는 반복적으로 관찰되는 bug pattern에 대한 민감도를 높일 수 있다. 반대로 generated artifact, lockfile-only change, documentation-only change 같은 패턴에서는 certain class의 finding prior를 낮출 수 있다.

이 접근은 Bayesian한 직관을 갖지만, 반드시 엄격한 확률 모델로 구현될 필요는 없다. 중요한 것은 finding class별로 다른 검증 요구사항을 갖는다는 사실을 시스템에 반영하는 것이다. 보안 finding은 exploit path가 필요하고, correctness finding은 failing path나 invariant violation이 필요하며, maintainability finding은 actionability 기준이 필요하다.

평가는 class별 precision/recall과 prior ablation을 통해 수행한다. Prior가 FP를 줄이는지, 동시에 rare bug recall을 해치지 않는지 확인해야 한다. 가장 큰 위험은 prior가 특정 코드베이스와 fixture에 과적합되는 것이다. 따라서 prior rule은 사람이 읽을 수 있고, benchmark 확장과 함께 지속적으로 검증되어야 한다.

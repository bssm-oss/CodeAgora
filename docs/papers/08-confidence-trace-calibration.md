# 신뢰도 보정과 Confidence Trace

## 초록

본 논문은 대규모 언어 모델(LLM) 기반 코드 리뷰 시스템에서 각 finding(지적사항)에 부여되는 신뢰도(confidence) 점수가 실제 정밀도(precision) 및 재현율(recall)과 얼마나 일치하는지 분석하고, CodeAgora가 이를 보정(calibration)하기 위해 도입한 confidence trace 설계와 그 효과를 제시한다. LLM은 종종 근거 없는 높은 신뢰도의 주장을 하거나, 낮은 confidence로 표기된 finding이 실제로는 중요한 버그일 수 있다. CodeAgora는 reviewer별 confidence trace를 체계적으로 기록하고, corroboration(다중 리뷰어 합의), active participant denominator(참여자 분모), 모델별 multiplier, L2 토론 조정 등 다양한 요소를 trace로 보존하여 신뢰도 점수의 산출 경로와 보정 과정을 투명하게 제공한다.

## 키워드

LLM, 코드 리뷰, 신뢰도 보정, confidence trace, calibration, precision, recall, CodeAgora

## 서론

LLM 기반 코드 리뷰 시스템은 각 finding에 대해 신뢰도(confidence) 점수를 산출한다. 이 점수는 개발자가 triage(분류) 우선순위를 결정하거나, 자동화된 조치의 기준으로 활용될 수 있다. 그러나 LLM의 confidence score는 언어적 유창성이나 확률적 추론에 기반하여 산출되므로, 실제로는 근거 없는 고신뢰 주장(high-confidence claim)이나, 저신뢰 finding이 실제로는 중요한 결함일 수 있는 misalignment 현상이 빈번하다. 본 논문은 CodeAgora가 reviewer별 confidence trace 기록과 보정 과정을 통해 이러한 신뢰도-성능 불일치 문제를 어떻게 완화하는지 상세히 기술한다.

## 배경 및 문제 정의

LLM은 각 finding에 대해 0~1 또는 0~100 범위의 confidence score를 산출한다. 하지만 이 점수가 실제 precision(해당 confidence bin에서의 정밀도)이나 recall(실제 버그 검출률)과 일치하지 않는 경우가 많다. 예를 들어, 0.9 confidence로 표기된 finding의 실제 precision이 0.6에 불과하거나, 0.3 confidence finding이 실제로는 중요한 버그를 포착하는 사례가 보고된다. 이러한 miscalibration은 개발자의 triage 효율성을 저해하고, 자동화된 조치의 신뢰도를 떨어뜨린다. reviewer(모델/agent)별, finding class별로 confidence score의 분포와 calibration 특성이 다르기 때문에, 일률적인 threshold나 해석은 위험하다.

## 방법 및 시스템 설계

CodeAgora는 다음과 같은 다층적 confidence trace 및 보정 전략을 도입한다.

1. **최초 reviewer confidence 저장**: 각 reviewer(모델/agent)가 산출한 finding별 confidence score를 원본 그대로 기록한다.
2. **모델별 multiplier 적용**: reviewer의 신뢰도 특성, 과거 성능, drift 등을 반영한 multiplier를 confidence에 곱하여 1차 보정한다.
3. **corroboration 및 active participant denominator 반영**: 동일 finding에 대해 여러 reviewer가 독립적으로 지적한 경우 corroboration 점수를 부여하고, 전체 참여자 수 대비 finding을 지지한 reviewer 비율을 denominator로 활용한다.
4. **L2 토론 결과에 따른 adjustment 기록**: L2 debate(토론)에서 finding의 신뢰도가 추가로 조정되는 경우, 그 과정을 trace에 기록한다.
5. **최종 confidence와 trace 동시 노출**: 최종 confidence score와 함께, 위의 모든 보정 경로를 trace로 제공하여, 신뢰도 산출의 투명성과 디버깅 가능성을 높인다.

이러한 계층적 trace는 confidence score의 해석 가능성과 실제 검출 성능의 alignment를 높여, 개발자와 자동화 시스템 모두에 신뢰성 있는 정보를 제공한다.

## 평가 계획 및 예비 증거

CodeAgora의 confidence trace 및 calibration 효과를 평가하기 위해 다음과 같은 실험 설계를 제안한다.

- confidence bin(예: 0.0~0.1, 0.1~0.2, ...)별 precision/recall 측정 및 calibration curve 시각화
- expected calibration error(ECE) 측정 및 보정 전후 비교
- confidence와 correctness(실제 정답)의 상관관계 평가
- trace viewer(시각화 도구)가 human debugging time을 줄이는지 측정

예비적으로, `src/tests/confidence*`, `src/tests/l2-*` 등에서 calibration curve의 효과와 reviewer별 신뢰도 분포 차이가 관찰되었으며, `docs/ARCHITECTURE.md`와 `README.md`에 trace 설계와 사례가 정리되어 있다.

## 논의 및 한계

confidence score의 정의와 산출 방식이 모델별로 상이할 수 있으며, calibration curve가 특정 데이터셋에 과적합(overfit)될 위험이 있다. correctness labeling(정답 레이블링)이 어렵거나 주관적일 수 있고, 장기적인 drift나 새로운 finding class 등장 시 calibration의 유효성이 저하될 수 있다. calibration 과정에서 실제 recall이 희생될 가능성도 있으므로, precision과 recall의 균형을 지속적으로 모니터링해야 한다. reviewer별 calibration 차이가 클 경우, 통합된 triage 정책 설계가 복잡해질 수 있다.

## 결론

LLM 기반 코드 리뷰의 confidence score는 raw하게 신뢰할 수 없으며, reviewer별/클래스별 calibration과 trace 기반 보정이 필수적이다. CodeAgora는 confidence trace 기록, corroboration, 모델별 multiplier, L2 토론 조정 등 다층적 전략을 통해 신뢰도-성능 alignment를 개선한다. 향후에는 calibration curve의 자동화, drift 감지, 실제 개발 현장 적용 경험 축적이 필요하다.

## 참고문헌 및 소스 앵커

- `src/tests/confidence*`
- `src/tests/l2-*`
- `docs/ARCHITECTURE.md`
- `README.md`

## TODO (실증적 완성 과제)

- confidence trace schema 정리
- before/after trace 예시 작성
- calibration metric 정의

## 확장 본문 초안

Confidence trace의 중요한 장점은 사후 분석 가능성이다. 최종 confidence가 낮아진 이유가 모델 자체의 낮은 confidence 때문인지, evidence 부족 때문인지, L2 debate에서 반박되었기 때문인지 구분할 수 있다. 이는 시스템 디버깅뿐 아니라 사용자 신뢰에도 중요하다. 개발자는 “이 finding은 0.42 confidence다”보다 “초기 reviewer confidence는 높았지만 line evidence가 약하고 독립 corroboration이 없어 감쇠되었다”는 설명을 더 유용하게 받아들일 수 있다.

Calibration 논문은 confidence를 실제 correctness와 비교하는 평가를 필요로 한다. Golden-bug benchmark와 사람이 labeling한 PR sample을 사용해 confidence bucket별 correctness를 측정할 수 있다. Expected calibration error, Brier score, confidence/correctness correlation 같은 지표가 후보가 된다. 또한 model-specific multiplier가 특정 모델의 과신을 줄이는지, active participant denominator가 reviewer failure 상황에서 confidence를 과대평가하지 않게 하는지 실험할 수 있다.

한계도 명확하다. Correctness labeling은 비용이 높고, 모델 업데이트로 calibration이 drift될 수 있다. 따라서 confidence trace는 고정된 정답이 아니라 지속적으로 재평가되는 운영 artifact로 보아야 한다. 이 논문의 핵심은 완벽한 confidence score가 아니라, confidence가 어떻게 만들어졌는지 설명 가능한 구조를 제공하는 것이다.

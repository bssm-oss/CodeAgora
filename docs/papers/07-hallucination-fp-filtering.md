# LLM 코드 리뷰의 환각 및 오탐 필터링

## 초록

본 논문은 대규모 언어 모델(LLM) 기반 코드 리뷰 시스템에서 빈번하게 발생하는 환각(hallucination)과 오탐(false positive) 문제를 체계적으로 분석하고, CodeAgora가 이를 완화하기 위해 설계한 다단계 필터링 스택의 구조와 원리를 제시한다. LLM은 실제 코드 변경(diff)에 존재하지 않는 취약점이나 버그를 그럴듯하게 지적하는 경향이 있다. 이러한 환각성 오탐은 자동화된 코드 리뷰의 신뢰성을 저해하며, 실제 개발 현장에서는 불필요한 triage 비용과 개발자 피로도를 유발한다. CodeAgora는 파일/라인 존재 검증, 증거 품질 평가, 추측성 주장 패널티, 무이슈 로그 게이팅, 고심각도 단독 발견 감쇠 등 다층적 필터를 결합하여 환각성 오탐을 효과적으로 줄이고자 한다.

## 키워드

LLM, 코드 리뷰, 환각, 오탐, 필터링, 증거 기반 검증, false positive, hallucination, CodeAgora

## 서론

대규모 언어 모델을 활용한 코드 리뷰 자동화는 소프트웨어 개발의 생산성과 품질을 높일 수 있는 잠재력을 지닌다. 그러나 LLM 기반 리뷰는 실제 코드 변경에 존재하지 않는 문제를 그럴듯하게 지적하는 환각(hallucination)과 오탐(false positive) 현상이 빈번하게 발생한다. 이러한 현상은 LLM의 언어적 유창성과 확률적 추론 특성에서 기인하며, 실제로는 존재하지 않는 취약점이나 버그를 개발자에게 경고함으로써 신뢰성 저하와 triage 비용 증가를 초래한다. 본 논문은 CodeAgora 시스템이 이러한 환각성 오탐을 어떻게 체계적으로 감지하고 줄이는지, 그 설계와 구현 원리를 상세히 기술한다.

## 배경 및 문제 정의

LLM은 자연어 처리에서 뛰어난 성능을 보이지만, 코드 리뷰 맥락에서는 실제 diff에 없는 문제를 plausibly 주장하는 경향이 있다. 예를 들어, 변경된 코드와 무관한 파일이나 라인에 취약점이 있다고 지적하거나, 존재하지 않는 함수 호출, 이미 해결된 버그, 혹은 단순한 스타일 문제를 심각한 보안 결함으로 과장하는 사례가 보고된다. 기존의 단순 합의 기반(majority vote) 필터링은 여러 모델이 같은 환각을 반복할 경우 오탐을 효과적으로 걸러내지 못한다. 따라서 실제 코드 변경과의 연결성, 증거의 질, 주장 방식의 신뢰성 등을 종합적으로 평가하는 다층적 필터링이 필요하다.

## 방법 및 시스템 설계

CodeAgora의 환각 및 오탐 필터링 스택은 다음과 같은 계층적 구조로 설계된다.

1. **파일/라인 존재 검증**: 각 finding이 참조하는 파일과 라인이 실제 diff에 존재하는지 확인한다. 존재하지 않는 위치를 지적한 finding은 환각 가능성이 높으므로 우선적으로 필터링된다.
2. **증거 품질 평가**: finding이 제시하는 evidence가 실제 코드 변경과 직접적으로 연결되는지 평가한다. 예를 들어, diff의 특정 변경 라인에 대한 구체적 언급, 코드 스니펫, 테스트 케이스 등 실증적 근거가 있는지 점검한다.
3. **추측성 주장 패널티**: “~일 수 있다”, “잠재적으로” 등 추측성 표현이 포함된 finding에는 패널티를 부여하여 신뢰도를 낮춘다.
4. **고심각도 단독 발견 감쇠**: 심각도가 높은 finding이 단일 reviewer에 의해만 제기된 경우, 그 신뢰도를 추가로 감쇠(dampening)한다. 여러 reviewer의 독립적 corroboration이 없는 고위험 finding은 환각일 가능성이 높다.
5. **무이슈 로그 게이팅**: “문제 없음”, “이상 없음” 등 로그성 출력과 실제 finding을 명확히 분리하여, 무의미한 긍정적 진술이 오탐 필터를 우회하지 못하도록 한다.

이러한 계층적 필터는 단일 모델의 합의에 의존하지 않고, 실제 코드 변경과의 연결성과 증거 기반성을 중심으로 환각성 오탐을 체계적으로 감지한다.

## 평가 계획 및 예비 증거

CodeAgora의 환각 및 오탐 필터링 효과를 평가하기 위해 다음과 같은 실험 설계를 제안한다.

- 필터 적용 전후의 false positive rate(오탐율) 비교 실험
- high-severity hallucination(고심각 환각) 감소율 측정
- recall(실제 버그 검출률) 손실 여부 분석
- 각 필터 계층별 ablation study(제거 실험)를 통한 기여도 평가

예비적으로, `src/tests/learning-filter*`, `src/tests/confidence*` 등에서 필터별 효과와 오탐 감소 사례가 관찰되었으며, `docs/HALLUCINATION_FILTER_DESIGN.md`에 상세 설계와 사례가 정리되어 있다.

## 논의 및 한계

강력한 필터는 오탐을 줄이는 데 효과적이지만, 실제로 존재하는 버그의 recall을 저하시킬 위험이 있다. 또한, benchmark fixture가 실제 환각 분포를 완전히 대표하지 못할 수 있으며, LLM의 drift나 새로운 버그 유형에 대한 적응성도 추가 연구가 필요하다. 필터의 기준이 지나치게 엄격할 경우, 잠재적 위험 신호까지 누락될 수 있으므로, precision과 recall의 균형을 지속적으로 모니터링해야 한다.

## 결론

LLM 기반 코드 리뷰의 환각 및 오탐 문제는 단순 합의 기반 필터링만으로는 충분히 해결되지 않는다. CodeAgora의 계층적 필터링 스택은 파일/라인 검증, 증거 평가, 추측성 패널티, 단독 발견 감쇠, 로그 게이팅 등 다양한 기법을 결합하여 환각성 오탐을 효과적으로 줄인다. 향후에는 각 필터의 정량적 효과와 실제 개발 현장에서의 적용 경험을 추가적으로 축적할 필요가 있다.

## 참고문헌 및 소스 앵커

- `docs/HALLUCINATION_FILTER_DESIGN.md`
- `docs/MAD_RESEARCH_AND_IMPROVEMENTS.md`
- `src/tests/learning-filter*`
- `src/tests/confidence*`

## TODO (실증적 완성 과제)

- hallucination taxonomy(환각 유형 분류) 작성
- filter별 example case(사례) 추가
- ablation table(계층별 제거 실험 표) 설계 및 결과 추가

## 확장 본문 초안

LLM 코드 리뷰에서 false positive는 단순한 noise가 아니다. 특히 보안, 데이터 손실, concurrency bug처럼 심각도가 높은 claim은 개발자의 즉각적인 대응을 요구한다. 이때 finding이 실제 diff에 근거하지 않으면 개발자는 많은 시간을 낭비하고, 자동 리뷰 시스템 전체에 대한 신뢰를 잃는다. CodeAgora의 hallucination/FP filtering은 이 문제를 모델 출력 이후의 독립 검증 계층으로 다룬다.

필터링의 첫 단계는 location validation이다. 모델이 언급한 파일과 라인이 실제 diff 또는 repository에 존재하는지 확인하지 않으면, 존재하지 않는 코드에 대한 리뷰가 downstream으로 전달될 수 있다. 두 번째 단계는 evidence quality scoring이다. 단순히 파일이 존재하는 것만으로는 충분하지 않다. Finding의 주장과 diff hunk 사이에 직접적인 연결이 있는지, 변경된 코드가 실제로 주장된 실행 경로에 영향을 주는지 평가해야 한다.

Speculation penalty는 evidence가 약한 추측성 finding의 confidence를 낮추는 방식으로 작동해야 한다. No-issues log gating은 모델이 “문제 없음”을 설명하는 문장을 실제 finding으로 오인하지 않게 한다. Lonely high-severity dampener는 단독 reviewer가 강한 severity를 주장하지만 evidence와 corroboration이 부족한 경우 과도한 경보를 줄인다.

평가는 filter stack 전체와 각 구성 요소의 ablation을 포함해야 한다. Filter를 제거했을 때 FP가 얼마나 증가하는지, 특정 필터가 recall을 손상시키는지, high-severity hallucination에 특히 효과적인 필터가 무엇인지 측정해야 한다. 이 논문은 CodeAgora의 신뢰성 논문군 중 가장 중요한 축이며, golden-bug FP regression fixture와 직접 연결된다.

# High-confidence Corroborated False Positive 분석

## 초록

본 논문은 여러 LLM이 동일한 잘못된 주장을 반복할 때 발생하는 high-confidence corroborated false positive 문제를 체계적으로 분석한다. 단순한 다수결이나 corroboration(합의 기반) 방식은 모델 간 공유 편향(shared bias)으로 인해 잘못된 finding을 더욱 강하게 만들 수 있다. CodeAgora는 corroboration-only baseline, evidence-filtered corroboration, debate-enabled filtering 등 다양한 합의 구조를 비교하여, 반증 가능한 evidence gate의 필요성과 한계를 논의한다.

## 키워드

LLM, 코드 리뷰, corroboration, false positive, 합의 기반, evidence gate, CodeAgora

## 서론

LLM 기반 코드 리뷰 시스템은 여러 reviewer(모델/agent)의 합의(corroboration)를 통해 finding의 신뢰도를 높인다. 그러나 여러 모델이 동일한 잘못된 주장을 반복할 경우, 단순 합의 기반 시스템은 오히려 high-confidence false positive를 강화하는 failure mode에 빠질 수 있다. 본 논문은 corroboration의 한계와 evidence gate의 필요성을 CodeAgora의 실험과 사례를 통해 분석한다.

## 배경 및 문제 정의

corroboration은 finding에 대해 여러 reviewer가 독립적으로 지적할 때 신뢰도를 높이는 방식이다. 하지만 LLM은 유사한 학습 데이터와 프롬프트 구조로 인해 동일한 편향을 공유할 수 있으며, 이로 인해 실제로 존재하지 않는 문제에 대해 여러 reviewer가 일치된 잘못된 주장을 할 수 있다. FP regression fixture 등에서 이러한 현상이 반복적으로 관찰된다. 단순 합의 기반 시스템은 evidence 검증 없이 corroboration만으로 finding을 채택할 경우, 오히려 false positive를 강화하는 blind spot이 발생한다.

## 방법 및 시스템 설계

1. **High-confidence FP 사례 분류**: 여러 reviewer가 동일한 잘못된 finding을 high-confidence로 주장한 사례를 체계적으로 분류한다.
2. **Corroboration-only baseline 설정**: evidence 검증 없이 corroboration만으로 finding을 채택하는 baseline을 구축한다.
3. **Evidence-filtered corroboration**: corroboration이 있더라도, finding의 evidence가 실제 diff와 연결되는지 검증하는 필터를 추가한다.
4. **Debate-enabled filtering**: L2 debate(토론) 구조를 도입하여, finding에 대한 반증 가능성 및 evidence 기반 토론을 통해 false positive를 억제한다.

## 평가 계획 및 예비 증거

- 동일 FP fixture를 여러 번 실행하여 corroboration 기반 FP의 반복성 측정
- 모델 조합별 FP 발생률 및 corroboration 점수와 correctness(정답)의 상관관계 분석
- corroboration-only, evidence-filtered, debate-enabled filtering의 precision/recall 비교

예비적으로, `README.md` baseline section, `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`, `benchmarks/golden-bugs/`, FP regression fixtures 등에서 corroboration failure 사례와 evidence gate의 효과가 관찰되었다.

## 논의 및 한계

FP fixture가 특정 failure mode에 치우칠 수 있으며, 모델 업데이트나 drift로 인해 동일 failure가 재현되지 않을 수 있다. corroboration rule의 설계가 주관적일 수 있고, evidence gate의 기준이 지나치게 엄격하면 실제 버그까지 누락될 위험이 있다. debate-enabled filtering은 비용과 latency가 증가할 수 있다.

## 결론

High-confidence corroborated false positive는 LLM 코드 리뷰 시스템의 합의 기반 구조가 갖는 근본적 한계 중 하나이다. CodeAgora는 corroboration-only, evidence-filtered, debate-enabled filtering 등 다양한 구조를 비교하여, evidence gate의 필요성과 한계를 실증적으로 제시한다. 향후에는 corroboration failure taxonomy, evidence gate 기준 정교화, 실제 PR 사례 기반 평가가 필요하다.

## 참고문헌 및 소스 앵커

- `README.md` baseline section
- `docs/for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md`
- `benchmarks/golden-bugs/`
- FP regression fixtures

## TODO (실증적 완성 과제)

- FP blind spot 사례 정리
- corroboration failure taxonomy 작성
- evidence gate 비교 실험 설계

## 확장 본문 초안

다중 모델 시스템에서 corroboration은 직관적으로 강한 신뢰 신호처럼 보인다. 서로 다른 모델이 같은 문제를 지적했다면 그 finding은 더 믿을 만해 보인다. 그러나 LLM들은 학습 데이터, common bug narrative, prompt framing을 공유할 수 있기 때문에 같은 잘못된 주장을 반복할 수 있다. 이것이 high-confidence corroborated false positive 문제다.

이 문제는 단일 모델 false positive보다 위험하다. 단일 모델의 이상한 주장은 쉽게 무시될 수 있지만, 여러 모델이 같은 high-severity claim을 반복하면 시스템은 이를 강한 합의로 해석할 수 있다. 특히 security finding은 “가능성 있는 공격 경로”를 그럴듯하게 서술하기 쉬워, evidence가 약해도 설득력 있어 보인다.

CodeAgora는 이 문제를 evidence-filtered corroboration으로 다뤄야 한다. Corroboration은 finding text의 유사성이 아니라 root cause와 diff evidence의 공유를 기준으로 계산되어야 한다. 여러 모델이 같은 파일을 언급하더라도 실제 변경 line과 주장 사이의 연결이 없으면 confidence를 높여서는 안 된다. L2 debate도 corroborated FP를 반박하는 단계로 사용될 수 있다.

평가는 FP regression fixture를 반복 실행해 수행한다. Corroboration-only baseline, evidence-filtered corroboration, debate-enabled filtering을 비교하고, high-confidence FP가 어떤 조건에서 살아남는지 분석한다. 이 논문은 multi-agent consensus가 항상 좋은 것은 아니라는 점을 보여주는 중요한 보완 논문이다.

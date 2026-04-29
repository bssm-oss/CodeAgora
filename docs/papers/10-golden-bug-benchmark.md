# Golden-bug Fixture를 이용한 코드 리뷰 회귀 벤치마크

## 초록

본 논문은 LLM 기반 코드 리뷰 시스템의 품질을 재현 가능하게 측정하기 위한 golden-bug benchmark 설계와 평가 체계를 제안한다. CodeAgora는 실제 버그가 포함된 recall case와 finding이 없어야 하는 false-positive(FP) regression case를 함께 사용하여, 버그 탐지 능력과 오탐 억제 능력을 동시에 평가한다. fixture schema, scoring algorithm, baseline 결과 등 구체적 구현과 실험 설계를 제시한다.

## 키워드

LLM, 코드 리뷰, benchmark, golden-bug, recall, false positive, regression, CodeAgora

## 서론

LLM 기반 코드 리뷰 시스템의 품질을 객관적이고 재현 가능하게 평가하려면, 실제 버그 탐지 능력뿐 아니라 오탐 억제 능력까지 측정할 수 있는 표준화된 benchmark가 필요하다. 기존 연구는 주로 recall(실제 버그 탐지율)에 집중하였으나, LLM의 plausible false positive(그럴듯한 오탐) 문제를 함께 평가하지 않으면 실질적 품질을 보장할 수 없다. 본 논문은 CodeAgora가 설계한 golden-bug benchmark의 구조와 평가 지표, 실험 설계를 상세히 기술한다.

## 배경 및 문제 정의

기존 코드 리뷰 benchmark는 실제 버그가 포함된 recall case만을 중심으로 설계되어, 오탐 억제 능력 평가가 미흡하다. LLM 기반 시스템은 실제 diff에 없는 문제를 plausibly 지적하는 경향이 있으므로, finding이 없어야 하는 FP regression case를 반드시 포함해야 한다. 또한, fixture schema의 일관성, scoring algorithm의 투명성, baseline 결과의 재현 가능성이 중요하다. CodeAgora는 recall case와 FP regression case를 모두 포함하는 fixture 세트와, live pipeline run 및 precomputed result scoring을 지원하는 평가 체계를 구축하였다.

## 방법 및 시스템 설계

1. **Recall fixture 정의**: expectedFindings(실제 버그 목록)가 포함된 fixture를 설계하여, 시스템의 버그 탐지 능력을 평가한다.
2. **FP regression fixture 정의**: expectedFindings가 빈 fixture를 설계하여, 오탐 억제 능력을 평가한다.
3. **Scoring algorithm**: recall@k(상위 k개 finding에서의 recall), FP per fixture(오탐 개수) 등 정량적 지표를 산출한다.
4. **Live pipeline run과 precomputed result scoring**: 실제 리뷰 파이프라인 실행 결과와, 미리 계산된 결과를 모두 평가할 수 있도록 한다.
5. **Fixture schema 및 baseline 결과 관리**: fixture의 구조와 baseline 결과를 공개하여, 재현성과 비교 가능성을 높인다.

## 평가 계획 및 예비 증거

- seed fixture 확장 및 다양한 버그 유형/난이도 반영
- 모델/provider별 recall@k, FP per fixture 비교 실험
- filter, debate 등 품질 개선 메커니즘의 ablation study
- FP regression fixture 반복 실행을 통한 오탐 억제력 평가

예비적으로, `benchmarks/golden-bugs/`, `README.md` benchmark section, `src/tests/*bench*`, `docs/MAD_RESEARCH_AND_IMPROVEMENTS.md` 등에서 benchmark 설계와 baseline 결과가 정리되어 있다.

## 논의 및 한계

fixture 수가 적으면 일반화가 어렵고, synthetic bug와 실제 PR bug의 분포 차이로 인해 평가 결과가 현실을 완전히 반영하지 못할 수 있다. scoring algorithm의 설계에 따라 결과 해석이 달라질 수 있으며, benchmark fixture의 지속적 확장과 실제 사례 반영이 필요하다.

## 결론

Golden-bug benchmark는 LLM 코드 리뷰 시스템의 버그 탐지와 오탐 억제 능력을 동시에 평가할 수 있는 표준화된 평가 체계이다. CodeAgora는 recall case와 FP regression case, 일관된 fixture schema, 투명한 scoring algorithm, baseline 결과 공개 등으로 재현성과 비교 가능성을 높였다. 향후에는 fixture 확장, scoring 지표 다양화, 실제 PR 사례 반영이 필요하다.

## 참고문헌 및 소스 앵커

- `benchmarks/golden-bugs/`
- `README.md` benchmark section
- `src/tests/*bench*`
- `docs/MAD_RESEARCH_AND_IMPROVEMENTS.md`

## TODO (실증적 완성 과제)

- fixture schema 정리
- scoring algorithm 설명
- baseline result table 작성

## 확장 본문 초안

LLM 코드 리뷰 시스템을 개선하려면 반복 가능한 평가 기준이 필요하다. 실제 PR에서 우연히 발견된 bug 사례만으로는 변경 전후 성능을 비교하기 어렵고, 모델 provider가 변하면 결과도 달라진다. Golden-bug fixture는 이런 문제를 줄이기 위해 입력 diff, 기대 finding, 허용 가능한 match criteria를 명시하는 평가 단위다.

CodeAgora의 benchmark 철학은 recall case와 FP regression case를 함께 둔다는 점에 있다. Recall case는 시스템이 반드시 찾아야 하는 bug를 포함한다. 예를 들어 off-by-one, null dereference, SQL injection 같은 seed fixture가 이에 해당한다. FP regression case는 expectedFindings가 비어 있으며, 시스템이 아무 문제도 보고하지 않아야 한다. 이 두 종류를 함께 측정해야 “버그를 잘 찾는다”와 “없는 문제를 만들지 않는다”를 동시에 평가할 수 있다.

Scoring은 live pipeline과 precomputed result를 모두 지원해야 한다. Live run은 실제 모델과 provider 상태를 반영하지만 비용과 변동성이 있다. Precomputed scoring은 빠르고 재현 가능하지만 모델 drift를 반영하지 못한다. 따라서 연구용 평가는 두 방식을 분리해 사용하고, release regression gate는 precomputed 또는 mock 기반으로 빠르게 수행할 수 있다.

주요 지표는 recall@k, FP per fixture, severity correctness, file/line match accuracy다. 향후 benchmark는 fixture 수를 늘리고, 언어와 bug class를 다양화해야 한다. 또한 fixture가 너무 단순하면 모델이 pattern matching으로 해결할 수 있으므로, 실제 PR에서 추출한 복합 사례를 포함하는 것이 중요하다.

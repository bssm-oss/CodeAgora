# GitHub PR 리뷰 자동화와 SARIF/Inline Comment 통합

## 초록 초안

본 논문은 CodeAgora가 LLM 코드 리뷰 결과를 GitHub PR workflow에 통합하는 방식을 다룬다. 핵심 요소는 PR diff parsing, inline comment, summary verdict, commit status, SARIF output, skip label이다.

## 핵심 연구 질문

LLM 코드 리뷰 결과를 GitHub PR 워크플로우에 자연스럽게 통합하려면 어떤 출력 형식이 필요한가?

## 주장

LLM 리뷰 결과는 개발자가 이미 사용하는 PR 인터페이스 안에서 triage 가능한 annotation과 status로 표현되어야 한다.

## 방법

- PR diff를 GitHub context에서 생성한다.
- finding을 file/line annotation으로 변환한다.
- summary verdict와 commit status를 제공한다.
- SARIF output으로 security/code scanning 흐름과 연결한다.

## 근거와 소스 앵커

- `docs/5_GITHUB_INTEGRATION.md`
- `src/tests/github-*`
- `action.yml`
- `.github/workflows/`

## 실험 설계

- annotation precision 평가.
- developer triage time 비교.
- status check policy별 workflow friction 분석.

## 타당성 위협

- GitHub API 정책 변경에 영향을 받을 수 있다.
- inline comment가 많으면 오히려 noise가 될 수 있다.

## 작성 TODO

- GitHub integration sequence diagram 작성.
- SARIF mapping 표 작성.
- PR comment examples 추가.

## 확장 본문 초안

### 1. 서론

코드 리뷰 자동화 도구는 개발자가 이미 사용하는 협업 표면에 자연스럽게 통합되어야 한다. GitHub PR은 현대 오픈소스와 팀 개발에서 핵심적인 리뷰 공간이며, 자동 리뷰 결과가 별도 대시보드에만 존재하면 triage 비용이 증가한다. CodeAgora의 GitHub 통합은 PR diff parsing, inline comment, summary verdict, commit status, SARIF output을 통해 LLM 리뷰 결과를 GitHub workflow 안으로 가져온다.

본 논문은 LLM 리뷰 결과를 GitHub PR에 표현할 때 필요한 출력 형식과 정책을 다룬다. 핵심은 “모델이 무엇을 말했는가”가 아니라 “개발자가 PR 화면에서 어떤 action을 취할 수 있는가”다.

### 2. 문제 배경

LLM 리뷰는 장문의 markdown report를 생성하기 쉽다. 그러나 PR 환경에서 개발자는 파일과 라인에 연결된 comment, 전체 verdict, CI status, security scanning report를 기대한다. finding이 특정 diff hunk에 연결되지 않으면 reviewer는 맥락을 다시 찾아야 한다. 반대로 comment가 너무 많으면 noise가 된다.

CodeAgora의 GitHub integration은 finding을 GitHub-compatible annotation으로 변환하고, summary comment와 status check를 함께 제공하는 방향을 취한다. SARIF output은 security/code scanning 도구와의 연결 가능성을 제공한다. Skip label은 CI friction을 줄이는 운영 장치다.

### 3. 방법

GitHub PR integration은 먼저 base와 head 사이의 diff를 생성한다. 이후 CodeAgora pipeline이 finding을 생성하고, mapper가 finding의 file/line 정보를 PR diff 위치로 변환한다. Inline comment는 구체적인 code location에 부착되고, summary comment는 전체 verdict와 top issues를 요약한다. Commit status는 PR merge policy와 연결될 수 있다.

SARIF mapping은 보안 및 정적 분석 ecosystem과의 호환성을 높인다. Finding severity, rule id, location, message를 SARIF 구조에 맞춰 변환하면 GitHub code scanning 같은 표면에서도 결과를 소비할 수 있다.

### 4. 평가 계획

평가는 annotation precision, stale comment rate, developer triage time, PR noise를 중심으로 한다. 동일 리뷰 결과를 markdown-only, inline comments, SARIF+status 조합으로 제공하고 개발자의 처리 시간을 비교할 수 있다. 또한 line mapping 실패율과 large diff에서의 comment placement 정확도를 측정해야 한다.

### 5. 논의

GitHub 통합은 자동화 강도와 개발자 통제 사이의 균형이 중요하다. 모든 high-severity finding을 blocking status로 만들면 false positive가 개발 흐름을 막을 수 있다. 반대로 모든 finding을 informational comment로만 두면 실제 버그가 무시될 수 있다. 따라서 merge policy는 프로젝트 risk tolerance에 맞춰 설정되어야 한다.

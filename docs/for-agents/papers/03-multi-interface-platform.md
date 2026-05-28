# 멀티 인터페이스 코드 리뷰 플랫폼

## 초록 초안

본 논문은 CodeAgora가 동일한 코드 리뷰 파이프라인을 CLI, GitHub Action, MCP, desktop app으로 노출하는 방식을 다룬다. 핵심은 기능을 UI마다 재구현하는 것이 아니라, 리뷰 세션과 파이프라인을 공통 도메인 모델로 유지하고 인터페이스별 entrypoint를 분리하는 것이다.

## 핵심 연구 질문

CLI, GitHub Action, MCP, desktop app을 하나의 코드 리뷰 경험으로 통합하려면 어떤 경계가 필요한가?

## 주장

공통 pipeline core와 얇은 interface adapter를 분리하면 다양한 개발자 접점에서 일관된 리뷰 경험을 제공할 수 있다.

## 방법

- CLI는 batch review와 session browsing을 담당한다.
- GitHub Action은 PR 자동화와 annotation을 담당한다.
- MCP는 AI IDE tool interface를 제공한다.
- Desktop app은 retired UI packages의 interactive review exploration 역할을 통합한다.

## 근거와 소스 앵커

- `docs/for-users/EXTENSIONS.md`
- `docs/archived/DESKTOP_APP_CONSOLIDATION.md`
- `docs/for-users/5_GITHUB_INTEGRATION.md`
- `docs/archived/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md`
- `packages/mcp/`

## 실험 설계

- 동일 session을 여러 interface에서 소비하는 시나리오 테스트.
- interface별 time-to-review 비교.
- 사용자 task별 적합 interface 분류.

## 타당성 위협

- 실제 사용자 연구가 없으면 UX 주장은 제한적이다.
- 각 interface의 성숙도가 다를 수 있다.

## 작성 TODO

- interface adapter 구조도 작성.
- CLI, MCP, Web API command mapping 표 추가.
- session lifecycle 예시 추가.

## 확장 본문 초안

개발자는 하나의 인터페이스만 사용하지 않는다. 빠른 로컬 확인은 CLI에서 수행하고, 팀 협업은 GitHub PR에서 이루어지며, 긴 session 탐색은 desktop app이 담당하고, AI IDE에서는 MCP tool 호출이 자연스럽다. CodeAgora는 이러한 다양한 접점을 별도 제품으로 분리하지 않고, 동일한 review pipeline을 여러 adapter로 노출하는 방식을 취한다.

멀티 인터페이스 설계에서 공유되어야 하는 것은 pipeline core, config, session model, finding schema다. 분리되어야 하는 것은 user interaction, rendering, authentication context, trigger mechanism이다. CLI 중심 도구는 자동화와 scriptability가 강하지만 긴 결과를 탐색하기 어렵다. Desktop UI는 탐색성이 좋지만 terminal workflow와 떨어질 수 있다. GitHub Action은 협업에 좋지만 PR 생성 이전의 빠른 feedback에는 적합하지 않다. MCP는 AI IDE와 자연스럽지만 표준 tool schema와 packaging 안정성을 요구한다.

CodeAgora는 이 문제를 interface adapter 패턴으로 다룬다. CLI는 `agora review`, `agora sessions` 같은 명령으로 batch와 탐색 workflow를 제공한다. GitHub Action은 PR diff를 생성하고 결과를 comment/status/SARIF로 변환한다. MCP는 review 기능을 tool 단위로 나누어 agent가 호출할 수 있게 한다. Desktop app은 session history, model leaderboard, discussion trace를 시각화한다.

공통 session model은 interface 간 일관성을 만든다. CLI에서 생성한 session을 desktop app에서 탐색하거나, MCP의 `explain_session`이 같은 session을 설명할 수 있다면 사용자 경험은 분절되지 않는다. 평가는 task별 interface 적합성을 비교해야 한다. “현재 diff 빠른 확인”, “PR 리뷰 자동화”, “이전 session 원인 분석”, “AI IDE에서 설정 확인” 같은 task를 정의하고 각 interface의 time-to-completion과 오류율을 측정할 수 있다.

멀티 인터페이스는 유지보수 비용을 높인다. Core schema가 흔들리면 모든 adapter가 영향을 받는다. 따라서 schema versioning과 interface contract test가 중요하다.

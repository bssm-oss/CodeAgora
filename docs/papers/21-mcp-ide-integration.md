# MCP 기반 IDE 통합

## 초록 초안

본 논문은 CodeAgora의 MCP 서버를 통한 AI IDE 통합을 다룬다. CodeAgora는 `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain_session`, config tools를 MCP tool set으로 노출하여 Claude Code, Cursor 등 MCP-compatible 환경에서 코드 리뷰 파이프라인을 사용할 수 있게 한다.

## 핵심 연구 질문

코드 리뷰 파이프라인을 MCP tool set으로 노출하면 AI IDE에서 어떤 상호작용이 가능해지는가?

## 주장

MCP는 코드 리뷰를 외부 CLI 명령이 아니라 IDE agent가 호출 가능한 structured tool로 바꾸며, quick/full review와 session explanation 같은 상호작용을 가능하게 한다.

## 방법

- MCP server binary를 별도 package로 배포한다.
- review와 config 기능을 tool 단위로 분리한다.
- quick review와 full pipeline review를 구분한다.
- session explanation을 tool로 제공한다.

## 근거와 소스 앵커

- `docs/EXTENSIONS.md`
- `packages/mcp/`
- `src/tests/sprint6-mcp*`
- `docs/release-alpha2-paper.md`

## 실험 설계

- IDE workflow latency 측정.
- tool granularity별 사용자 task success 비교.
- CLI 호출 대비 MCP tool 호출의 friction 비교.

## 타당성 위협

- MCP client별 behavior 차이가 크다.
- 실제 IDE 사용자 연구가 필요하다.

## 작성 TODO

- MCP tool table 작성.
- quick vs full review workflow 비교.
- MCP packaging lessons 포함.

## 확장 본문 초안

### 1. 서론

MCP 기반 IDE 통합은 코드 리뷰 파이프라인을 개발자의 에이전트 환경 안으로 가져오는 방법이다. CLI는 명령형 인터페이스를 제공하지만, AI IDE는 도구 호출, context passing, interactive follow-up을 중심으로 작동한다. CodeAgora의 MCP 서버는 review, dry-run, explanation, configuration 기능을 tool set으로 노출하여 agent가 코드 리뷰 파이프라인을 구조적으로 사용할 수 있게 한다.

본 논문은 MCP 통합의 핵심 가치를 “명령 실행”이 아니라 “agent-callable review capability”로 본다. IDE agent는 `review_quick`으로 빠른 L1 feedback을 얻고, `review_full`로 전체 L1-L2-L3 pipeline을 실행하며, `explain_session`으로 이전 결과를 해석할 수 있다.

### 2. 문제 배경

개발자는 코드를 작성하는 맥락 안에서 리뷰 피드백을 받고 싶어 한다. 별도 터미널 명령이나 GitHub PR 생성 이전에도, 현재 diff에 대해 빠른 검토가 필요할 수 있다. MCP는 이런 상호작용을 표준화된 tool interface로 제공한다. 그러나 MCP 서버는 packaging, runtime dependencies, tool schema, stdout protocol 안정성 같은 별도 과제를 갖는다.

CodeAgora v0.1.0-alpha.2 릴리스에서 MCP package surface와 runtime dependency가 별도 검증 대상이 된 것은 이 때문이다. MCP 통합은 기능뿐 아니라 배포와 실행 안정성이 중요하다.

### 3. 방법

MCP tool set은 granularity를 기준으로 나뉜다. `review_quick`은 빠른 feedback을 위해 L1 중심으로 동작하고, `review_full`은 토론과 최종 verdict까지 포함한다. `review_pr`은 GitHub context를 활용할 수 있으며, `dry_run`은 비용과 계획을 확인하는 용도다. `config_get`과 `config_set`은 IDE 안에서 설정을 확인하고 수정하는 경로를 제공한다.

MCP 서버는 CLI와 같은 core pipeline을 사용하되, 입출력을 MCP schema에 맞춘다. 이 구조는 pipeline logic duplication을 줄이고, CLI와 MCP의 결과 일관성을 유지한다.

### 4. 평가 계획

평가는 IDE workflow latency, tool invocation success rate, quick/full review 선택 적합성, user task success를 중심으로 한다. CLI 대비 MCP의 장점은 follow-up interaction에서 드러나므로, “finding 설명 요청”, “config 수정 후 재실행”, “PR 리뷰 요약” 같은 multi-turn task를 평가해야 한다.

### 5. 논의

MCP client마다 tool rendering과 permission model이 다르기 때문에, 통합 경험은 환경별로 달라질 수 있다. 또한 MCP server packaging은 stdout protocol을 오염시키지 않아야 하므로 postinstall output, logging, help command behavior도 주의해야 한다.

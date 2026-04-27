# 변경 이력

## 2.x 마지막 레거시 릴리즈 (예정)

### 패키지 라인 리셋
- `codeagora@2.x`는 레거시 패키지 라인으로 취급합니다.
- 이후 리뷰 중심 릴리즈는 `@codeagora/review@0.x`에서 다시 시작합니다.
- CLI 바이너리 이름은 `codeagora`, `agora`를 유지하되, 향후 설치 경로는 `npm i -g @codeagora/review`가 됩니다.

### 제거되는 표면
- standalone web dashboard 패키지(`@codeagora/web`) 제거
- standalone terminal TUI 패키지(`@codeagora/tui`) 제거
- standalone webhook notifications 패키지(`@codeagora/notifications`) 제거
- `agora dashboard`, `agora tui`, `agora notify`, `agora review --notify` 제거

### 새 방향
- CLI, GitHub Action, MCP, core, shared 패키지는 유지합니다.
- 사람이 보는 로컬 UI는 향후 Tauri 데스크톱 앱 하나로 통합합니다.
- npm 재시작 계획은 `docs/NPM_PACKAGE_RESTART.md`에 문서화했습니다.

## 2.3.4 (2026-04-24)

### 메타데이터
- npm 패키지 repository, homepage, docs, issue 링크를 `bssm-oss/CodeAgora`로 수정
- GitHub Action 예시, init workflow 템플릿, SARIF 도구 메타데이터의 공개 repo URL 수정

## 2.3.3 (2026-04-16)

### Web UX
- Pipeline 페이지 WS 없이도 ReviewTrigger 폼 표시
- ReviewTrigger 제출 후 폼 리셋 + 성공 메시지
- Models/Costs empty state 안내 메시지
- Toast auto-dismiss 3초 → 5초

## 2.3.2 (2026-04-16)

### Fallback/Retry 강화
- **Error Classifier** — 에러를 rate-limited/auth/transient/permanent로 분류
- **AI SDK maxRetries: 0** — 이중 재시도 제거 (앱 레벨 완전 제어)
- **429 retry-after 인식** — 헤더 파싱 후 적절한 대기 시간 재시도
- **429는 circuit breaker 미기록** — rate limit ≠ 모델 고장
- **Fallback chain health check** — 죽은 모델 자동 skip
- **L2 supporter / L3 head verdict 1회 재시도** — transient/rate-limited만
- 리뷰어 응답률 2/5 → 5/5, 속도 196초 → 83초

## 2.3.1 (2026-04-16)

### Bug Fixes
- SARIF 출력 포맷 지원 (`--output sarif`)
- 빈 stdin 입력 시 exit 1 반환
- agreement 커맨드 result.json 없을 때 reviews/ fallback
- CI typecheck 에러 수정 (DiscussionVerdict, MockInstance, Dirent)
- Node 20 AbortSignal 호환성 수정

### 리팩터링 (10 PRs)
- CLI index.ts 1,302줄 → 292줄 (8개 모듈 추출)
- Core orchestrator 1,092줄 → 550줄 (4개 모듈 추출)
- 테스트: TUI 0 → 37개, CLI review 64개, Web API 통합 46개

## 2.3.0 (2026-04-13)

### Web Dashboard — Production Hardening
- **ErrorBoundary** — 모든 라우트에 크래시 복구 UI 적용
- **httpOnly cookie 인증** — `POST /api/auth`, HMAC 파생 세션 토큰
- **CORS origin pinning** — `CODEAGORA_CORS_ORIGINS` 환경 변수로 설정
- **세션 페이지네이션** — 상태/검색/날짜 범위 서버사이드 필터링
- **Pipeline state persistence** — `.ca/pipeline-state.json`, 크래시 복구
- **Config revert UX** — 저장 실패 시 Revert 버튼
- **WebSocket reconnect** — 재연결 시 sync 메시지로 상태 복구
- **DiffViewer 구문 강조** — 키워드, 문자열, 주석, 숫자

### Web Dashboard — Security (코드 리뷰 17건 반영)
- WS 쿼리 파라미터 인증 경로 제거 (토큰 로그 노출 방지)
- Cookie에 원본 토큰 대신 HMAC 파생 토큰 저장
- `DELETE /api/auth` 인증 필수
- `provider`/`model` 포맷 검증 추가

### Hallucination Filter — 4-Check 완성
- **Check 4 — 자기모순 감지**: "추가됨"이라 주장하나 실제 제거만 있는 경우 페널티
- **uncertainty 라우팅**: confidence < 20% → `uncertain` 배열로 분류 (휴먼 리뷰)
- 테스트 9 → 26개

### Plugin System — 서드파티 지원
- `.ca/plugins/` 디렉토리에서 동적 `import()`로 플러그인 로딩
- `codeagora-plugin.json` / `package.json`으로 플러그인 매니페스트 탐색
- AbortController 타임아웃 샌드박스 격리

### Stats
- 테스트: 226 files, 3,386 passing (+53)
- 커버리지: 73.7% statements / 84.2% branches / 87.1% functions

## 2.2.2 (2026-04-12)

- Phase 1 정리: 데드 코드 제거, i18n 키 동기화, 버전 정렬
- CLAUDE.md 정확도 수정 6건 (파이프라인 단계, 필터 레이어, 테스트 수, MCP 도구 수, 함수명, SSRF 방식)
- MCP 테스트 TS2322 타입 수정

## 2.2.1 (2026-04-02)

### MCP — CLI 동등성 + 확장
- 모든 리뷰 도구(review_quick/full/pr)에 13개 옵션 파라미터 추가 (provider, model, timeout 등)
- **review_pr** — PR 번호만으로 owner/repo git remote 자동 감지
- **staged review** — MCP에서 git staged 변경사항 직접 리뷰
- 신규 **config_get** 도구 — dot-notation 키로 설정 값 읽기
- 신규 **config_set** 도구 — Claude Code에서 설정 값 변경
- MCP 테스트 49개 신규 (합계 94개)

### Web Dashboard
- **대시보드 랜딩 페이지** — 통계 카드, 최근 활동, 주간 추이 차트, 빠른 실행
- **리뷰 트리거** — 웹 UI에서 리뷰 시작 (diff 텍스트, PR URL, staged 변경사항) + 실시간 WebSocket 진행
- **YAML 설정 편집** — converter.ts를 통한 전체 읽기/쓰기 지원
- **알림 센터** — 벨 아이콘, 드롭다운, 읽음/안읽음, REJECT/NEEDS_HUMAN 긴급 배지
- **세션 비교 페이지** — verdict/config/이슈 나란히 비교

### Stats
- 테스트: 181 files, 2895 passing

## 2.2.0 (2026-04-01)

### 신규: 4-Layer Hallucination Filter
- **Layer 1**: 사전 토론 환각 체크 — diff에 없는 파일/라인 참조 제거 (#428)
- **Layer 2**: Corroboration scoring — 단독 리뷰어 ×0.5, 3명 이상 동의 ×1.2 (#432)
- **Layer 3a**: HARSHLY_CRITICAL 토론 필수화 (#429)
- **Layer 3b**: Adversarial supporter 프롬프트 — "반증해봐" 방식 (#430)
- **Layer 3c**: 토론 컨텍스트에 정적 분석 증거 주입 (#431)
- 자기모순 필터, Evidence-level 중복 제거, "이미 처리됨" 패턴 인식

### 신규: Pre-Analysis Layer
- 시맨틱 Diff 분류, TypeScript 진단, 변경 영향 분석, AI 규칙 파일 감지, 경로 기반 리뷰 규칙

### 신규: Specialist Reviewer Personas
- 4종 내장: builtin:security, builtin:logic, builtin:api-contract, builtin:general

### 신규: Suggestion Verification
- CRITICAL+ 코드 제안을 TypeScript 트랜스파일러로 검증

### 신규: Triage Digest
- `📋 Triage: N must-fix · N verify · N ignore` 한 줄 요약

### 품질 결과
- 거짓 양성률: 100% → <25% (테스트 diff 기준)
- CRITICAL 거짓 양성: 9건 → 0건
- 테스트: 180 files, 2846 passing

## 2.1.1 (2026-04-01)

### Bug Fixes (12건)
- SUGGESTION 임계값 기본값 null (#287)
- 세션 ID / MCP 임시 파일 race condition (#290, #282)
- Webhook JSON.stringify 순환 참조 크래시 (#285)
- BanditStore 경로 모듈 로드 시점에 고정 (#278)
- 캐시 키에 전체 설정 포함 (#276)
- PipelineTelemetry 스테이지 타이밍 연결 (#274)
- 커스텀 프롬프트 `{{CONTEXT}}`, `{{PROJECT_CONTEXT}}` 플레이스홀더 (#312)

## 2.1.0 (2026-04-01)

### Security (7건)
- **CRITICAL** — 속도 제한기 메모리 누수: requestCounts Map 미정리 (#388)
- **CRITICAL** — X-Forwarded-For IP 스푸핑으로 속도 제한 우회 (#389)
- **CRITICAL** — readSurroundingContext 경로 탐색: 레포 외부 파일 읽기 (#392)
- **HIGH** — WebSocket 인증 토큰 URL 쿼리 문자열 노출 (#390)
- **HIGH** — 서버 시작 시 auth 토큰 stdout 출력 (#391)
- **HIGH** — checkFilePermissions stat 실패 시 true 반환 (fail-open) (#393)
- **HIGH** — 크레덴셜 디렉토리 0o700 모드 미적용 (#394)

### Pipeline Fixes (10건)
- 알 수 없는 파일 경로에 대한 심각도 에스컬레이션 제거 (#248)
- 혼합 심각도 그룹 다운그레이드 방지 (#249)
- 빌드 아티팩트 기본 제외 (dist/, 잠금 파일, *.min.js) (#228)
- L1 증거 내용(problem, evidence, suggestion)을 모더레이터 프롬프트에 주입 (#246)
- 신뢰도 기반 verdict triage: 0% 신뢰도 CRITICAL → NEEDS_HUMAN (#229, #236)
- Thompson Sampling: 탐색 슬롯 보장 + posterior 상한으로 단일 모델 독점 방지 (#232)

### Stats
- 테스트: 2702 → 2749 (174 files)

### Contributors
- **[@HuiNeng6](https://github.com/HuiNeng6)** — 파이프라인 수정, TUI 버그, 웹 대시보드 개선
- **[@dagangtj](https://github.com/dagangtj)** — i18n 마이그레이션
- **[@justn-hyeok](https://github.com/justn-hyeok)** — 보안 강화, 파이프라인 개편

## 2.0.0 (2026-03-XX)

### 주요 변경 사항 (Breaking Changes)
- **패키지 구조** — web/tui/mcp/notifications가 선택적 패키지로 분리 (`npm i -g @codeagora/web` 등)
- **프로바이더 티어** — Tier 1 (공식), Tier 2 (검증됨), Tier 3 (실험적)
- **모노레포 마이그레이션** — 8개 pnpm 워크스페이스 패키지

### 하이라이트
- **보안 강화** — CRITICAL 5건 + HIGH 12건 수정 (경로 탐색, SSRF, 셸 인젝션, 크레덴셜 저장)
- **테스트** — 1817 → 2671 (+854, 169 files)
- **24+ API 프로바이더** — Groq, Anthropic, OpenAI, Google, DeepSeek, OpenRouter 등
- **12개 CLI 백엔드** — Claude, Codex, Gemini, Copilot, Cursor, Aider, Goose, Cline 등
- **models.dev 연동** — 외부 모델 카탈로그 (3875개 모델, 가격/컨텍스트 윈도우/기능 메타데이터)
- **환경 자동 감지** — `agora init`이 API 키 + CLI 도구 감지 후 동적 프리셋 생성
- **HTML & JUnit 출력** — `--output html`/`--output junit`
- **MCP 서버** — 7개 도구 (이후 9개로 확장)
- **웹 대시보드** — Hono.js + React SPA, 실시간 WebSocket, 8개 페이지
- **GitHub Actions** — 인라인 PR 코멘트, commit status, SARIF 출력

---

## 2.0.0-rc.1 (2026-03-19)

### 주요 변경 사항 (Breaking Changes)
- **모노레포 마이그레이션** — 단일 패키지가 8개 pnpm 워크스페이스 패키지로 재구성됨 (`@codeagora/shared`, `@codeagora/core`, `@codeagora/github`, `@codeagora/notifications`, `@codeagora/cli`, `@codeagora/tui`, `@codeagora/mcp`, `@codeagora/web`)
- import 경로가 상대 경로 (`../types/core.js`)에서 패키지 import (`@codeagora/core`)로 변경됨

### 신규 패키지
- **@codeagora/mcp** — 7개 도구를 가진 MCP 서버 (review_quick, review_full, review_pr, dry_run, explain_session, get_leaderboard, get_stats). Claude Code, Cursor, Windsurf, VS Code 호환.
- **@codeagora/web** — Hono.js REST API + React SPA 웹 대시보드. 8개 페이지: 리뷰 결과, 실시간 파이프라인 진행, 모델 인텔리전스, 세션 히스토리, 비용 분석, 토론 뷰어, 설정 관리.

### 신규 기능 (Sprint 1-7)
- **GitHub 강화** — 인라인 토론 로그, 요약 토론 상세, 억제된 이슈 표시, 신뢰도 필터링, 리뷰 상태 배지, 성능 리포트, 이슈 히트맵, SARIF 토론 메타데이터, 재리뷰 시 세션 diff, 드라이런 미리보기 코멘트
- **웹훅** — HMAC 서명이 포함된 범용 웹훅, 이벤트 스트림 웹훅 (실시간 파이프라인 이벤트)
- **Discord** — 실시간 토론 스레드, 파이프라인 요약 임베드, 모더레이터 이벤트 이미터
- **밈 모드** — 배지, 판결, 토론, 성능 리포트의 대체 텍스트 (한국어 + 영어)
- **CLI 명령어** — `agora models` (리더보드), `agora explain` (세션 내러티브), `agora replay` (세션 재생), `agora agreement` (리뷰어 합의 매트릭스)
- **모델 인텔리전스** — Thompson Sampling 시각화, Devil's Advocate 추적, diff 복잡도 추정기, 리뷰어 다양성 점수
- **MCP 서버** — MCP 호환 클라이언트에 전체 파이프라인을 노출하는 7개 도구, 경량 리뷰 모드 (L1만), 컴팩트 출력 형식
- **웹 대시보드** — 실시간 WebSocket 파이프라인 진행, 어노테이션 diff 뷰어, 모델 리더보드, 비용 분석, 세션 히스토리 브라우저, 토론/디베이트 뷰어, 설정 관리 UI

### 보안 수정
- 페르소나 로딩, SARIF 출력, 세션 라우트, 설정 API에 경로 탐색 방지 적용
- 웹 서버를 127.0.0.1(루프백 전용)에 바인딩
- 범용 웹훅에 HMAC-SHA256 서명 검증
- 모든 사용자 대면 API 엔드포인트에 정규식 입력 검증
- CORS를 localhost 출처로만 제한

### 내부
- 4개 파서 재작성 (parseStance, 구조화 출력 포함 parseForcedDecision)
- 서킷 브레이커 통합 (L0 + L1 → 단일 구현)
- readFileSync → readFile 비동기 마이그레이션
- spawn 타임아웃 시 SIGKILL 에스컬레이션
- 437개 신규 테스트 (1443 → 1880), @testing-library/react 컴포넌트 렌더링 테스트 포함

## 1.1.1-rc.1 (2026-03-19)

### 개선 사항
- **TUI 전면 개편** — lazygit 스타일 마스터-상세 패널로 8개 화면 전면 재작성
- **테마 시스템** — 중앙화된 색상, 유니코드 아이콘 (●/○/▸/✓/✗), 둥근 테두리
- **7개 공유 컴포넌트** — Panel, ScrollableList, TextInput, Toast, HelpOverlay, TabBar, DetailRow
- **Config 화면** — reviewers/supporters/moderator 전체 CRUD, ? 도움말 오버레이, Ctrl+e $EDITOR, 1-5 탭 단축키
- **ModelSelector** — provider/ 프리픽스 검색, API 키 상태 아이콘, 캐시 로딩, 반응형 높이
- **상태 검사** — API Keys 탭에서 단일 프로바이더 (h), 전체 검사 (t), 재시도 (r)
- **프로바이더 상태** — 프리셋의 missing key 경고, 푸터의 키 개수, 리뷰어 목록의 상태 아이콘
- **Results 화면** — 모든 이슈 표시 (상위 5개만 아님), 심각도 요약 바, 마스터-상세 레이아웃
- **파이프라인 진행률** — 리뷰어 개수 표시, 스테이지 아이콘 (●/◐/○), 취소 힌트
- **리뷰어 복제** — c 키로 선택된 리뷰어 복제
- **검증자 경고** — 리뷰어 개수, 서포터 풀 크기, 토론 라운드 권장사항

### 버그 수정
- 설정에 moderator/discussion/errorHandling 필드 누락 시 preset apply 크래시 수정
- delete+add 시 리뷰어 ID 충돌 수정 (이제 max suffix 전략 사용)
- API 키가 소독되지 않은 상태로 process.env에 저장되는 문제 수정
- toast 알림의 setTimeout 타이머 누수 수정
- 상태 검사 promise rejection이 UI를 프리징하는 문제 수정
- spawn 전 $EDITOR 경로 검증 안 하는 문제 수정
- null config type cast가 런타임 크래시를 초래할 수 있는 문제 수정
- 대량 상태 검사에서 프로바이더 ID를 잃어버리는 문제 수정

### 내부
- L0: 모델 선택 시 includeReasoning 제약 강제 적용
- 57개 신규 테스트 (1386→1443), provider-status, theme, shared components 포함
- 3개 탭 파일에서 DetailRow 공유 컴포넌트 추출

## 1.1.0 (2026-03-17)

### 새 기능
- **Strict/Pragmatic 리뷰 모드** — 모드별 프리셋으로 임계값과 페르소나 자동 설정
- **한국어 지원** — L2/L3 프롬프트 완전 한국어화, language 설정 (`en`/`ko`)
- **자동 승인** — 사소한 diff(주석, 빈 줄, 문서만 변경) 감지 시 LLM 파이프라인 생략
- **커스텀 규칙** — `.reviewrules` YAML로 정규식 기반 정적 패턴 검사, L1 결과에 병합
- **신뢰도 점수** — 리뷰어 합의율 기반 0–100점, L2 합의 결과로 보정
- **학습 루프** — 기각된 패턴을 `.ca/learned-patterns.json`에 저장, 자주 기각되는 패턴 자동 억제
- **`agora learn`** — `--from-pr <number>` CLI 명령으로 과거 리뷰에서 학습
- **GitHub 토론 개선** — 라운드별 상세 로그 + 합의 아이콘, 네이티브 코드 제안 블록
- **심각도 에스컬레이션** — 파일 경로 매칭 실패 시 CRITICAL로 승격
- **정량적 힌트** — L3 판결 프롬프트에 추가하여 판단 품질 향상
- **Strict 모드** — WARNING 3개 이상 시 NEEDS_HUMAN 트리거
- **Init 위자드 개선** — 모드/언어 선택, 모든 기본 템플릿에 head 설정 포함

### 버그 수정
- 종합 안정성 수정 — 서킷 브레이커, 중복 제거, lint 정리
- 데드 코드 정리 + TUI 수정
- 안정성 수정 Phase 2-3 (나머지 28건)

### 내부
- `action.yml`을 소스 빌드에서 `npm install`로 전환
- Strict 모드 프리셋에 security-focused 페르소나 포함

## 1.0.3 (2026-03-17)

### 버그 수정
- `init` 시 기본 페르소나 파일 자동 생성

### 문서
- 로고 추가 및 배지 색상 브랜드 통일

## 1.0.2 (2026-03-17)

### 버그 수정
- CI에서 Node 18 제거 (ESLint 10은 Node 20+ 필요)

### 문서
- README에 npm/npx 설치 방법 추가

## 1.0.1 (2026-03-17)

패치 릴리즈 — 버전 범프만 (기능 변경 없음).

## 1.0.0 (2026-03-17)

첫 안정 릴리즈. rc.1–rc.8의 모든 기능 통합.

### 새 기능
- **GitHub Actions 통합** — PR 인라인 리뷰 코멘트, commit status check, SARIF 출력
- **15개 API 프로바이더** — OpenAI, Anthropic, Google, Groq, DeepSeek, Qwen, Mistral, xAI, Together, Cerebras, NVIDIA NIM, ZAI, OpenRouter, GitHub Models, GitHub Copilot
- **5개 CLI 백엔드** — claude, codex, gemini, copilot, opencode
- **LLM 기반 Head 판결** — L3 Head 에이전트가 LLM으로 추론 품질 평가 (규칙 기반 fallback)
- **과반수 합의** — checkConsensus가 >50% agree/disagree 투표 처리
- **의미적 파일 그룹핑** — import 관계 기반 클러스터링
- **리뷰어 페르소나** — strict, pragmatic, security-focused 페르소나 파일
- **설정 가능한 청킹** — maxTokens를 config에서 설정 가능
- **NEEDS_HUMAN 처리** — 자동 리뷰어 요청 + 라벨 추가
- **SARIF 2.1.0 출력** — GitHub Code Scanning 호환
- **안전한 크레덴셜** — API 키를 ~/.config/codeagora/credentials에 저장
- **TUI 붙여넣기 지원** — 모든 텍스트 입력에서 클립보드 붙여넣기 동작
- **CLI --pr 플래그** — 커맨드라인에서 직접 GitHub PR 리뷰
- **병렬 청크 처리** — 대규모 diff를 위한 적응형 동시성

### 버그 수정
- dist 빌드 크래시 수정 (로케일 JSON 미번들)
- 토론 매칭 수정 (substring 대신 정확한 filePath:line 매칭)
- forfeit threshold division by zero 수정
- CLI 플래그 (--provider, --model, --timeout, --no-discussion) 무시되는 문제 수정
- GitHub Action multiline output 깨짐 수정
- parser "looks good" false negative 수정
- 인라인 코멘트 position 에러 시 summary-only fallback
- doctor 포맷 테스트에서 ANSI 코드 제거 (CI 호환)
- CI lint 실패하는 미사용 import 제거

## 1.0.0-rc.1 ~ rc.7

초기 개발 릴리즈. 자세한 내용은 git 히스토리를 참고하세요.

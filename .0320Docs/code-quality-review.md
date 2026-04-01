# CodeAgora 코드 품질 종합 리뷰 리포트

**날짜:** 2026-03-20
**범위:** 8개 packages, 130+ 소스 파일
**리뷰어:** 6개 병렬 Opus 에이전트 (shared+core, cli+tui, github+notifications, mcp+web, test coverage, cross-package consistency)

---

## 요약

| 심각도 | 건수 |
|---|---|
| **CRITICAL** | 8 |
| **MAJOR** | 27 |
| **MINOR** | 30 |
| **총계** | **65** |

---

## CRITICAL (8건)

### 1. CLI 백엔드가 미검증 프롬프트를 명령줄 인자로 전달 — Argument Injection
`packages/core/src/l1/backend.ts:146-190`
`copilot`, `aider`, `goose` 등 `useStdin: false` 백엔드들이 사용자 diff 내용을 포함한 `input.prompt`를 `args` 배열에 직접 삽입. `spawn()` 사용으로 shell injection은 방지되나, 타겟 CLI 바이너리의 argument parsing 공격 가능.
**Fix:** 모든 백엔드를 `useStdin: true`로 전환하여 stdin으로 프롬프트 전달.

### 2. `getNextSessionId` 폴백 경로에서 세션 ID 충돌 — Race Condition
`packages/shared/src/utils/fs.ts:206-219`
Lock 재시도 소진 후 `Date.now() % 99 + 900` 으로 ID 생성. 같은 밀리초에 두 프로세스가 진입하면 동일 ID → 데이터 덮어쓰기.
**Fix:** `crypto.randomUUID()` 사용 또는 `mkdir({ recursive: false })`로 원자적 충돌 감지.

### 3. `sendDiscordPipelineSummary`에 webhook URL 검증 누락 — SSRF
`packages/notifications/src/discord-live.ts:211`
다른 모든 outbound HTTP 호출은 `validateWebhookUrl()`을 거치지만 이 함수만 예외. 악의적 config로 내부 네트워크 호스트 접근 가능.
**Fix:** 함수 첫 줄에 `validateWebhookUrl(webhookUrl)` 추가.

### 4. `as unknown as EvidenceDocument[]` — 런타임 크래시 유발 타입 캐스트
`packages/cli/src/formatters/review-output.ts:488`
`topIssues`와 `EvidenceDocument`는 필드 구조가 다름 (`title` vs `issueTitle`). double cast로 컴파일러 우회 후 존재하지 않는 필드 접근 시 런타임 에러.
**Fix:** 명시적 매핑 함수로 `topIssues` → `EvidenceDocument` 변환.

### 5. `shared` ↔ `core` 순환 의존성 — 아키텍처 레이어 위반
`packages/shared/src/utils/issue-mapper.ts:5`, `fs.ts:8`, `path-validation.ts:6-7`
`shared`가 `core`에서 `Result`, `EvidenceDocument` 등을 import하면서 `package.json`에 의존성 미선언. pnpm hoisting으로만 동작하며 publish 시 깨짐.
**Fix:** `Result<T>`, `ok`, `err` 등을 `shared`로 이동, `core`에서 re-export.

### 6. MCP 패키지 타입 체크 실패 — 빌드 산출물 누락
`packages/mcp/src/` 전체 (6개 크로스 패키지 import)
`core/dist/`에 `.d.ts` 파일 미생성으로 MCP 패키지의 모든 import가 TS2307 에러. 타입 안전성 보장 없이 배포 중.
**Fix:** `core`/`cli` 빌드 시 declaration emit 확인, `typecheck:ws`에 MCP 포함.

### 7. 자격증명 저장/로드 로직 테스트 없음 — 보안 코드 무검증
`packages/core/src/config/credentials.ts:18-71`
API 키를 디스크에서 읽고 `process.env`에 설정하고 `0o600`으로 저장하는 핵심 보안 로직이 테스트 0건.
**Fix:** loadCredentials/saveCredential 단위 테스트 추가.

### 8. Generic Webhook HMAC 서명 검증 테스트 없음
`packages/notifications/src/generic-webhook.ts:17-72`
HMAC-SHA256 서명, 시크릿 길이 검증, HTTPS 강제가 모두 무테스트.
**Fix:** 정합성 검증 단위 테스트 추가.

---

## MAJOR (27건)

### 타입 안전성 (7건)

| # | 이슈 | 위치 |
|---|---|---|
| 1 | `readJson<T>` 스키마 없이 호출 시 `as T` 무검증 캐스트 | `shared/src/utils/fs.ts:125-130` |
| 2 | `as unknown as ProviderInstance` 24회 반복 double-cast | `core/src/l1/provider-registry.ts:43-204` |
| 3 | `as any` 캐스트로 @clack/prompts 옵션 타입 체크 우회 | `cli/src/commands/init.ts:602,609` |
| 4 | 콜백 매개변수 20+ 곳에서 implicit `any` 타입 | `cli/init.ts`, `tui/ReviewersTab.tsx` 등 다수 |
| 5 | `JSON.parse` 결과 zod 미검증 (CLI 전반) | `cli/src/index.ts:785`, `costs.ts`, `sessions.ts` 등 |
| 6 | `useMemo` 내부 ref 변이 — React 순수성 위반 | `web/src/frontend/hooks/usePipelineEvents.ts:309-362` |
| 7 | `as Record<string, unknown>` 반복 캐스트 | `web/src/frontend/components/EventLog.tsx`, `Config.tsx` |

### 에러 핸들링 (4건)

| # | 이슈 | 위치 |
|---|---|---|
| 8 | 빈 catch 블록이 에러 로깅 없이 삼킴 (poster) | `github/src/poster.ts:144,154` |
| 9 | `postDiscord` 에러 무시 후 null 반환 | `notifications/src/discord-live.ts:57` |
| 10 | `NotificationConfig` 타입 core/notifications 간 중복 | `notifications/webhook.ts:10`, `core/types/config.ts:177` |
| 11 | WebSocket `ws.send()` 에러 무조건 삼킴 | `web/src/server/ws.ts:54-58,66-70` |

### 성능 (4건)

| # | 이슈 | 위치 |
|---|---|---|
| 12 | `loadCredentials`/`saveCredential` 동기 I/O | `core/src/config/credentials.ts` (readFileSync 등) |
| 13 | TUI에서 `readFileSync`/`writeFileSync` — UI 프리징 | `tui/ModelSelector.tsx:56`, `ConfigScreen.tsx:110` |
| 14 | Diff 파일 2회 중복 읽기 | `github/src/action.ts:76,103` |
| 15 | `SessionLogger.logs` 무한 증가 (flush 후 미정리) | `shared/src/utils/logger.ts:55` |

### SOLID 원칙 위반 (4건)

| # | 이슈 | 위치 |
|---|---|---|
| 16 | `runPipeline` 500줄+ 단일 함수 | `core/src/pipeline/orchestrator.ts:108-608` |
| 17 | `review` 커맨드 액션 310줄+ | `cli/src/index.ts:93-404` |
| 18 | `init.ts` 1098줄, 혼합 관심사 | `cli/src/commands/init.ts` |
| 19 | `buildSummaryBody` 180줄 | `github/src/mapper.ts:221-416` |

### 아키텍처 (4건)

| # | 이슈 | 위치 |
|---|---|---|
| 20 | `mcp` → `cli` 역방향 의존성 | `mcp/tools/leaderboard.ts:6`, `stats.ts:6` |
| 21 | Barrel export 미존재 + `package.json` main/types 허위 선언 | `github`, `notifications`, `shared`, `core` |
| 22 | L0 모듈 레벨 싱글턴으로 동시 파이프라인 불가 | `core/src/l0/index.ts:18-21` |
| 23 | Provider 캐시 TTL 없음 — 자격증명 갱신 불가 | `core/src/l1/provider-registry.ts:213` |

### 테스트 갭 (4건)

| # | 이슈 | 위치 |
|---|---|---|
| 24 | GitHub poster (postReview 등) 테스트 0건 | `github/src/poster.ts` |
| 25 | Review rules loader/matcher 테스트 0건 | `core/src/rules/loader.ts`, `matcher.ts` |
| 26 | CLI 커맨드 14개 중 10개 미테스트 | `cli/src/commands/` (replay, explain 등) |
| 27 | TUI 33개 소스 파일 중 컴포넌트 테스트 0건 | `tui/src/` 전체 |

---

## MINOR (30건)

### 코드 중복 (7건)

- `SEVERITY_ORDER` 4곳 독립 정의 (`core/types`, `notifications/webhook.ts`, `discord-live.ts`, `l2/moderator.ts`)
- `DECISION_COLORS` 2곳 중복 (`webhook.ts`, `discord-live.ts`)
- `truncate()` 2곳 중복 (`webhook.ts`, `discord-live.ts`)
- `severityColor` 3곳 중복 (`DebatePanel.tsx`, `DiffViewer.tsx`, `theme.ts`)
- `dirExists`/`fileExists`/`readJsonFile` CLI 5개 파일 복사붙여넣기
- 에러 변환 패턴 3가지 혼재 (String(err) / new Error(String(err)) / 'Internal server error')
- TUI 버전 `v1.1.0` 2곳 하드코딩 (vs CLI의 env var 방식)

### 타입 안전성 (5건)

- `poster.ts:70` — `as { status?: number }` 안전하지 않은 캐스트
- `mapper.ts:89` — non-null assertion on regex capture
- `mapper.ts:266` — severity badge non-null assertion (vs 63행의 fallback 패턴 불일치)
- `agreement.ts:30-33` — non-null assertion on Map.get()
- `ResultsScreen.tsx:139,142` — `as Record<string, unknown>` 반복 캐스트

### 성능/메모리 (3건)

- `detectCliBackends` — sync execFileSync를 Promise.allSettled로 감쌈 (가짜 병렬화)
- `useRouter` history 무한 증가
- `BanditStore` DEFAULT_STORE_PATH가 모듈 로드 시 `process.cwd()` 캡처

### 일관성 (6건)

- CLI 에러 핸들링 패턴 불일치 (review만 `formatError`, 나머지 raw `console.error`)
- 로깅 전략 불일치 (`SessionLogger` vs `process.stderr.write` vs `console.warn`)
- 의존성 버전 불일치 (`commander ^12` vs `^14`, `@modelcontextprotocol/sdk ^1.0` vs `^1.27`)
- `web/tsconfig.json` 다른 패키지와 상당히 다름
- Import 스타일 — deep path vs barrel 문서화 안 됨
- `react` peerDeps vs deps 전략 불일치 (`web` vs `tui`)

### 기타 (9건)

- Regex `test()` 루프에서 `lastIndex` 미리셋 (`rules/matcher.ts:112`)
- `parseForcedDecision` WARNING 기본값 무로깅 (`l2/moderator.ts:727`)
- 빈 레거시 스키마 주석 블록 (`config.ts:63-68`)
- `Promise.all` 단일 요소 (`env-detect.ts:29`)
- eslint-disable로 hooks deps 체크 우회 (`PipelineScreen.tsx:55`)
- IIFE 안티패턴 in JSX (`ResultsScreen.tsx:202`)
- `DebateScreen`에서 'q' 뒤로가기 미구현
- `costs.ts:86` 매직 넘버 `0.001`
- `isDiscussionEvent` 타입 가드 너무 느슨 (`usePipelineEvents.ts:129`)

---

## 우선순위 권장 사항

### 즉시 수정 (CRITICAL)

1. **CLI argument injection** — 모든 백엔드 `useStdin: true` 전환
2. **SSRF** — `sendDiscordPipelineSummary`에 URL 검증 추가 (1줄 수정)
3. **Session ID collision** — `crypto.randomUUID()` 기반 폴백
4. **`shared` ↔ `core` 순환 의존성** — `Result<T>` 등을 shared로 이동
5. **MCP 타입 체크** — 빌드 파이프라인에 declaration emit + typecheck 포함

### 단기 수정 (MAJOR)

6. **동기 I/O 제거** — credentials, TUI의 readFileSync/writeFileSync → async 전환
7. **`as unknown as` double cast 제거** — provider-registry에 어댑터 함수, review-output에 매핑 함수
8. **대형 함수 분해** — orchestrator `runPipeline`, cli `review` action, `init.ts`
9. **테스트 추가** — credentials, HMAC webhook, GitHub poster, rules matcher

### 중기 개선 (MINOR)

10. 중복 상수/유틸리티 통합 (`SEVERITY_ORDER`, `truncate`, `fileExists` 등)
11. 에러 핸들링/로깅 전략 통일
12. 패키지 barrel export 정리 + `package.json` main/types 정합성

---

**Verdict: REQUEST CHANGES** — CRITICAL 보안 이슈 3건(argument injection, SSRF, session ID collision)과 아키텍처 위반 2건(순환 의존성, MCP 빌드 깨짐)의 즉시 수정이 필요합니다.

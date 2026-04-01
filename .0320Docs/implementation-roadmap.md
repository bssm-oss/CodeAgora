# CodeAgora 구현 로드맵

> 작성일: 2026-03-20
> 기반: 6개 병렬 Opus 리뷰 결과 종합 (보안, 코드 품질, 아키텍처, Dead Code, 테스트, 빌드)
> 이슈: #173, #175~#195 (22개)

---

## 요약

| 우선순위 | 이슈 수 | 목표 |
|----------|---------|------|
| P0 즉시 | 6개 | 보안 CRITICAL + 기능 깨짐 수정 |
| P1 이번 스프린트 | 8개 | 보안 HIGH + 아키텍처 결정 + 핵심 테스트 |
| P2 다음 스프린트 | 8개 | Dead Code 정리 + 테스트 확대 + 품질 개선 |

---

## Week 1 — 빠른 수정 (S/XS, 쉬운 것부터)

### #175 보안: 경로 검증 일괄 `priority/critical` `size/S`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `shared/utils/diff.ts:111` | `path.resolve()` 후 `startsWith(repoRoot + path.sep)` containment check 추가. 실패 시 빈 문자열 반환 |
| 2 | `core/pipeline/chunker.ts:53-85` | `rawPath.split()`에서 `'..'` 포함 또는 `isAbsolute()` → `continue` |
| 3 | `plugin/bridge/mcp-server.ts:27-31` | `validateDiffPath(diffPath, { allowedRoots: [process.cwd()] })` 적용 |
| 4 | `mcp/tools/review-pr.ts:23` | `z.string()` → `z.string().regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/)` |
| 5 | `github/action.ts:76` | `validateDiffPath(inputs.diff, { allowedRoots: [process.cwd(), '/tmp'] })` |
| 6 | `github/sarif.ts:131` | `filePath.replace(/\.\.\//g, '').replace(/^\//, '')` |

**테스트:** 각 수정에 `'../../../etc/passwd'` 입력 테스트 추가
**의존:** 없음. 6개 모두 독립 수정.

---

### #180 보안: Actions/PR 출력 인젝션 `priority/critical` `size/S`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `github/action.ts:179-192` | `import { randomBytes } from 'crypto'` + delimiter를 `ghadelimiter_${randomBytes(16).toString('hex')}`로 변경. 레거시 `::set-output` 경로에 `value.replace(/[\r\n%]/g, '')` 추가 |
| 2 | `github/mapper.ts` 상단 | `sanitizeMarkdown()` 함수 신규 작성 — `<>` 이스케이프, `javascript:` URL 차단, 외부 이미지 차단 (github.com 제외), 필드당 2000자 제한 |
| 3 | `github/mapper.ts` 내 LLM 출력 사용 지점 | `issueTitle`, `problem`, `evidence`, `suggestion` 필드에 `sanitizeMarkdown()` 적용 |

**테스트:** XSS payload, 피싱 링크, 이미지 트래킹 URL, heredoc delimiter 충돌 입력 검증

---

### #181 웹: SessionCompare URL `priority/critical` `size/XS`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `web/frontend/components/SessionCompare.tsx:48-49` | key를 date/id로 분리해서 `/api/sessions/${date}/${id}` 2세그먼트로 URL 구성 |

**테스트:** URL 구성 검증 추가

---

### #188 보안: credentials 하드닝 `priority/high` `size/S`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `core/config/credentials.ts:102-103` | catch 블록 `return true` → `return false` (1줄) |
| 2 | `core/config/credentials.ts:49` | `mkdirSync(CONFIG_DIR, { recursive: true })` → `mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })` (1줄) |
| 3 | `core/l1/backend.ts:50-53` | spawn env를 `{ PATH, HOME, TERM, LANG }` + 해당 백엔드 프로바이더의 API 키만 전달하도록 제한. `getRequiredEnvForBackend(backend, provider)` 헬퍼 함수 생성 |

**테스트:** #189에서 커버

---

### #195 품질: 중복 통합 + 빌드/린트 `priority/low` `size/S`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | 다수 (각 1~3줄) | `SEVERITY_ORDER` → shared 단일 export, 4곳에서 import 변경 |
| 2 | 다수 | `truncate()` → `shared/utils/string.ts` 이동, 2곳에서 import |
| 3 | CLI 5곳 | `dirExists`/`fileExists` → `shared/utils/fs.ts` export 활용 |
| 4 | TUI 3곳 | `severityColor` → `tui/theme.ts` export 통합 |
| 5 | TUI 2곳 | 버전 `v1.1.0` 하드코딩 → package.json에서 읽기 |
| 6 | `init-multiselect.test.ts:462` | 테스트 기대값 수정 (`'cli'` → `'claude'`) |
| 7 | 7개 파일 | unused vars 제거 (CostSummary, detectApiKeys, BanditArm, pipelineStartMs, z, Severity, DiffIssueMarker) |
| 8 | `package.json` | `"lint": "eslint packages/*/src/"` 스크립트 추가 |
| 9 | `web/pages/Costs.tsx`, `Sessions.tsx` | `react-hooks/exhaustive-deps` 경고 — deps 배열 수정 |

**의존:** 없음

---

## Week 2 — 중간 난이도 (M 사이즈)

### #176 보안: CLI 프롬프트 인젝션 `priority/critical` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `shared/utils/prompt-file.ts` 신규 | `writeTempPrompt(prompt): string` — 임시 파일에 프롬프트 저장, `cleanupTempPrompt(path): void` — 정리 |
| 2 | `core/l1/backend.ts` | 8개 백엔드를 stdin 또는 temp file로 전환: |

백엔드별 전환 전략:

| 백엔드 | 현재 | 전환 방향 |
|--------|------|-----------|
| copilot | args `-p` | stdin (지원 확인 필요) 또는 `--prompt-file` |
| aider | args `--message` | `--message-file` tmpFile |
| goose | args `-t` | stdin 전환 |
| cline | args `-y` | stdin 전환 |
| qwen-code | args `-p` | stdin 전환 |
| vibe | args `--prompt` | stdin 전환 |
| kiro | positional | stdin 전환 |
| cursor | args `-p` | stdin 전환 |

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 3 | `core/types/config.ts` | `safeMode: boolean` (기본 true) 추가. `true`면 `--allow-all`, `--yes-always`, `--trust-all-tools` 플래그 제거. `false`면 사용자 명시적 opt-in |
| 4 | `core/l1/backend.ts` | `executeBackend()` finally 블록에 temp file cleanup 추가 |

**테스트:** 각 백엔드별 프롬프트 전달 방식 + safeMode 플래그 검증
**주의:** 각 CLI 도구가 실제로 stdin을 지원하는지 확인 필요 — 미지원 시 temp file 폴백

---

### #177 보안: 웹 인증 미들웨어 `priority/critical` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `web/src/server/middleware.ts` | `authMiddleware` 추가 — `CODEAGORA_DASHBOARD_TOKEN` 환경변수 또는 `crypto.randomBytes(32)` auto-generate. `crypto.timingSafeEqual`로 비교. `/api/health`만 예외 |
| 2 | `web/src/server/index.ts` | `app.use('/api/*', authMiddleware)` 적용 |
| 3 | `web/src/frontend/utils/auth.ts` 신규 | 토큰 localStorage 저장/로드, fetch wrapper에 `Authorization: Bearer` 헤더 주입 |
| 4 | `web/src/frontend/hooks/useApi.ts` | 모든 API 호출에 Bearer token 헤더 추가. 401 응답 시 토큰 입력 프롬프트 |
| 5 | `web/src/server/index.ts` | 서버 시작 시 auto-generated 토큰 콘솔 출력 |

**테스트:** 토큰 없이 → 401, 잘못된 토큰 → 403, 올바른 토큰 → 200

---

### #182 웹: Discussions/DiffViewer 백엔드 수정 `priority/critical` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | 타입 통일 | `DiscussionRound` 타입을 `discussion-helpers.ts`와 `usePipelineEvents.ts`에서 단일 정의로 통합 |
| 2 | `web/src/server/routes/sessions.ts` | 세션 상세 API에서 `discussions/` 디렉토리의 `round-*.md` 파일 읽기 → `rounds` 데이터를 응답에 포함. diff 내용을 세션 디렉토리에서 로드하여 반환 |
| 3 | `web/src/frontend/pages/Discussions.tsx` | 백엔드 응답의 rounds 형태에 맞춰 타입 조정 |
| 4 | `web/src/frontend/pages/ReviewDetail.tsx` | diff 데이터 수신 후 DiffViewer에 전달 |

**테스트:** 라운드 데이터 있는 세션/없는 세션 모두 테스트

---

## Week 3 — 보안 HIGH + 결정

### #178 보안: 웹 보안 헤더 + rate limit `priority/high` `size/S`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `web/src/server/middleware.ts` | `securityHeaders` 미들웨어 추가 — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy`. `errorHandler`에서 production일 때 generic 메시지 반환 |
| 2 | `web/src/server/index.ts` | 인메모리 rate limiter 미들웨어 적용 — `Map<ip, {count, resetAt}>`, 전역 100req/min, PUT/POST 10req/min |

**테스트:** 헤더 존재 검증, rate limit 초과 시 429 반환

---

### #179 보안: WebSocket 보안 `priority/high` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `web/src/server/ws.ts` | upgrade 전 Origin 헤더 검증 (`/^https?:\/\/(localhost\|127\.0\.0\.1)(:\d+)?$/`). `MAX_CONNECTIONS=50` 제한 (`Set<WebSocket>` 관리). #177 인증 토큰을 query param(`?token=xxx`)으로 받아 검증. 연결 종료 시 Set에서 제거 |

**테스트:** 외부 Origin 거부, 연결 수 초과 시 거부, 토큰 없이 연결 거부
**의존:** #177 이후

---

### #185 plugins/rules 결정 `priority/high` `size/S`

이슈에서 논의 후 결정. 코드 작업 아님.

**권장: 옵션 2 — rules만 연결 + plugins 삭제**

- rules 연결: orchestrator.ts에 2줄 추가로 완료. 사용자 가치 즉시 제공
  ```typescript
  const compiledRules = await loadReviewRules(projectRoot);
  if (compiledRules.length > 0) {
    const ruleEvidence = matchRules(diffContent, compiledRules);
    allEvidenceDocs.push(...ruleEvidence);
  }
  ```
- plugins 삭제: `l1/provider-registry.ts` 24개가 이미 충분. 외부 플러그인 생태계 불필요.

결정 후 → rules 연결 별도 PR + plugins 삭제는 #186에 포함.

---

### #189 테스트: 보안 코드 테스트 `priority/high` `size/M`

| 순서 | 파일 (신규) | 테스트 케이스 |
|------|-------------|---------------|
| 1 | `src/tests/credentials.test.ts` | loadCredentials 정상 로드, 퍼미션 거부 (0o644), stat 실패 시 거부, saveCredential 파일 생성 + 0o600 확인, 디렉토리 0o700 확인. 임시 디렉토리에서 격리 실행 |
| 2 | `src/tests/generic-webhook-security.test.ts` | 올바른 HMAC → 성공, 잘못된 HMAC → 거부, 시크릿 16자 미만 → 거부, HTTP URL → 에러, 빈 페이로드 → 에러 |
| 3 | `src/tests/github-poster.test.ts` | postReview 정상 호출 (Octokit mock), API 에러 시 예외 전파, rate limit 429 처리 |
| 4 | `src/tests/discord-ssrf.test.ts` | 내부 IP URL → 차단, HTTP URL → 차단, 유효한 Discord URL → 성공 |

**의존:** #188 수정 이후

---

## Week 4 — 아키텍처 정리

### #183 아키텍처: shared↔core 순환 + MCP 타입 `priority/high` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `shared/types/result.ts` 신규 | `Result<T>`, `ok()`, `err()` 이동 |
| 2 | `shared/types/evidence.ts` 신규 | `EvidenceDocument`, `EvidenceDocumentSchema` 이동 |
| 3 | `shared/types/severity.ts` 신규 | `Severity`, `SeveritySchema`, `SEVERITY_ORDER` 이동 |
| 4 | `core/types/core.ts` | `import { Result, ok, err } from '@codeagora/shared'` + re-export |
| 5 | `shared/utils/issue-mapper.ts`, `fs.ts`, `path-validation.ts` | core import → shared 내부 import 변경 |
| 6 | `core/tsconfig.json` | `declaration: true` 확인 |
| 7 | core 빌드 | `dist/*.d.ts` 생성 확인 |
| 8 | `pnpm typecheck:ws` | mcp 패키지 포함 |
| 9 | `github`, `notifications`, `shared`, `core` | `package.json` `main`/`types` 필드 정합성 확인 |

**테스트:** `pnpm typecheck:ws` 전체 통과 확인
**주의:** 다른 PR과 충돌 가능성 높음 — 이 주에 먼저 처리

---

### #184 아키텍처: mcp/tui→cli 역방향 `priority/high` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `cli/commands/sessions.ts` | 데이터 조회 로직 추출 (listSessions, getSessionStats, showSession) |
| 2 | `core/session/queries.ts` 신규 | 추출한 세션 조회 함수 이동 |
| 3 | `cli/commands/models.ts` | 리더보드 데이터 로직 추출 |
| 4 | `core/l0/leaderboard.ts` 신규 | 추출한 리더보드 함수 이동 |
| 5 | `cli/commands/sessions.ts`, `models.ts` | core 호출하는 thin wrapper로 변경 |
| 6 | `mcp/tools/leaderboard.ts`, `stats.ts` | `@codeagora/cli` → `@codeagora/core` import 변경 |
| 7 | `tui/screens/SessionsScreen.tsx` | `@codeagora/cli` → `@codeagora/core` import 변경 |

**테스트:** 기존 테스트 그대로 통과 확인
**의존:** #183 이후 (타입 이동 완료 후)

---

### #186 죽은 모듈 삭제 `priority/medium` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | #185 결정 확인 | plugins/ 삭제 여부 확정 |
| 2 | 파일 삭제 | `core/config/converter.ts`, `core/config/migrator.ts`, `core/pipeline/dsl-parser.ts`, `github/comment.ts`, `github/session-diff.ts`, `notifications/discord-live.ts`, `notifications/event-stream.ts`, `shared/meme/index.ts`, (결정 시) `core/plugins/` 전체 |
| 3 | import 정리 | 삭제된 모듈을 참조하는 import/re-export 제거 |
| 4 | 개별 dead export | 73개 중 삭제 대상 함수/타입 제거 |
| 5 | 빌드/테스트 | `pnpm build:ws && pnpm test:ws` 전체 통과 확인 |

**주의:** 테스트에서 dead 심볼 import하는 곳 있을 수 있음

---

### #187 무시되는 설정 필드 `priority/medium` `size/M`

구현 (5개):

| 필드 | 수정 파일 | 내용 |
|------|-----------|------|
| `pickStrategy: 'round-robin'` | `core/l2/moderator.ts` | `randomPick()` → 조건 분기 추가 |
| `personaAssignment: 'fixed'` | `core/l2/moderator.ts` | `randomElement()` → 순서대로 배정 분기 추가 |
| `postSuggestions` | `github/mapper.ts` | config에서 읽어 mapper 함수에 파라미터 전달 |
| `collapseDiscussions` | `github/mapper.ts` | config에서 읽어 mapper 함수에 파라미터 전달 |
| MCP `reviewer_count` | `mcp/helpers.ts` | `runPipeline()` 호출 시 파라미터 전달 |

제거 (4개):

| 필드 | 수정 파일 | 내용 |
|------|-----------|------|
| `tierMin` | `core/types/config.ts:159` | 스키마에서 제거 (L0 고도화 시 재추가) |
| `preferProviders` | `core/types/config.ts:160` | 스키마에서 제거 |
| `agent.label` | — | 유지 (문서화 목적, 무해) |
| `modelRouter.strategy` | `core/types/l0.ts:87` | 스키마에서 제거 |

---

## Week 5+ — 테스트 확대 + 품질 개선

### #190 테스트: MCP + shared 커버리지 `priority/medium` `size/M`

MCP (신규 5개):

| 파일 | 핵심 테스트 |
|------|-------------|
| `mcp/tests/helpers.test.ts` | 임시 파일 관리, 파이프라인 호출 |
| `mcp/tests/review-quick.test.ts` | 입력 검증 (diff 크기 제한 등) |
| `mcp/tests/review-pr.test.ts` | URL 검증, gh 호출 mock |
| `mcp/tests/explain.test.ts` | 세션 경로 검증 |
| `mcp/tests/leaderboard-stats.test.ts` | 데이터 포맷팅 |

shared (신규 5개):

| 파일 | 핵심 테스트 |
|------|-------------|
| `shared/tests/path-validation.test.ts` | 보안 핵심 유틸 — traversal 차단 검증 |
| `shared/tests/diff.test.ts` | readSurroundingContext containment |
| `shared/tests/concurrency.test.ts` | pLimit 래퍼 동작 |
| `shared/tests/fs.test.ts` | 세션 ID 생성, race condition |
| `shared/tests/env-detect.test.ts` | API 키 감지, CLI 바이너리 감지 |

각 패키지에 `vitest.config.ts` + `"test"` script 추가.

---

### #191 테스트: github + notifications 커버리지 `priority/medium` `size/M`

github (신규 4개):

| 파일 | 핵심 테스트 |
|------|-------------|
| `github/tests/diff-parser.test.ts` | diff 파싱 정확성 |
| `github/tests/poster.test.ts` | PR 코멘트 게시, 에러 처리 |
| `github/tests/sarif.test.ts` | SARIF 포맷 정합성 |
| `github/tests/mapper.test.ts` | 이슈→라인 매핑, 요약 생성 |

notifications (신규 2개):

| 파일 | 핵심 테스트 |
|------|-------------|
| `notifications/tests/webhook.test.ts` | Slack/Discord 웹훅 전송 |
| `notifications/tests/generic-webhook.test.ts` | HMAC 검증 (#189와 일부 중복 가능) |

**의존:** #186 dead code 결정 후 범위 확정

---

### #192 테스트: 핵심 E2E `priority/high` `size/L`

신규 `src/tests/e2e-conflict-debate.test.ts`:

mock backend 설정:
- r1: CRITICAL SQL injection 발견
- r2: 이슈 없음
- r3: WARNING 성능 이슈 발견
- moderator: 토론 진행
- supporter: 찬성/반대
- head: 최종 판결

| 시나리오 | 우선순위 | 검증 포인트 |
|----------|----------|-------------|
| 상충 의견 → L2 토론 → L3 판결 | P0 | REJECT 반환, 토론 라운드 생성 |
| 전원 동의 → L2 스킵 가능 → L3 ACCEPT | P0 | ACCEPT 반환 |
| `skipDiscussion=true` → L1→L3 직행 | P0 | L2 호출 없음, 결과 정상 |
| `skipHead=true` → NEEDS_HUMAN | P0 | L3 호출 없음, NEEDS_HUMAN 반환 |
| 캐시 히트 → 동일 diff 재실행 | P1 | 백엔드 호출 없음, 캐시 결과 반환 |
| 서킷 오픈 → forfeit → 나머지로 계속 | P1 | forfeit 리뷰어 존재, 나머지 성공 |
| 중복 리뷰어 ID | P1 | evidence 올바르게 병합 |
| moderator throw | P1 | 파이프라인 에러 처리 |
| L3 verdict throw | P1 | 파이프라인 에러 처리 |

예상 테스트 케이스: 15~20개
**의존:** 없음 — 언제든 착수 가능

---

### #193 품질: 타입 안전성 `priority/medium` `size/M`

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `core/l1/provider-registry.ts` | `ProviderInstance` 어댑터 함수 작성: `function wrapProvider(provider: any): ProviderInstance { return (id) => provider(id); }` → 24개 `as unknown as` 일괄 교체 |
| 2 | `cli/formatters/review-output.ts:488` | `topIssues` → `EvidenceDocument` 명시적 매핑 함수 작성. double cast 제거 |
| 3 | `shared/utils/fs.ts:125-130` | `readJson<T>(path)` → `readJson<T>(path, schema: ZodSchema<T>)` 시그니처 변경. 호출처 전부 스키마 전달 |
| 4 | CLI 전반 | `JSON.parse` 결과에 zod `.parse()` 또는 `.safeParse()` 적용 |

---

### #194 품질: 동기 I/O + 거대 함수 분해 `priority/medium` `size/L`

Phase 1 — 동기 I/O 제거:

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 1 | `core/config/credentials.ts` | `readFileSync`/`writeFileSync`/`statSync`/`mkdirSync` → async 전환 |
| 2 | `tui/ModelSelector.tsx:56` | `readFileSync` → `useEffect` + `async readFile` |
| 3 | `tui/ConfigScreen.tsx:110` | `writeFileSync` → async callback |

Phase 2 — 거대 함수 분해:

| 순서 | 파일 | 수정 내용 |
|------|------|-----------|
| 4 | `core/pipeline/orchestrator.ts` (500줄) | `runPipeline()` → `executeL1Reviews()`, `executeL2Discussions()`, `executeL3Verdict()`, `checkCache()`, `recordTelemetry()` 추출. `runPipeline()`은 시퀀서로 축소 |
| 5 | `cli/commands/init.ts` (1098줄) | `init-wizard.ts` (UI), `init-config-builder.ts` (설정 생성), `init-files.ts` (파일 I/O) 3개 모듈로 분리 |
| 6 | `cli/index.ts` review 액션 (310줄) | 옵션 파싱, 파이프라인 실행, 결과 포맷팅 분리 |

**주의:** orchestrator 분해 시 기존 테스트도 같이 수정 필요 (mock 대상 함수명 변경)

---

### #173 models.dev 연동 (별도 로드맵)

기존 이슈에 Phase 1~4 상세 계획 있음. Week 5+ 또는 병렬 진행.

---

## 실행 순서 총정리

```
Week 1  #175 → #180 → #181 → #188 → #195
        경로검증  출력인젝션  URL수정  credentials  린트정리
        [S]      [S]        [XS]    [S]          [S]

Week 2  #176 → #177 → #182
        CLI인젝션  웹인증  웹대시보드
        [M]       [M]     [M]

Week 3  #178 → #179 → #185 → #189
        헤더/rate  WebSocket  결정    보안테스트
        [S]       [M]        [논의]  [M]

Week 4  #183 → #184 → #186 → #187
        순환의존  역방향  dead code  설정필드
        [M]      [M]     [M]        [M]

Week 5+ #190, #191, #192, #193, #194, #173
        테스트 확대 + 품질 개선 + models.dev
```

---

## 의존성 그래프

```
#175 ─── (독립)
#176 ─── (독립)
#177 ──→ #179 (WebSocket이 인증 토큰 사용)
#178 ─── (독립)
#180 ─── (독립)
#181 ─── (독립)
#182 ─── (독립)
#183 ──→ #184 (타입 이동 후 역방향 해소)
#185 ──→ #186 (결정 후 삭제)
#186 ──→ #191 (dead code 확정 후 테스트 범위)
#188 ──→ #189 (수정 후 테스트)
#189 ─── (독립, #188 이후 권장)
#190 ─── (독립)
#191 ──→ #186 의존
#192 ─── (독립)
#193 ─── (독립)
#194 ─── (독립)
#195 ─── (독립)
#173 ─── (독립)
```

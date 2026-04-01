# CodeAgora 코드베이스 전수조사 보고서

> 조사일: 2026-03-20
> 범위: packages/ 전체 (shared, core, github, notifications, cli, tui, mcp, web)
> 대상: 미완성, 미연결, 미사용 코드

---

## 1. TODO/FIXME/HACK/XXX 주석

**결과: 0건** — 467개 소스 파일 전체에서 작업 추적 주석이 없습니다.

---

## 2. Stub/Placeholder 함수

**결과: 0건** — 251개 TypeScript/TSX 파일의 모든 함수가 실제 구현을 갖고 있습니다.

---

## 3. 미사용 Export

총 737개 named export 중 73개 완전 미사용, 185개 불필요 export.

### 3-A. 완전 Dead Code — 어디서도 참조하지 않는 심볼 (73개)

#### 통째로 죽은 파일/모듈 (삭제 최우선 후보)

| 파일 | Dead 심볼 수 | 상태 |
|---|---|---|
| `core/src/plugins/` (4 파일) | 6 | **완전 미구현** — 오케스트레이터 미연결 |
| `core/src/rules/` (3 파일) | 3 | **완전 미구현** — 오케스트레이터 미연결 |
| `core/src/config/converter.ts` | 3 (`jsonToYaml`, `yamlToJson`, `configToYaml`) | **완전 미사용** |
| `core/src/config/migrator.ts` | 3 (`needsMigration`, `migrateConfig`, `applyMigration`) | **완전 미사용** |
| `core/src/pipeline/dsl-parser.ts` | 3 (`parsePipelineDsl`, `serializePipelineDsl`, `getDefaultPipelineDefinition`) | **완전 미사용** |
| `github/src/comment.ts` | 3 (`postPrComment`, `findExistingComment`, `updatePrComment`) | **완전 미사용** |
| `github/src/session-diff.ts` | 2 (`diffSessionIssues`, `formatSessionDiffMarkdown`) | **완전 미사용** |
| `notifications/src/discord-live.ts` | 2 (`createDiscordLiveHandler`, `sendDiscordPipelineSummary`) | **완전 미사용** |
| `notifications/src/event-stream.ts` | 1 (`createEventStreamHandler`) | **완전 미사용** |
| `shared/src/meme/index.ts` | 8 (getter 4개 + pool 4개) | **완전 미사용** |

#### 개별 Dead 심볼 — shared (12개)

| 파일:라인 | 심볼 | 종류 |
|---|---|---|
| `shared/src/data/models-dev.ts:94` | `fromModelsDevId` | function |
| `shared/src/i18n/index.ts:22` | `getLocale` | function (barrel) |
| `shared/src/meme/index.ts:122` | `getMemeVerdict` | function (barrel) |
| `shared/src/meme/index.ts:127` | `getMemeSeverity` | function (barrel) |
| `shared/src/meme/index.ts:133` | `getMemeDiscussion` | function (barrel) |
| `shared/src/meme/index.ts:139` | `getMemeConfidence` | function (barrel) |
| `shared/src/utils/fs.ts:40` | `getConfigPath` | function |
| `shared/src/utils/fs.ts:139` | `readMarkdown` | function |
| `shared/src/utils/issue-mapper.ts:16` | `mapIssuesToLines` | function |
| `shared/src/utils/process-kill.ts:9` | `killProcessTree` | function |
| `shared/src/utils/recovery.ts:90` | `isRetryableError` | function |
| `shared/src/utils/scope-detector.ts:49` | `detectScope` | function |

#### 개별 Dead 심볼 — core (49개)

| 파일:라인 | 심볼 | 종류 |
|---|---|---|
| `core/src/config/converter.ts:26` | `jsonToYaml` | function |
| `core/src/config/converter.ts:50` | `yamlToJson` | function |
| `core/src/config/converter.ts:73` | `configToYaml` | function |
| `core/src/config/loader.ts:92` | `validateConfigData` | function |
| `core/src/config/loader.ts:142` | `getDevilsAdvocate` | function |
| `core/src/config/loader.ts:151` | `checkMinReviewers` | function |
| `core/src/config/migrator.ts:108` | `needsMigration` | function |
| `core/src/config/migrator.ts:147` | `migrateConfig` | function |
| `core/src/config/migrator.ts:201` | `applyMigration` | function |
| `core/src/config/templates.ts:388` | `generateFullTemplate` | function |
| `core/src/config/templates.ts:414` | `generateDeclarativeTemplate` | function |
| `core/src/config/templates.ts:430` | `generateMultiProviderTemplate` | function |
| `core/src/l0/index.ts:48` | `resetL0` | function (barrel) |
| `core/src/l0/model-registry.ts:148` | `setRegistry` | function |
| `core/src/l0/model-registry.ts:167` | `getModelsByProvider` | function |
| `core/src/l0/model-registry.ts:171` | `getModelsByFamily` | function |
| `core/src/l0/model-registry.ts:175` | `getReasoningModels` | function |
| `core/src/l0/model-registry.ts:188` | `getModelCount` | function |
| `core/src/l1/provider-registry.ts:258` | `clearProviderCache` | function |
| `core/src/l2/devils-advocate-tracker.ts:86` | `formatDevilsAdvocateStats` | function |
| `core/src/pipeline/cost-estimator.ts:40` | `loadPricing` | function |
| `core/src/pipeline/diff-complexity.ts:83` | `formatDiffComplexity` | function |
| `core/src/pipeline/dryrun.ts:228` | `formatDryRunText` | function |
| `core/src/pipeline/dsl-parser.ts:33` | `parsePipelineDsl` | function |
| `core/src/pipeline/dsl-parser.ts:169` | `serializePipelineDsl` | function |
| `core/src/pipeline/dsl-parser.ts:176` | `getDefaultPipelineDefinition` | function |
| `core/src/pipeline/progress.ts:127` | `formatProgressLine` | function |
| `core/src/pipeline/progress.ts:144` | `formatProgressJson` | function |
| `core/src/pipeline/report.ts:187` | `formatReportJson` | function |
| `core/src/plugins/builtin-providers.ts:41` | `getBuiltinProviderPlugins` | function |
| `core/src/plugins/loader.ts:57` | `loadPlugins` | function |
| `core/src/plugins/loader.ts:87` | `filterEnabled` | function |
| `core/src/plugins/provider-manager.ts:13` | `ProviderPluginManager` | class |
| `core/src/plugins/registry.ts:63` | `getPluginRegistry` | function |
| `core/src/plugins/registry.ts:70` | `resetPluginRegistry` | function |
| `core/src/plugins/types.ts:62` | `HookEventName` | type |
| `core/src/plugins/types.ts:92` | `PluginConfig` | interface |
| `core/src/rules/loader.ts:18` | `loadReviewRules` | function |
| `core/src/rules/matcher.ts:99` | `matchRules` | function |
| `core/src/rules/types.ts:20` | `ReviewRules` | type |
| `core/src/types/config.ts:90` | `ReviewerConfigSchema` | const |
| `core/src/types/config.ts:93` | `SupporterConfigSchema` | const |
| `core/src/types/config.ts:141` | `ErrorHandling` | type |
| `core/src/types/config.ts:171` | `ReviewersField` | type |
| `core/src/types/config.ts:182` | `NotificationsConfig` | type |
| `core/src/types/config.ts:192` | `GitHubIntegrationConfig` | type |
| `core/src/types/config.ts:197` | `ChunkingConfig` | type |
| `core/src/types/config.ts:218` | `AutoApproveConfig` | type |
| `core/src/types/l0.ts:31` | `CircuitBreakerState` | interface |

#### 개별 Dead 심볼 — github (7개)

| 파일:라인 | 심볼 | 종류 |
|---|---|---|
| `github/src/comment.ts:15` | `postPrComment` | function |
| `github/src/comment.ts:38` | `findExistingComment` | function |
| `github/src/comment.ts:62` | `updatePrComment` | function |
| `github/src/dryrun-preview.ts:19` | `formatDryRunPreviewComment` | function |
| `github/src/mapper.ts:421` | `buildReviewBadgeUrl` | function |
| `github/src/session-diff.ts:19` | `diffSessionIssues` | function |
| `github/src/session-diff.ts:54` | `formatSessionDiffMarkdown` | function |

#### 개별 Dead 심볼 — notifications (3개)

| 파일:라인 | 심볼 | 종류 |
|---|---|---|
| `notifications/src/discord-live.ts:70` | `createDiscordLiveHandler` | function |
| `notifications/src/discord-live.ts:165` | `sendDiscordPipelineSummary` | function |
| `notifications/src/event-stream.ts:13` | `createEventStreamHandler` | function |

#### 개별 Dead 심볼 — cli (2개)

| 파일:라인 | 심볼 | 종류 |
|---|---|---|
| `cli/src/options/review-options.ts:12` | `ReviewCliOptions` | interface |
| `cli/src/options/review-options.ts:91` | `isStdinPiped` | function |

### 3-B. 불필요 export 키워드 (185개)

로컬에서만 사용되는데 `export` 키워드가 붙은 심볼. 주요 클러스터:

| 패키지 | 건수 | 주요 항목 |
|---|---|---|
| core | 86 | Zod 하위 스키마 20개+ (`config.ts`), L2 이벤트 인터페이스 7개, 플러그인 타입 5개 |
| shared | 38 | `SessionLogger` 클래스, 캐시/diff 유틸, models-dev 스키마 |
| cli | 36 | `InitOptions`, `DoctorCheck` 등 커맨드 파라미터 인터페이스, 개별 포맷 함수 6개 |
| github | 8 | `resolvePosition`, `mapToInlineCommentBody` 등 |
| web | 7 | 파이프라인 이벤트 인터페이스, `MODEL_COLORS` |
| tui | 6 | 컴포넌트 prop 인터페이스, `getAllProviderStatuses` |
| notifications | 4 | `DiscordLiveConfig`, `NotificationConfig` 등 |

---

## 4. 미연결 모듈

| 서브시스템 | 상태 | 오케스트레이터 호출 | 테스트 |
|---|---|---|---|
| **plugins/** | **완전 미연결 (dead code)** | 없음 | 유닛 2개 (통합 없음) |
| **rules/** | **완전 미연결 (dead code)** | 없음 | 없음 |
| **learning/** | **완전 연결** | `orchestrator.ts:348-359` | 2개 |
| **l0/** (모델 선택) | **완전 연결** (피드백 루프 포함) | `orchestrator.ts:253,330-341,508-533` | 7개 |

### plugins/ — 완전 미연결

**관련 파일:**
- `core/src/plugins/types.ts` — Plugin 타입 정의 (provider, backend, output, hook)
- `core/src/plugins/registry.ts` — 인메모리 PluginRegistry + singleton accessor
- `core/src/plugins/loader.ts` — 플러그인 검증 및 레지스트리 로딩
- `core/src/plugins/provider-manager.ts` — ProviderPluginManager (레지스트리 래퍼)
- `core/src/plugins/builtin-providers.ts` — 8개 프로바이더를 ProviderPlugin 객체로 래핑
- `core/src/types/config.ts:234` — `plugins: z.array(z.string()).optional()` 설정 필드

**미연결 증거:**
- `getPluginRegistry()`, `loadPlugins()`, `ProviderPluginManager`이 plugins/ 밖에서 한 번도 import되지 않음
- `config.plugins` 필드를 읽는 코드 없음
- 오케스트레이터에 플러그인 관련 참조 0건
- L1은 별도의 `l1/provider-registry.ts`를 사용 — 플러그인 시스템과 중복 구현
- `AGENTS.md`에 "Plugins loaded via plugins/loader.ts before execution"이라고 쓰여 있지만 실제 코드에서는 미구현

**연결에 필요한 것:**
- 오케스트레이터에서 `loadPlugins()` + `getPluginRegistry()` 호출
- L1 api-backend에서 `ProviderPluginManager.getProvider()` 폴백
- Hook 플러그인의 파이프라인 단계별 호출
- `config.plugins` 필드 읽기 및 `filterEnabled()` 호출

### rules/ — 완전 미연결

**관련 파일:**
- `core/src/rules/types.ts` — Rule, ReviewRules, CompiledRule Zod 스키마
- `core/src/rules/loader.ts` — `.reviewrules` / `.reviewrules.yml` 파일 읽기, YAML 파싱, Zod 검증, 정규식 컴파일
- `core/src/rules/matcher.ts` — unified diff 파싱, 컴파일된 룰 매칭, `EvidenceDocument[]` 생성 (`source: 'rule'`)

**미연결 증거:**
- `loadReviewRules`의 호출자 0건
- `matchRules`의 호출자 0건
- rules/ 밖에서 rules/loader, rules/matcher import 0건
- 오케스트레이터에 rules 관련 참조 0건
- 테스트 파일 없음

**연결에 필요한 것:**
- 오케스트레이터에서 `loadReviewRules(projectRoot)` 호출
- `matchRules(diffContent, compiledRules)` 결과를 `allEvidenceDocs`에 merge (learning 필터 전, orchestrator.ts:349 이전)
- confidence 계산(orchestrator.ts:364)은 이미 `source: 'rule'`을 skip하므로 호환됨

---

## 5. 설정에 정의되어 있지만 런타임에서 무시되는 필드

| # | 필드 | 파일:라인 | 상태 | 세부사항 |
|---|---|---|---|---|
| 1 | `config.plugins` | `core/src/types/config.ts:234` | **완전 미구현** | 읽는 코드 없음 |
| 2 | `config.github.postSuggestions` | `core/src/types/config.ts:232` | **무시됨** | mapper에 전달 안 됨 (함수 파라미터 기본값만 사용) |
| 3 | `config.github.collapseDiscussions` | `core/src/types/config.ts:232` | **무시됨** | mapper에 전달 안 됨 (함수 파라미터 기본값만 사용) |
| 4 | `supporters.pickStrategy` | `core/src/types/config.ts:110` | **무시됨** | 항상 `randomPick()` 사용, `round-robin` 미구현 |
| 5 | `supporters.personaAssignment` | `core/src/types/config.ts:113` | **무시됨** | 항상 `randomElement()` 사용, `fixed` 미구현 |
| 6 | `agent.label` | `core/src/types/config.ts:38` | **무시됨** | 런타임에서 읽지 않음 (init wizard UI 라벨과 무관) |
| 7 | `declarativeReviewers.constraints.tierMin` | `core/src/types/config.ts:159` | **무시됨** | L0 모델 선택에서 미사용 (tier 데이터는 있으나 필터링 없음) |
| 8 | `declarativeReviewers.constraints.preferProviders` | `core/src/types/config.ts:160` | **무시됨** | L0 모델 선택에서 미사용 |
| 9 | `modelRouter.strategy` | `core/src/types/l0.ts:87` | **무시됨** | 단일값 enum (`'thompson-sampling'`), 값 읽지 않음 |

**추가:** MCP `review_quick` 도구의 `reviewer_count` 파라미터 (`mcp/src/helpers.ts:16`)도 받기만 하고 `runPipeline()`에 전달하지 않아 무시됨.

---

## 6. CLI 커맨드 & MCP 도구

**결과: 모든 커맨드/도구 구현 완료**

- CLI: 31개 커맨드/서브커맨드 전부 실제 로직 포함 (빈 커맨드 0건)
- MCP: 7개 도구 전부 구현 완료 (미구현 0건)

---

## 7. 웹 대시보드 API 불일치

### 7-A. 프론트엔드가 호출하지 않는 백엔드 라우트 (5개)

| 라우트 | 파일:라인 | 심각도 | 비고 |
|---|---|---|---|
| `GET /api/health` | `server/routes/health.ts:12` | 낮음 | 인프라/모니터링용 (정상) |
| `GET /api/sessions/:date/:id/reviews` | `server/routes/sessions.ts:72` | 낮음 | 프론트엔드는 composite 엔드포인트 사용 |
| `GET /api/sessions/:date/:id/discussions` | `server/routes/sessions.ts:87` | 낮음 | 위와 동일 |
| `GET /api/sessions/:date/:id/verdict` | `server/routes/sessions.ts:102` | 낮음 | 위와 동일 |
| `GET /api/costs/pricing` | `server/routes/costs.ts:75` | 낮음 | 호출하는 UI 없음 |

### 7-B. 요청/응답 형태 불일치 (5건)

| # | 심각도 | 위치 | 문제 |
|---|---|---|---|
| **1** | **높음** | `SessionCompare.tsx:48-49` | URL을 `/api/sessions/${key}` 단일 세그먼트로 구성하지만 백엔드는 `/:date/:id` 2세그먼트 기대 — **세션 비교 기능 깨짐** |
| **2** | **높음** | `Discussions.tsx:28` ↔ `sessions.ts:66` | 프론트엔드가 `rounds: Record<string, DiscussionRound[]>` 기대하지만 백엔드는 이 필드를 반환하지 않음 — **토론 타임라인/시각화 항상 비어있음** |
| 3 | 중간 | `discussion-helpers.ts` ↔ `usePipelineEvents.ts` | `DiscussionRound` 타입이 두 곳에서 다른 형태 (`round`+`supporterResponses` vs `roundNum`+`stances`) |
| 4 | 중간 | `ReviewDetail.tsx:53` ↔ `sessions.ts:66` | 프론트엔드가 `diff?: string` 기대하지만 백엔드가 diff 내용을 로드/반환하지 않음 — **Diff 뷰어 렌더링 안 됨** |
| 5 | 중간 | `review-helpers.ts` ↔ `session-filters.ts` | `ReviewEntry.evidenceDocs` vs `SessionReview.issues` — 서버 정규화 없이 페이지마다 다른 형태 가정 |

---

## 종합 요약

| 영역 | 발견 건수 | 심각도 |
|---|---|---|
| TODO/FIXME 주석 | 0 | — |
| Stub/Placeholder 함수 | 0 | — |
| 완전 Dead Export | **73** | 중간 (코드 부풀림) |
| 불필요 export 키워드 | **185** | 낮음 |
| 미연결 서브시스템 | **2** (plugins, rules) | **높음** — 인프라만 존재, 미연결 |
| 무시되는 설정 필드 | **9** (+MCP 1건) | 중간 — 사용자 혼동 유발 |
| 빈 CLI 커맨드 | 0 | — |
| 웹 API 불일치 (라우트) | **5** | 낮음 |
| 웹 API 불일치 (형태) | **5** | **높음** 2건 포함 |

---

## 우선 조치 권장 (impact 순)

### P0 — 즉시 수정 (기능 깨짐)
1. `SessionCompare.tsx:48-49` — URL 구성을 `/:date/:id` 2세그먼트로 수정
2. `Discussions.tsx` ↔ `sessions.ts` — 백엔드가 `rounds` 데이터를 반환하도록 수정, 또는 프론트엔드에서 해당 UI 제거

### P1 — 결정 필요 (아키텍처)
3. **plugins/ 시스템** — 오케스트레이터에 연결할 것인지, dead code로 삭제할 것인지 결정
4. **rules/ 엔진** — 오케스트레이터에 연결할 것인지, dead code로 삭제할 것인지 결정

### P2 — 사용자 영향 (설정 혼동)
5. 무시되는 설정 필드 — 동작하지 않는 설정(`pickStrategy`, `personaAssignment`, `tierMin`, `preferProviders`)이 사용자에게 노출됨. 구현하거나 스키마에서 제거

### P3 — 코드 품질 (정리)
6. 통째로 죽은 모듈 제거 — `converter.ts`, `migrator.ts`, `dsl-parser.ts`, `comment.ts`, `session-diff.ts`, `discord-live.ts`, `event-stream.ts`, `meme/`
7. 개별 dead export 73개 정리
8. 불필요 export 키워드 185개 제거
9. 웹 `DiscussionRound` 타입 통일, `ReviewEntry`/`SessionReview` 형태 정규화
10. 미사용 백엔드 sub-resource 라우트 정리 또는 문서화

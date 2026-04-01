# CodeAgora 테스트 전략 리뷰 보고서

> 날짜: 2026-03-20
> 범위: 전체 8개 패키지, 147 테스트 파일, ~2,231 테스트 케이스
> 도구: vitest

---

## Executive Summary

| 지표 | 현황 | 평가 |
|------|------|------|
| 테스트 파일 | 147개 | -- |
| 테스트 케이스 | ~2,231개 | -- |
| **테스트 없는 소스 파일** | **~130개** | CRITICAL |
| **테스트 0개 패키지** | **6개 (shared, github, notifications, cli, tui, mcp)** | CRITICAL |
| vi.mock() 과용 파일 | 5개 (총 52개 mock) | HIGH |
| Flaky 리스크 테스트 | 11개 파일 | MEDIUM |
| E2E 핵심 갭 | 6개 시나리오 미커버 | HIGH |

---

## 1. 커버리지 갭

### 1A. 테스트 0개 패키지 (CRITICAL)

| 패키지 | 소스 파일 수 | 테스트 | 주요 미커버 모듈 |
|--------|------------|--------|----------------|
| **shared** | 17 | 0 | cache, concurrency, diff, path-validation, issue-mapper, logger |
| **github** | 12 | 0 | client, diff-parser, poster, sarif, dedup, comment |
| **cli** | 20 | 0 | init wizard, doctor, sessions, formatters |
| **tui** | 32 | 0 | 모든 React/Ink 컴포넌트 |
| **notifications** | 4 | 0 | discord-live, webhook, event-stream |
| **mcp** | 9 | 0 | 7개 MCP 도구 + helpers + index |
| **합계** | **94** | **0** | -- |

> `src/tests/`에 일부 통합 테스트가 있어 간접적으로 커버되지만, 패키지 자체에 독립 테스트가 전무합니다.

### 1B. core 패키지 핵심 갭

| 파일 | 리스크 | 상태 | 누락 테스트 |
|------|--------|------|-------------|
| **`l0/index.ts`** (resolveReviewers) | HIGH | 전용 테스트 없음 | auto 리뷰어 라우팅, contextMin 필터, reasoning 모델 제외, round-robin 분배, router disabled + auto 리뷰어 에러 |
| **`learning/collector.ts`** | HIGH | 테스트 0개 | GitHub PR dismissed 패턴 수집 전체 |
| **`pipeline/orchestrator.ts`** | HIGH | 부분 커버 | `skipDiscussion` 브랜치, `skipHead` 브랜치, 캐시 히트 경로, CLI 오버라이드, surrounding context 수집 |

### 1C. web 패키지 서버 갭

| 파일 | 리스크 | 상태 |
|------|--------|------|
| **`server/middleware.ts`** (CORS + errorHandler) | HIGH | 테스트 없음 — 보안 관련 |
| **`server/utils/fs-helpers.ts`** | MEDIUM | 테스트 없음 |
| **`server/ws.ts`** | HIGH | "export 존재" 확인만 — 이벤트 전달/리스너 정리 미검증 |
| `server/routes/sessions.ts` | MEDIUM | discussions 엔드포인트, verdict 성공 케이스 누락 |
| `server/routes/config.ts` | MEDIUM | YAML 감지 (501), 손상된 JSON 처리 누락 |

### 1D. mcp 패키지 (전체 미커버)

9개 소스 파일 모두 테스트 0개. 특히 `helpers.ts` (파이프라인 실행 + 임시 파일 관리)와 `tools/review-pr.ts` (셸 명령 실행)는 즉시 테스트 필요.

---

## 2. 테스트 품질

### 2A. 과도한 Mocking (HIGH)

| 파일 | vi.mock() 수 | 문제 |
|------|-------------|------|
| `pipeline-chunk-parallel.test.ts` | **17** | 전체 파이프라인 의존성 mock — 내부 호출 순서만 검증 |
| `orchestrator-branches.test.ts` | **17** | 위와 동일한 블록 복붙 |
| `l1-provider-registry.test.ts` | **11** | 모든 AI SDK 프로바이더 mock, 실제 타입과 다른 형태 |

**개선**: pure function 의존성(chunker, groupDiff, applyThreshold)은 실제 구현 사용, I/O 경계(backend, fs)만 mock → mock 수 17 → ~5-6으로 감소 가능.

### 2B. 구현 세부사항 결합 (HIGH)

| 파일 | mock.calls[] 접근 수 | 문제 |
|------|---------------------|------|
| `l2-writer.test.ts` | **36** | `mockWriteMarkdown.mock.calls[0][1]`로 내용 검증 |
| `l3-writer.test.ts` | **24** | 동일 패턴 |
| `l1-writer.test.ts` | **19** | 동일 패턴 |
| `pipeline-chunk-parallel.test.ts` | -- | `executeReviewers` 호출 횟수로 동작 검증 (6곳) |

**개선**: writer 함수가 생성된 콘텐츠를 반환하도록 하거나, in-memory fs (`memfs`) 사용.

### 2C. 약한 Assertion (MEDIUM)

| 파일 | 패턴 | 횟수 |
|------|------|------|
| `l1-provider-registry.test.ts` | `toBeDefined()` + `as any` 캐스트 | **17 + 18** |
| `plugin-providers.test.ts` | `toBeDefined()` only | **11** |
| `init-multiselect.test.ts` | `toBeDefined()` only | **12** |
| `l1-reviewer-fallback.test.ts` | `error.toBeDefined()` (메시지 미검증) | **2** |
| `l2-writer.test.ts` | `toContain('5')` 같은 숫자 매칭 | **3** |

**개선**: `toBeDefined()` → `toMatchObject({...})`, `as any` → typed test stub, 에러 assertion에 메시지 검증 추가.

---

## 3. E2E 갭

### 현재 E2E/통합 테스트 (4개 파일)

- `e2e-pipeline.test.ts` — mock backend으로 전체 파이프라인 (4 tests)
- `orchestrator-branches.test.ts` — 완전 mocked (7 tests)
- `pipeline-chunk-parallel.test.ts` — 완전 mocked (7 tests)
- `github-integration.test.ts` — PR diff 가져오기

### 핵심 누락 시나리오 (HIGH)

| 시나리오 | 상태 | 영향도 |
|----------|------|--------|
| **상충하는 리뷰어 의견 → L2 토론 → L3 판결** | 누락 | 시스템의 핵심 가치 제안 — 모든 리뷰어가 동일 응답만 테스트됨 |
| **`skipDiscussion=true`** (orchestrator:374) | 누락 | `--no-discussion` 플래그 사용자에게 영향 |
| **`skipHead=true`** (orchestrator:452) | 누락 | lightweight 모드, `NEEDS_HUMAN` 반환 |
| **캐시 히트 경로** (orchestrator:185-202) | 누락 | 동일 diff 재실행 시 캐시된 결과 반환 |
| **서킷 브레이커 + 파이프라인 통합** | 누락 | 단독 테스트만 있음, 파이프라인 내 작동 미검증 |
| **중복 리뷰어 ID** | 누락 | `mergeReviewOutputsByReviewer()`에서 evidence 잘못 병합 가능 |

---

## 4. 엣지 케이스 커버리지

| 시나리오 | 상태 | 파일 |
|----------|------|------|
| 모든 리뷰어 실패 | ✅ 커버됨 | `e2e-pipeline.test.ts:139`, `orchestrator-branches.test.ts:229` |
| 빈 diff | ✅ 커버됨 | `orchestrator-branches.test.ts:215`, `auto-approve.test.ts:33` 등 5곳 |
| 거대한 diff | ⚠️ 부분 | 청킹은 테스트됨, 10+ 청크 동시 실패는 미검증 |
| 악성 리뷰어 응답 (XSS) | ✅ 커버됨 | `cli-output-formats.test.ts:161` (HTML/XML 이스케이핑) |
| 손상된 리뷰어 응답 | ✅ 커버됨 | `l1-parser.test.ts:295` (빈 응답, 불완전 블록 등) |
| **무한 길이 응답** | ❌ 누락 | 1MB+ 응답 시 메모리/성능 영향 미검증 |
| 네트워크 타임아웃 | ✅ 커버됨 | `l1-reviewer-timeout.test.ts` (8 tests), `l1-reviewer-fallback.test.ts` (13 tests) |
| 동시성 제한 | ✅ 커버됨 | `concurrency.test.ts`, `pipeline-chunk-parallel.test.ts` |
| 설정 파일 누락/손상 | ✅ 커버됨 | `config-not-found.test.ts`, `config.test.ts` 등 |
| **중복 리뷰어 ID** | ❌ 누락 | config validation에서 미체크, merge 시 오동작 가능 |
| 서킷 브레이커 | ✅ 단독 커버 | `l1-circuit-breaker.test.ts` (12 tests) |
| L2 moderator 전체 실패 | ❌ 누락 | 개별 토론 실패만 테스트, moderator 자체 throw 미검증 |
| L3 verdict 생성 실패 | ❌ 누락 | L1/L2 성공 후 L3 throw 미검증 |

---

## 5. Flaky 테스트

### HIGH 리스크

| 파일:라인 | 패턴 | 원인 | 수정 방향 |
|-----------|------|------|-----------|
| `l2-moderator-parallel.test.ts:204` | `Date.now()` 30ms 임계값 | CPU 부하 시 타이밍 불안정 | peak 동시성 카운터 사용 |
| `l1-process-kill.test.ts` (전체) | 실제 프로세스 spawn + 폴링 | OS 스케줄러 의존, PID 99999 충돌 가능 | mock spawn 또는 격리 |
| `concurrency.test.ts:47` | 실제 setTimeout 30ms로 순서 판정 | 타이머 해상도 의존 | `vi.useFakeTimers()` |

### MEDIUM 리스크

| 파일 | 패턴 | 수정 방향 |
|------|------|-----------|
| `env-detect.test.ts`, `pipeline-dryrun.test.ts`, `l1-provider-registry.test.ts` 등 7개 파일 | `delete process.env[X]` 직접 조작 | `vi.stubEnv()` 통일 |
| `session.test.ts` | CWD에 `.ca/` 생성 | temp 디렉토리 격리 |
| `e2e-pipeline.test.ts:71` | 하드코딩 `/tmp` 경로 | `fs.mkdtemp()` 사용 |

### LOW 리스크

| 파일 | 패턴 |
|------|------|
| `ws.test.ts:18` | `globalThis` 오염 미정리 |
| `tui-config.test.tsx:75` | 20ms 실제 타이머 렌더 대기 |
| `config-not-found.test.ts:13` | `Date.now()` 충돌 가능 경로 |

---

## 6. 테스트 구조

### 현재 구조

```
src/tests/                 # 110 파일 — 모든 패키지의 테스트가 여기에 집중
packages/web/tests/        # 30 파일 — web 전용
tools/tests/               # 7 파일 — 도구 전용
packages/*/                # 나머지 패키지는 테스트 디렉토리 없음
```

### 장점

- 일관된 네이밍 (`feature.test.ts`, `.spec` 없음)
- 레이어 기반 접두사 (`l0-*`, `l1-*`, `l2-*`, `l3-*`) — 아키텍처 가시성
- E2E 테스트 `forks` 풀로 격리
- 충분한 테스트 수 (2,231개)

### 문제점

| 문제 | 영향 | 제안 |
|------|------|------|
| **공유 헬퍼 없음** | `makeInput()`, `makeDiscussion()` 등 중복 정의 | `src/tests/_helpers/` 생성 |
| **fixture 디렉토리 없음** | diff, config, 리뷰어 응답 인라인 정의로 파일 비대 | `src/tests/_fixtures/` 생성 |
| **env 관리 비일관** | `vi.stubEnv()` vs `delete process.env` 혼재 | `vi.stubEnv()` 통일 |
| **패키지 독립 테스트 불가** | 모든 테스트가 `src/tests/`에 → 패키지별 `pnpm test` 없음 | 패키지별 vitest config + test script 추가 |
| **TUI 커버리지 제외** | `packages/tui/**`가 커버리지 리포트에서 빠짐 | `src/tests/tui-*.test.tsx`가 커버하므로 포함 필요 |

### 구조 개선 제안

현재 중앙집중 방식을 유지하되, **점진적으로 co-location 전환**:

1. **즉시**: `src/tests/_helpers/` + `src/tests/_fixtures/` 생성
2. **단기**: 각 패키지에 `tests/` + `vitest.config.ts` + `test` script 추가 (shared, github, mcp 우선)
3. **중기**: 새 테스트는 패키지 내에 작성, 기존 테스트는 점진 이동
4. **vitest workspace** 설정으로 `pnpm test:ws`가 모든 패키지 실행

---

## 우선순위 액션 플랜

### P0 — 즉시 (이번 주)

1. **`packages/mcp/src/tests/`** 생성 — helpers.ts + 7개 도구 테스트 (~40 케이스)
2. **`l0/index.ts` resolveReviewers 전용 테스트** — auto 리뷰어 라우팅이 핵심 로직
3. **상충하는 리뷰어 의견 E2E 테스트** — 시스템 핵심 가치를 검증하는 통합 테스트
4. **`server/middleware.ts` CORS 테스트** — 보안 관련

### P1 — 단기 (이번 스프린트)

5. `learning/collector.ts` 테스트 — GitHub API 통합
6. orchestrator `skipDiscussion` + `skipHead` + 캐시 히트 테스트
7. flaky 테스트 수정 — `l2-moderator-parallel.test.ts`, `l1-process-kill.test.ts`
8. `shared` 패키지 유틸리티 테스트 (cache, concurrency, path-validation 우선)

### P2 — 중기 (다음 스프린트)

9. writer 테스트 리팩터 — mock.calls[] 검사 → 반환값 assertion
10. orchestrator 테스트 mock 수 감소 (17 → ~5-6)
11. `github` 패키지 테스트 (diff-parser, poster, sarif 우선)
12. provider 테스트 `it.each()` 파라미터화 + typed stub
13. `env` 관리 `vi.stubEnv()`로 통일
14. 공유 헬퍼/fixture 디렉토리 구성

### P3 — 장기

15. `cli` 패키지 독립 테스트
16. `notifications` 패키지 테스트
17. `tui` 컴포넌트 통합 테스트 (ink-testing-library)
18. 패키지별 vitest config + workspace 설정

---

## 부록: 패키지별 미커버 소스 파일 전체 목록

### packages/shared/ (17개)

- `data/models-dev.ts`
- `i18n/index.ts`, `meme/index.ts`
- `providers/env-vars.ts`
- `utils/cache.ts`, `utils/cli-detect.ts`, `utils/concurrency.ts`, `utils/diff.ts`
- `utils/env-detect.ts`, `utils/fs.ts`, `utils/hash.ts`, `utils/issue-mapper.ts`
- `utils/logger.ts`, `utils/path-validation.ts`, `utils/process-kill.ts`
- `utils/recovery.ts`, `utils/scope-detector.ts`

### packages/github/ (12개)

- `action.ts`, `client.ts`, `comment.ts`, `dedup.ts`, `diff-parser.ts`
- `dryrun-preview.ts`, `mapper.ts`, `poster.ts`, `pr-diff.ts`
- `sarif.ts`, `session-diff.ts`, `types.ts`

### packages/notifications/ (4개)

- `discord-live.ts`, `event-stream.ts`, `generic-webhook.ts`, `webhook.ts`

### packages/cli/ (20개)

- `commands/`: agreement.ts, config-set.ts, costs.ts, dashboard.ts, doctor.ts, explain.ts, init.ts, learn.ts, models.ts, providers-test.ts, providers.ts, replay.ts, sessions.ts, status.ts
- `formatters/`: annotated-output.ts, review-output.ts
- `options/`, `utils/`, `index.ts` 등

### packages/tui/ (32개)

- React/Ink 컴포넌트 15개 (App, Header, Menu, 각종 Panel, Screen 등)
- Screen 컴포넌트 8개
- Hooks/Utils: useRouter, theme, provider-status 등

### packages/mcp/ (9개)

- `helpers.ts`, `index.ts`
- `tools/`: dry-run.ts, explain.ts, leaderboard.ts, review-full.ts, review-pr.ts, review-quick.ts, stats.ts

### packages/web/ — 테스트 없는 서버 파일

- `server/middleware.ts`, `server/utils/fs-helpers.ts`, `server/index.ts`
- `server/ws.ts` (export 존재 확인만)
- `frontend/hooks/useApi.ts`, `frontend/hooks/useWebSocket.ts`
- `frontend/components/*.tsx` (30개), `frontend/pages/*.tsx` (8개)

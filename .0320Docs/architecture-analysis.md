# CodeAgora 아키텍처 심층 분석 결과

> 분석일: 2026-03-20
> 대상: 8개 패키지 모노레포, 4계층 파이프라인 (L0→L1→L2→L3)

---

## 1. 패키지 경계 — ✅ 대체로 깔끔

### 의존 방향 (DAG)

```
shared (foundation)
  ↓
core (shared + AI SDKs)
  ↓
├── cli (core, shared, github, notifications)
├── github (core, shared)
├── notifications (core, shared)
├── tui (core, shared + cli*)
├── web (core, shared)
└── mcp (core, shared, cli*)
```

### 발견된 문제

- **mcp → cli 의존**: `mcp/src/tools/leaderboard.ts`가 `@codeagora/cli/commands/models.js`를, `mcp/src/tools/stats.ts`가 `@codeagora/cli/commands/sessions.js`를 직접 import. MCP는 core 레벨 패키지인데 presentation layer(cli)에 의존하고 있음. 이 로직은 core나 shared로 내려야 함.
- **tui → cli 의존**: `tui/src/screens/SessionsScreen.tsx`가 `@codeagora/cli/commands/sessions.js`를 import. 동일한 문제 — 세션 조회 로직이 CLI에 갇혀 있음.
- **순환 의존**: 없음. 깔끔한 DAG 유지 중.

**심각도: 중** — mcp/tui가 cli에 의존하면 cli 변경 시 하위 패키지까지 영향받음.

---

## 2. 계층 분리 — ⚠️ L0↔L1 양방향 결합

### 계층 간 import 분석

| From → To | 참조 | 평가 |
|-----------|------|------|
| pipeline → L0, L1, L2, L3 | orchestrator.ts | ✅ 정상 (오케스트레이터) |
| L2 → L1 | `moderator.ts`, `objection.ts` → `executeBackend` | ⚠️ L2가 L1 실행 인프라 직접 사용 |
| L0 → L1 | `health-monitor.ts` → `CircuitBreaker` | ⚠️ 역방향 의존 |
| L0 ↔ L1 | `l0/index.ts` imports `ReviewerInput` from L1; `l1/reviewer.ts` imports `HealthMonitor` from L0 | ❌ **양방향 결합** |
| config → L1 | `validator.ts` → `getSupportedProviders` | ⚠️ config가 L1 구현에 의존 |

### 핵심 문제

- **L0↔L1 양방향 의존**: L0(모델 선택)과 L1(리뷰어 실행)이 서로를 참조. `ReviewerInput` 타입을 shared types로 올리면 해결 가능.
- **L2→L1 직접 호출**: 모더레이터가 `executeBackend`를 직접 호출. supporter 실행을 별도 인터페이스로 추상화하는 것이 이상적이나, 현재 규모에서는 실용적 타협.

**심각도: 중** — 양방향 결합이 리팩토링/테스트를 복잡하게 만들 수 있으나, 현재 규모에서는 관리 가능.

---

## 3. 확장성 — ✅ 프로바이더 추가 용이 / ⚠️ 출력 포맷 경직

### 새 프로바이더 추가 시

- `l1/provider-registry.ts`의 `PROVIDER_FACTORIES`에 엔트리 1개 추가 (~5줄)
- `shared/providers/env-vars.ts`에 env var 매핑 추가
- **수정 범위: 2개 파일, ~10줄** — 매우 용이

### 새 백엔드(CLI) 추가 시

- `l1/backend.ts`에 spawn 명령어 추가
- `types/config.ts`의 Backend enum에 추가
- **수정 범위: 2개 파일** — 용이

### 새 output format 추가 시

- OutputPlugin 인터페이스가 정의되어 있으나 **파이프라인에 연결되지 않음** (아래 #5 참조)
- 현재 출력은 `l1/writer.ts`, `l2/writer.ts`, `l3/writer.ts`, `pipeline/report.ts` 등에 하드코딩
- **수정 범위: 여러 writer 파일** — 확장 어려움

**심각도: 낮** — 프로바이더 추가가 주된 확장 시나리오이므로 현실적으로 문제없음.

---

## 4. 설정 시스템 — ✅ 잘 설계됨

### 구성: 7개 파일, ~1,343줄

| 파일 | 줄수 | 역할 |
|------|------|------|
| templates.ts | 438 | init wizard 템플릿 생성 |
| migrator.ts | 288 | CLI→API 마이그레이션 |
| loader.ts | 218 | JSON/YAML 로딩 + 검증 |
| validator.ts | 170 | 런타임 유효성 검사 |
| credentials.ts | 105 | 인증 관리 |
| converter.ts | 76 | 포맷 변환 |
| mode-presets.ts | 48 | 사전설정 |

### 평가

- Zod 스키마 기반으로 견고한 검증 체인
- JSON + YAML 이중 지원 적절
- 마이그레이션 시스템 (CLI→API 전환) 잘 구현
- `templates.ts`가 438줄로 가장 크나, wizard UI 로직이라 불가피

**심각도: 없음** — 비대하지 않으며 관심사 분리 잘 됨.

---

## 5. 플러그인 시스템 — ❌ 미연결 (Dead Code)

### 구현 상태: 5개 파일, 530줄 — 완전히 구현되어 있음

- `types.ts`: 4가지 플러그인 타입 (provider, backend, output, hook)
- `registry.ts`: 싱글톤 레지스트리
- `loader.ts`: 검증 + 로딩
- `provider-manager.ts`: 프로바이더 인스턴스 관리
- `builtin-providers.ts`: 8개 빌트인 프로바이더 래핑

### 문제: 파이프라인에서 전혀 사용되지 않음

- `orchestrator.ts`에 플러그인 관련 import 없음
- 전체 `packages/` 디렉토리에서 `getPluginRegistry`, `loadPlugins` 등을 호출하는 코드 없음 (자기 자신의 모듈 내부 참조만 존재)
- **실제 프로바이더 실행은 `l1/provider-registry.ts`의 하드코딩된 `PROVIDER_FACTORIES`로 이루어짐**

### 이중 등록 문제

- `l1/provider-registry.ts`: 17+ 프로바이더 하드코딩 (실제 사용)
- `plugins/builtin-providers.ts`: 8개 프로바이더 래핑 (미사용)
- 같은 프로바이더가 두 곳에 정의되어 있으나 연결 안 됨

**심각도: 높** — 530줄의 dead code. 연결하든 삭제하든 결정 필요.

---

## 6. 룰 엔진 — ❌ 미연결 (Dead Code)

### 구현 상태: 3개 파일, 223줄

- `types.ts`: Rule/CompiledRule Zod 스키마 (24줄)
- `loader.ts`: `.reviewrules` YAML 로딩 + regex 컴파일 (69줄)
- `matcher.ts`: diff 대상 룰 매칭, EvidenceDocument 생성 (132줄)

### 문제: 파이프라인에서 호출되지 않음

- `loadReviewRules`와 `matchRules`가 orchestrator.ts나 다른 파이프라인 코드에서 import되지 않음
- 전체 codebase 검색 결과, 이 함수들의 유일한 참조는 자기 자신의 정의뿐

### 설계 의도 vs 현실

- 사용자 정의 `.reviewrules` 파일로 커스텀 린트 룰을 추가하는 기능이 계획되었으나 통합 미완성
- `matcher.ts`가 EvidenceDocument를 반환하므로 L1 결과에 합류시키는 것이 자연스러움

**심각도: 중** — 구현은 완료되었으나 연결만 안 됨. 간단한 통합 작업으로 활성화 가능.

---

## 7. 학습 시스템 — ✅ 파이프라인에 통합됨

### 구현 상태: 3개 파일, 199줄

- `store.ts`: `.ca/learned-patterns.json` 영속화 (74줄)
- `collector.ts`: GitHub PR 코멘트에서 dismissed 패턴 수집 (67줄)
- `filter.ts`: 학습된 패턴으로 이슈 suppress/downgrade (58줄)

### 통합 확인

```typescript
// orchestrator.ts:30-31
import { loadLearnedPatterns } from '../learning/store.js';
import { applyLearnedPatterns } from '../learning/filter.js';

// orchestrator.ts:349-359 — 실제 호출
const learnedPatterns = await loadLearnedPatterns(process.cwd());
if (learnedPatterns && learnedPatterns.dismissedPatterns.length > 0) {
  const { filtered, suppressed } = applyLearnedPatterns(...);
  allEvidenceDocs = filtered;
}
```

- `cli/src/commands/learn.ts`에서도 CLI 명령어로 노출
- collector → store → filter 체인 완전 연결

**심각도: 없음** — 정상 동작.

---

## 8. 세션 관리 — ⚠️ 스케일 한계

### 구현: `session/manager.ts` (93줄) — 매우 경량

### 구조

```
.ca/sessions/{YYYY-MM-DD}/{sessionId}/
  ├── metadata.json
  ├── result.json
  ├── reviews/
  └── discussions/
```

### 문제점

1. **인덱싱 없음**: 세션 목록 조회 시 디렉토리 순회 필요. `getNextSessionId(date)`는 날짜 디렉토리 내 폴더 수를 세는 방식으로 추정.
2. **정리 메커니즘 없음**: 오래된 세션 자동 삭제/아카이빙 없음. 시간이 지나면 `.ca/` 디렉토리가 무한히 커짐.
3. **동시 접근 제어 없음**: 파일 기반이므로 동시 파이프라인 실행 시 race condition 가능.
4. **캐시와 결합**: `result.json`을 세션 디렉토리에 직접 저장하고 캐시 인덱스로 참조. 세션 삭제 시 캐시 무효화 로직 없음.

### 현실적 평가

CLI 도구로서 동시 실행이 드물고, 일반적 사용량(일 수~십 회)에서는 문제 없음. 수백~수천 세션이 쌓이면 조회 성능 저하 예상.

**심각도: 낮** — 현재 사용 규모에서는 문제없으나, CI 자동화 등으로 대량 실행 시 성능 이슈 가능.

---

## 9. 미완성 기능 — 0 TODO/FIXME/HACK

코드베이스 전체에서 TODO, FIXME, HACK, stub, placeholder, "not implemented" 마커가 **0건** 감지됨. 코드 품질 관리가 잘 되어 있음.

단, 마커가 없다고 미완성이 없는 것은 아님 — 위의 #5(플러그인)와 #6(룰 엔진)이 마커 없이 미연결된 상태.

---

## 10. 기술 부채 — 우선순위 정리

### P0 (높음) — 즉시 결정 필요

| # | 항목 | 설명 | 영향 |
|---|------|------|------|
| 1 | **플러그인 시스템 미연결** | 530줄 dead code. provider-registry와 이중 등록 | 신규 기여자 혼란, 유지보수 비용 |
| 2 | **프로바이더 이중 경로** | `l1/provider-registry.ts` (실사용) vs `plugins/builtin-providers.ts` (미사용) | 프로바이더 추가 시 어디에 하는지 모호 |

### P1 (중간) — 다음 마일스톤에서 처리

| # | 항목 | 설명 | 영향 |
|---|------|------|------|
| 3 | **룰 엔진 미연결** | 223줄 구현 완료, orchestrator에 연결만 안 됨 | 기능 누락 |
| 4 | **L0↔L1 양방향 결합** | `ReviewerInput` 타입이 순환 의존 유발 | 리팩토링 시 복잡도 증가 |
| 5 | **mcp/tui → cli 의존** | 세션/모델 조회 로직이 CLI에 갇혀 있음 | 패키지 경계 위반 |

### P2 (낮음) — 장기 개선

| # | 항목 | 설명 | 영향 |
|---|------|------|------|
| 6 | **세션 정리 메커니즘 부재** | 자동 삭제/아카이빙 없음 | 대량 사용 시 디스크/성능 |
| 7 | **Output 포맷 경직** | OutputPlugin 미연결, writer 하드코딩 | 새 포맷 추가 시 여러 파일 수정 |
| 8 | **L2→L1 직접 결합** | 모더레이터가 backend 직접 호출 | 테스트 격리 어려움 |

---

## 요약

| 영역 | 상태 | 한 줄 진단 |
|------|------|------------|
| 패키지 경계 | ✅ 양호 | DAG 깔끔, mcp/tui→cli 의존만 수정 필요 |
| 계층 분리 | ⚠️ 양호- | L0↔L1 양방향 결합 존재, 나머지 깔끔 |
| 확장성 | ✅ 양호 | 프로바이더 추가 2파일 10줄, output만 경직 |
| 설정 시스템 | ✅ 우수 | Zod 기반, 마이그레이션 지원, 적절한 규모 |
| 플러그인 시스템 | ❌ Dead Code | 530줄 완전 구현, 파이프라인 미연결 |
| 룰 엔진 | ❌ Dead Code | 223줄 완전 구현, 파이프라인 미연결 |
| 학습 시스템 | ✅ 동작 | collector→store→filter 체인 정상 통합 |
| 세션 관리 | ⚠️ 양호- | 현재 규모에서 충분, 대규모 사용 시 한계 |
| 미완성 기능 | ✅ 마커 0건 | 단, 마커 없는 미연결 기능 2건 |
| 기술 부채 | 중간 수준 | P0 2건(플러그인/이중경로), P1 3건 |

### 가장 시급한 결정

플러그인 시스템을 파이프라인에 연결할 것인지 (provider-registry를 플러그인 기반으로 전환), 아니면 dead code로 제거할 것인지. 이 결정이 룰 엔진 통합 방식과 output 확장성에도 영향을 미침.

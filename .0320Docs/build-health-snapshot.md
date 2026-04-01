# CodeAgora 빌드 상태 스냅샷 (2026-03-20)

## 1. Build (`pnpm build`)
### PASS
- 8/9 워크스페이스 패키지 빌드 성공
- `web`, `cli` — tsup 빌드 정상
- 나머지 6개 — `echo skip` (소스 직접 참조, 빌드 불필요)

---

## 2. Type Check (`pnpm typecheck` = `tsc --noEmit`)
### PASS
- 타입 에러 0개

---

## 3. ESLint (`npx eslint packages/*/src/ examples/`)
### FAIL — 7 errors, 11 warnings

**Errors (7)** — 전부 `@typescript-eslint/no-unused-vars`:

| File | Line | Unused Symbol |
|------|------|---------------|
| `packages/cli/src/commands/costs.ts` | 23 | `CostSummary` |
| `packages/cli/src/commands/init.ts` | 621 | `detectApiKeys` |
| `packages/cli/src/commands/models.ts` | 7 | `BanditArm` |
| `packages/core/src/pipeline/orchestrator.ts` | 112 | `pipelineStartMs` |
| `packages/mcp/src/index.ts` | 9 | `z` |
| `packages/web/src/frontend/pages/ReviewDetail.tsx` | 16 | `Severity` |
| `packages/web/src/frontend/pages/ReviewDetail.tsx` | 18 | `DiffIssueMarker` |

**Warnings (11)**:

| Type | Count | Files |
|------|-------|-------|
| `@typescript-eslint/no-explicit-any` | 2 | `examples/vulnerable-api/server.ts` |
| `@typescript-eslint/no-explicit-any` | 2 | `packages/cli/src/commands/init.ts` |
| `react-hooks/exhaustive-deps` | 6 | `packages/web/src/frontend/pages/Costs.tsx` (4), `packages/web/src/frontend/pages/Sessions.tsx` (2) |
| Unused eslint-disable directive | 1 | `packages/tui/src/screens/SessionsScreen.tsx` |

---

## 4. Tests

### Root Tests (`vitest run`)
### FAIL — 1 failed / 1816 passed (110 files)

**실패 테스트:**
```
src/tests/init-multiselect.test.ts:462
  "buildMultiProviderConfig() > supports cli backend"

  expected: 'cli'
  received: 'claude'

  config.reviewers[0]!.backend이 'cli' 대신 'claude'를 반환
```

### Web Tests (`packages/web vitest run`)
### PASS — 336 passed (30 files)

### 전체: 1 failed / 2152 passed (140 test files)

---

## 5. tsconfig 일관성

### 구조
- `tsconfig.base.json` — 공통 설정 (strict, ES2022, bundler resolution, composite)
- `tsconfig.json` (루트) — 전체 타입체크용, paths alias, `tsconfig.base.json`을 상속하지 않음
- 각 패키지 — `extends: "../../tsconfig.base.json"`

### 발견된 불일치

| 항목 | 루트 `tsconfig.json` | `tsconfig.base.json` | 비고 |
|------|---------------------|---------------------|------|
| `composite` | 없음 | `true` | 루트는 빌드 대상 아니라 OK |
| `lib` | `["ES2023","DOM","DOM.Iterable"]` | `["ES2023"]` | 루트가 DOM 포함 (TUI/Web 때문) |
| `allowJs` | `true` | 없음 | 루트에만 설정 |
| `types` | `["node","vitest/globals"]` | 없음 | 루트에만 설정 |
| `paths` | 8개 워크스페이스 alias | 없음 | 루트 타입체크 전용 |

| 패키지 | 특이사항 |
|--------|---------|
| `web` | `composite: false`, `declaration: false`, 자체 `paths` 재정의, `rootDir` 없음 |
| `tui` | `jsx: "react-jsx"` 재정의 (base에 이미 있으므로 중복) |
| `web` | `lib` 재정의 — DOM 추가 (프론트엔드라 필요) |

**결론**: 의도적 차이로 보이며, 실질적 문제는 없음.

---

## 6. 의존성

### PASS
- `pnpm ls` — 누락/충돌 경고 없음
- React: 단일 버전 `19.2.4` (중복 없음)
- ESLint config에 `dist/**` ignore가 있지만 `eslint.config.js`의 `ignores` 위치가 마지막 config 객체에 있어 전역 적용됨 — 정상

### ESLint 설정 메모
- `lint` npm script가 **정의되어 있지 않음** — `pnpm lint`가 시스템 PATH의 Android SDK lint를 실행함
- `package.json`에 `"lint": "eslint packages/*/src/"` 스크립트 추가 권장

---

## 요약

| 항목 | 상태 | 이슈 수 |
|------|------|---------|
| Build | PASS | 0 |
| Type Check | PASS | 0 |
| ESLint | FAIL | 7 errors, 11 warnings |
| Tests (root) | FAIL | 1 failed |
| Tests (web) | PASS | 0 |
| tsconfig 일관성 | OK | 의도적 차이만 존재 |
| 의존성 | OK | 충돌/누락 없음 |
| lint script | 누락 | `package.json`에 lint 스크립트 없음 |

**즉시 수정 필요:**
1. `init-multiselect.test.ts:462` — CLI backend 매핑 로직과 테스트 기대값 불일치
2. 7개 unused import/variable 정리

**권장 개선:**
1. `package.json`에 `"lint": "eslint packages/*/src/"` 스크립트 추가
2. `react-hooks/exhaustive-deps` 경고 6건 — `sessions` 변수 메모이제이션

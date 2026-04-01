# CodeAgora 전체 보안 리뷰 보고서

**분석 범위:** 8개 패키지 전체 (shared, core, cli, web, github, notifications, mcp, tui) + plugin bridge
**분석 에이전트:** 6개 병렬 (Shell Injection, Path Traversal, Credentials, Web Server, GitHub/Webhook, MCP/Dependencies)
**날짜:** 2026-03-20

---

## 요약

| Severity | 건수 |
|----------|------|
| **CRITICAL** | 5 |
| **HIGH** | 12 |
| **MEDIUM** | 13 |
| **LOW** | 7 |
| **총계** | **37** (중복 제거 후) |

---

## CRITICAL (5건) — 즉시 수정 필요

### C-1. CLI 백엔드 8개: 프롬프트를 인자로 직접 전달 (Argument Injection)

**위치:** `packages/core/src/l1/backend.ts:144-190`
**공격 벡터:** 악성 PR diff → 프롬프트에 포함 → CLI 인자로 전달 → 대상 CLI 도구의 인자 파서 악용

| 백엔드 | 라인 | 패턴 |
|---------|------|-------|
| copilot | 146 | `['-p', input.prompt, ...]` |
| aider | 152 | `['--message', input.prompt, ...]` |
| goose | 158 | `['run', '-t', input.prompt, ...]` |
| cline | 164 | `['-y', input.prompt]` |
| qwen-code | 170 | `['-p', input.prompt]` |
| vibe | 176 | `['--prompt', input.prompt]` |
| kiro | 182 | `['chat', ..., input.prompt]` (positional) |
| cursor | 188 | `['-p', input.prompt]` |

`useStdin: true`를 사용하는 4개 백엔드(opencode, codex, gemini, claude)는 영향 없음.

**수정:** 모든 백엔드를 stdin 파이핑으로 전환. stdin 미지원 시 temp file 사용:
```typescript
case 'aider': {
  const tmpFile = writeTempPrompt(input.prompt);
  return { bin: 'aider', args: ['--message-file', tmpFile, '--yes-always'], useStdin: false, cleanup: tmpFile };
}
```

---

### C-2. `readSurroundingContext`: diff 파일 경로 통한 임의 파일 읽기

**위치:** `packages/shared/src/utils/diff.ts:103-119`
**공격 벡터:** `diff --git a/../../etc/passwd b/../../etc/passwd` → `path.join(repoPath, file)` → 임의 파일 읽기 → LLM 프롬프트에 포함

호출 체인: `orchestrator.ts:151` → `parseDiffFileRanges()` → `orchestrator.ts:159` → `readSurroundingContext()` → `diff.ts:111` `path.join(repoPath, file)` — **containment check 없음**

**수정:**
```typescript
const filePath = path.join(repoPath, file);
const resolved = path.resolve(filePath);
const repoRoot = path.resolve(repoPath);
if (!resolved.startsWith(repoRoot + path.sep)) return '';
```

---

### C-3. GitHub Actions 출력 인젝션

**위치:** `packages/github/src/action.ts:179-192`
**공격 벡터:** LLM 응답에 개행 포함 → `$GITHUB_OUTPUT` 파일 형식 파괴 → 임의 output 변수 주입

- `EOF_${Date.now()}` delimiter가 예측 가능 — 값에 동일 delimiter 포함 시 heredoc 조기 종료
- 레거시 `::set-output` 경로(line 191)는 sanitization 전무

**수정:** `crypto.randomBytes(16)` 기반 delimiter + 레거시 경로에서 개행/제어문자 제거:
```typescript
import { randomBytes } from 'crypto';

function setActionOutput(name: string, value: string): void {
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    const delimiter = `ghadelimiter_${randomBytes(16).toString('hex')}`;
    appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  } else {
    const sanitized = value.replace(/[\r\n%]/g, '');
    console.log(`::set-output name=${name}::${sanitized}`);
  }
}
```

---

### C-4. PR 코멘트 Markdown Injection (LLM 출력 미sanitize)

**위치:** `packages/github/src/mapper.ts:55-141` (인라인 코멘트), `mapper.ts:221-416` (요약), `poster.ts:48-53` (GitHub API 전송)
**공격 벡터:** 악성 diff → LLM이 특정 패턴 출력하도록 유도 (prompt injection) → `issueTitle`, `problem`, `evidence`, `suggestion` 필드에 Markdown/HTML 삽입 → PR 코멘트로 게시

가능한 공격: 피싱 링크 (`[![Approved](https://evil.com/badge.svg)](https://evil.com)`), `<details>` HTML 블록 스푸핑, 이미지 태그를 통한 IP 추적

**수정:** LLM 출력 필드에 `sanitizeMarkdown()` 적용:
```typescript
function sanitizeMarkdown(text: string): string {
  return text
    .replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'))
    .replace(/\[([^\]]*)\]\(javascript:/gi, '[$1](blocked:')
    .replace(/!\[([^\]]*)\]\(https?:\/\/(?!github\.com)/gi, '![$1](blocked:')
    .slice(0, 2000);
}
```

---

### C-5. 웹 서버: 전체 API 인증 없음 (config 덮어쓰기 가능)

**위치:** `packages/web/src/server/index.ts:33-54`, `routes/config.ts:42-67`
**공격 벡터:** localhost의 아무 프로세스 → `PUT /api/config` → `.ca/config.json` 전체 덮어쓰기 → 리뷰어/웹훅 URL을 공격자 서버로 변경 → 코드 diff 탈취

모든 엔드포인트에 인증 미들웨어가 없음. CORS는 브라우저만 제한하며 curl/스크립트는 무제한 접근.

**수정:** Bearer token 기반 인증 미들웨어 추가:
```typescript
import { createMiddleware } from 'hono/factory';
import crypto from 'crypto';

const authMiddleware = createMiddleware(async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return c.json({ error: 'Authentication required' }, 401);
  const expectedKey = process.env['CODEAGORA_API_KEY'];
  if (!expectedKey || !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    return c.json({ error: 'Invalid API key' }, 403);
  }
  await next();
});

app.use('/api/*', authMiddleware);
```

---

## HIGH (12건)

### H-1. MCP Plugin Bridge: `diffPath` 경로 검증 없음

**위치:** `plugin/bridge/mcp-server.ts:27-31`
**설명:** `diffPath`가 `validateDiffPath()` 없이 직접 `execFileAsync`에 전달. `validateDiffPath` 유틸이 존재하지만 미사용.
**수정:** `validateDiffPath(diffPath, { allowedRoots: [process.cwd()] })` 적용

---

### H-2. MCP `review_pr`: URL 형식 검증 없음

**위치:** `packages/mcp/src/tools/review-pr.ts:23`
**설명:** `pr_url`이 `z.string()`만으로 검증되어 `gh pr diff`에 직접 전달. `parsePrUrl()` 유틸 존재하지만 미사용.
**수정:** `parsePrUrl(pr_url)` 검증 후 canonical URL 재구성

---

### H-3. `$EDITOR` 환경변수 인젝션

**위치:** `packages/cli/src/commands/config-set.ts:100-101`
**설명:** `process.env['EDITOR']`를 검증 없이 `spawnSync`에 전달. 같은 프로젝트의 `ConfigScreen.tsx:121`에는 이미 regex 검증 존재.
**수정:**
```typescript
const SAFE_EDITOR = /^[a-zA-Z0-9/._-]+$/;
const rawEditor = process.env['VISUAL'] || process.env['EDITOR'] || 'vi';
const editor = SAFE_EDITOR.test(rawEditor) ? rawEditor : 'vi';
```

---

### H-4. Diff 파일 경로가 chunker에서 미검증

**위치:** `packages/core/src/pipeline/chunker.ts:53-85`
**설명:** `diff --git` 라인에서 추출한 `filePath`가 검증 없이 파이프라인 전체로 전파 → SARIF, 세션 JSON, 웹 대시보드, LLM 프롬프트.
**수정:**
```typescript
const segments = rawPath.split(/[\\/]/);
if (segments.includes('..') || path.isAbsolute(rawPath)) continue;
```

---

### H-5. Action `--diff` 경로 미검증

**위치:** `packages/github/src/action.ts:76,103`
**설명:** `inputs.diff`가 `validateDiffPath()` 없이 `fs.readFile()`에 직접 전달. SARIF 출력 경로(line 144)는 검증되지만 입력은 아님.
**수정:** `validateDiffPath(inputs.diff, { allowedRoots: [process.cwd(), '/tmp'] })` 적용

---

### H-6. SARIF 파일 경로 미sanitize

**위치:** `packages/github/src/sarif.ts:128-134`
**설명:** LLM 출력의 `doc.filePath`가 그대로 `artifactLocation.uri`에 사용. `../` 포함 가능.
**수정:**
```typescript
function sanitizeSarifPath(filePath: string): string {
  return filePath.replace(/\x00/g, '').replace(/\.\.\//g, '').replace(/^\//, '');
}
```

---

### H-7. `sendDiscordPipelineSummary` 웹훅 URL 검증 우회

**위치:** `packages/notifications/src/discord-live.ts:210-216`
**설명:** `postDiscord()`는 `validateWebhookUrl()` 호출하지만, `sendDiscordPipelineSummary`는 검증 없이 직접 `fetch()`.
**수정:** `validateWebhookUrl(webhookUrl)` 호출 추가

---

### H-8. WebSocket: 오리진 검증/인증 없음

**위치:** `packages/web/src/server/ws.ts:43-101`
**설명:** CORS는 WebSocket에 적용되지 않음. Cross-Site WebSocket Hijacking으로 실시간 리뷰 데이터 탈취 가능.
**수정:**
```typescript
app.get('/ws', (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return c.json({ error: 'Forbidden origin' }, 403);
  }
  return next();
}, upgradeWebSocket(() => { ... }));
```

---

### H-9. WebSocket: 연결 수/메시지 크기 제한 없음

**위치:** `packages/web/src/server/ws.ts:43-101`
**설명:** 무제한 연결 → 모든 이벤트 broadcast → 메모리/CPU 고갈 DoS.
**수정:** `MAX_CONNECTIONS = 50` 제한 + 메시지 크기 제한 (1KB)

---

### H-10. API 전체 Rate Limiting 없음

**위치:** `packages/web/src/server/index.ts:33-54`
**설명:** `GET /api/sessions`, `GET /api/costs`는 매 요청마다 재귀적 파일시스템 탐색 → flood 시 디스크 I/O 고갈.
**수정:** `hono-rate-limiter` 적용 (전역 100req/min, write 10req/min)

---

### H-11. Credentials 파일 평문 저장

**위치:** `packages/core/src/config/credentials.ts:26-41`
**설명:** `~/.config/codeagora/credentials`에 모든 API 키를 `KEY=VALUE` 평문 저장. 0o600 퍼미션이지만 백업/클라우드 동기화에 취약.
**수정:** OS keychain 통합 고려 (`keytar` 라이브러리), 또는 최소한 at-rest 암호화

---

### H-12. `CONFIG_DIR` 생성 시 퍼미션 미지정

**위치:** `packages/core/src/config/credentials.ts:49`
**설명:** `mkdirSync(CONFIG_DIR, { recursive: true })` — `mode: 0o700` 없음 → 기본 umask(0o755)로 생성.
**수정:** `mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })`

---

## MEDIUM (13건)

| # | 제목 | 위치 | 설명 |
|---|------|------|------|
| M-1 | `spawn()` 전체 환경변수 상속 | `backend.ts:50-53` | 모든 API 키가 자식 프로세스에 노출. 필요한 키만 전달하도록 env 제한 필요. |
| M-2 | `checkFilePermissions` fail-open | `credentials.ts:102-103` | `statSync` 실패 시 `true` 반환. `false`로 변경 필요 (1줄 수정). |
| M-3 | Generic webhook 도메인 허용목록 없음 | `generic-webhook.ts:36-43` | HTTPS만 체크하고 도메인 제한 없음. 프라이빗 IP 차단 필요. |
| M-4 | MCP diff 파라미터 크기 제한 없음 | `review-quick.ts:14`, `review-full.ts:14` | `z.string().max(1_000_000)` 추가 필요. |
| M-5 | MCP `reviewer_count` 바운드 없음 | `review-quick.ts:15` | `z.number().int().min(1).max(10)` 추가 필요. |
| M-6 | 웹 에러 핸들러 내부 메시지 노출 | `middleware.ts:34-43` | 500 에러 시 generic 메시지 반환하도록 변경. |
| M-7 | 보안 응답 헤더 없음 | `server/index.ts` | `hono/secure-headers` 적용 (CSP, X-Frame-Options, nosniff). |
| M-8 | `PUT /api/config` body 크기 제한 없음 | `routes/config.ts:42-67` | `bodyLimit({ maxSize: 64 * 1024 })` 적용. |
| M-9 | `config-set` 민감 값 echo | `cli/src/index.ts:850` | key 이름에 `key\|token\|secret` 포함 시 값 마스킹. |
| M-10 | SessionLogger 로그 데이터 미redact | `logger.ts:46-64` | `sanitizeLogData()` 함수로 민감 필드 redact. |
| M-11 | 웹 Config API 웹훅 URL 노출 | `routes/config.ts:18-37` | GET 응답에서 webhookUrl을 `***redacted***`로 마스킹. |
| M-12 | 세션 prune symlink/형식 미검증 | `sessions.ts:410-452` | sessionId에 `/^\d{3}$/` regex + containment check 추가. |
| M-13 | 알림 페이로드에 민감 코드 포함 가능 | `webhook.ts:128-164` | 코드 스니펫 길이 제한 및 opt-in 설정 추가 고려. |

---

## LOW (7건)

| # | 제목 | 위치 | 설명 |
|---|------|------|------|
| L-1 | SAFE_ARG regex가 `:`, `/` 허용 | `backend.ts:100` | spawn() 사용으로 실제 위험 낮음. |
| L-2 | copilot `--allow-all` 플래그 | `backend.ts:146` | 읽기 전용 리뷰에 과도한 권한. |
| L-3 | kiro `--trust-all-tools` 플래그 | `backend.ts:183` | 읽기 전용 리뷰에 과도한 권한. |
| L-4 | SARIF 경로 정규화 안됨 | `sarif.ts:131-132` | `..` 세그먼트 제거 + 상대 경로 보장. |
| L-5 | 웹 서버 테스트 커버리지 0% | `packages/web/src/` | 보안 동작에 대한 회귀 테스트 필요. |
| L-6 | `flatted` <=3.4.1 Prototype Pollution | eslint 의존 체인 | dev-only. `pnpm overrides`로 >=3.4.2 강제. |
| L-7 | `esbuild` <=0.24.2 CORS | vitest/vite 의존 체인 | dev-only. vitest/vite 업데이트로 해결. |

---

## OWASP Top 10 평가

| 카테고리 | 상태 | 주요 발견 |
|----------|------|-----------|
| **A01: Broken Access Control** | **FAIL** | C-2, C-5, H-1, H-4, H-5 (경로 검증 미흡, 인증 없음) |
| **A02: Cryptographic Failures** | **WARN** | H-11 (평문 자격증명), M-11 (웹훅 URL 노출) |
| **A03: Injection** | **FAIL** | C-1, C-3, C-4, H-2 (인자/출력/Markdown 인젝션) |
| **A04: Insecure Design** | **FAIL** | H-9, H-10, M-4, M-5 (제한 없는 입력/연결) |
| **A05: Security Misconfiguration** | **FAIL** | M-7 (보안 헤더 없음), H-3 ($EDITOR) |
| **A06: Vulnerable Components** | **WARN** | L-6, L-7 (dev-only 의존성) |
| **A07: Auth Failures** | **FAIL** | C-5, H-8 (웹/WebSocket 인증 없음) |
| **A08: Data Integrity** | PASS | Zod 검증, lockfile 커밋됨 |
| **A09: Logging/Monitoring** | **WARN** | M-6, M-9, M-10 (에러 메시지/로그 노출) |
| **A10: SSRF** | **WARN** | M-3 (generic webhook 도메인 필터 없음) |

---

## 긍정적 보안 패턴 (잘 되어 있는 부분)

1. **`spawn()` 일관 사용** — 프로덕션 코드에 `exec()` 또는 `shell: true` 없음
2. **`validateDiffPath` 유틸** — null byte, `..` 탐지, allowedRoots containment (단, 일부 코드 경로에서 미사용)
3. **Discord/Slack 웹훅 도메인 허용목록** — `ALLOWED_WEBHOOK_HOSTS` 적용
4. **CLI 세션 명령어 경로 보호** — `sessions.ts`, `replay.ts`, `explain.ts`에서 `path.resolve()` + `startsWith()` 이중 방어
5. **Credential 파일 0o600 퍼미션** — 읽기 시 퍼미션 확인
6. **SAFE_ARG regex** — model/provider 인자 검증
7. **API 백엔드 4개 stdin 파이핑** — opencode, codex, gemini, claude
8. **`execFileSync` 사용** — git 작업에 shell 해석 방지
9. **Zod 스키마 검증** — 설정 로딩 전 검증
10. **npm `files` 허용목록** — 예시/테스트 파일 미배포

---

## 우선순위 수정 로드맵

### Phase 1 — 즉시 (1-2일)

| 순위 | 항목 | 난이도 |
|------|------|--------|
| 1 | C-2: `readSurroundingContext` containment check 추가 | 낮음 (5줄) |
| 2 | C-1: 8개 CLI 백엔드를 stdin/tmpfile로 전환 | 중간 |
| 3 | C-3: Actions 출력 delimiter를 crypto random으로 | 낮음 (10줄) |
| 4 | H-1: MCP bridge에 `validateDiffPath` 적용 | 낮음 (5줄) |
| 5 | H-2: MCP `review_pr`에 `parsePrUrl` 적용 | 낮음 (5줄) |
| 6 | H-4: chunker에서 diff 경로 `..` 필터링 | 낮음 (3줄) |
| 7 | M-2: `checkFilePermissions` fail-closed로 변경 | 낮음 (1줄) |
| 8 | H-12: `mkdirSync`에 `mode: 0o700` 추가 | 낮음 (1줄) |

### Phase 2 — 이번 주 (3-5일)

| 순위 | 항목 | 난이도 |
|------|------|--------|
| 9 | C-4: `sanitizeMarkdown()` 함수 구현 + mapper 적용 | 중간 |
| 10 | C-5: 웹 서버 인증 미들웨어 추가 | 중간 |
| 11 | H-8/H-9: WebSocket 오리진 검증 + 연결 제한 | 중간 |
| 12 | H-10: Rate limiting 미들웨어 추가 | 낮음 |
| 13 | M-1: spawn env를 필요한 키만 전달하도록 제한 | 중간 |
| 14 | M-4/M-5: MCP 입력 크기/범위 제한 | 낮음 |

### Phase 3 — 다음 스프린트

| 순위 | 항목 | 난이도 |
|------|------|--------|
| 15 | M-7: 보안 응답 헤더 (`hono/secure-headers`) | 낮음 |
| 16 | H-7: `sendDiscordPipelineSummary`에 URL 검증 추가 | 낮음 (1줄) |
| 17 | M-3: generic webhook 프라이빗 IP 차단 | 중간 |
| 18 | M-6/M-10: 에러 메시지/로그 sanitization | 중간 |
| 19 | L-6/L-7: 의존성 업데이트 | 낮음 |

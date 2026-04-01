# v2.0.0 정식 릴리즈 계획

> 작성일: 2026-03-22
> 현재: v2.0.0-rc.12
> 목표: v2.0.0 정식

---

## 원칙

- RC 단계에서 구조 변경 — 정식 후 breaking change 방지
- 본체는 가볍게, 확장은 optional로
- README는 짧게, 데모 GIF로 승부
- "추가는 쉽다 ≠ 관리도 쉽다" — 공식 지원 범위 명확히

---

## Phase 1: 패키지 구조 재편 (Day 1-2)

### 목표

```
codeagora (npm)         = shared + core + cli + github (핵심만)
@codeagora/web          = 별도 설치 (agora dashboard)
@codeagora/tui          = 별도 설치 (agora tui)
@codeagora/mcp          = 별도 설치 (MCP 서버)
@codeagora/notifications = 별도 설치 (Discord/Slack)
```

같은 레포, 같은 모노레포. npm publish 범위만 변경.

### 작업

1. 루트 `package.json` — web/tui/mcp/notifications를 dependencies에서 제거
2. 각 optional 패키지 — 독립 `package.json` 정리 (name, version, bin, main, types)
3. CLI에서 optional 패키지 감지:
   ```typescript
   // agora dashboard 실행 시
   try {
     await import('@codeagora/web');
   } catch {
     console.log('@codeagora/web이 설치되지 않았습니다.');
     console.log('설치: npm i -g @codeagora/web');
     process.exit(1);
   }
   ```
4. `agora tui`, `agora dashboard`, `agora notify` 전부 동일 패턴
5. 각 optional 패키지 독립 npm publish 테스트

### 주의

- 기존 `npm i -g codeagora` 사용자에게 breaking change
- RC이므로 허용, 릴리즈 노트에 마이그레이션 안내

---

## Phase 2: 프로바이더 Tier 분리 (Day 2-3)

### Tier 정의

**Tier 1 — 공식 지원 (직접 테스트, 이슈 대응 보장)**

| 타입 | 프로바이더 | 이유 |
|------|-----------|------|
| API | Groq | 무료, L1 리뷰어 핵심 |
| API | Anthropic | 유료 대표, L2/L3 핵심 |
| CLI | Claude Code | L2/L3 기본 백엔드 |
| CLI | Gemini CLI | 무료 대안 |
| CLI | Codex CLI | OpenAI 생태계 |

**Tier 2 — 검증됨 (동작 확인, best-effort 지원)**

| 타입 | 프로바이더 |
|------|-----------|
| API | OpenAI, Google, DeepSeek, OpenRouter |
| CLI | Copilot CLI, Cursor CLI |

**Tier 3 — 실험적 (추가만, 보장 없음)**

나머지 전부: Mistral, xAI, GitHub Models, GitHub Copilot, Cerebras, Together, Fireworks, Cohere, DeepInfra, Moonshot, Perplexity, HuggingFace, Baseten, SiliconFlow, Novita, NVIDIA, ZAI, Qwen, OpenCode, Aider, Goose, Cline, Qwen Code, Vibe, Kiro

### 작업

1. `provider-registry.ts`에 tier 메타데이터 추가
2. `agora providers`에서 tier 표시
3. `agora init`에서 Tier 1 우선 추천
4. 이슈 템플릿에 "Tier 3은 커뮤니티/실험적" 명시
5. README에 Tier 1만 표시, 전체 목록은 docs/PROVIDERS.md

---

## Phase 3: README 다이어트 + 데모 GIF (Day 3-4)

### 데모 GIF (최우선)

터미널에서:
```
$ git diff | agora review
```
→ L1 리뷰어 5개 병렬 실행 (프로그레스)
→ L2 토론 진행
→ L3 최종 판결
→ 결과 출력

이걸 30초 GIF로. `asciinema` 또는 `vhs`(charmbracelet) 사용.

### README 목표 구조

```markdown
# CodeAgora

[로고]

니 AI로 코드 리뷰. 싼 모델 5개가 토론해서 결론 낸다.

[데모 GIF]

## Quick Start

npm i -g codeagora
agora init
git diff | agora review

## 지원 프로바이더 (Tier 1)

| Provider | Type | Cost |
|----------|------|------|
| Groq     | API  | Free |
| Anthropic| API  | Paid |
| Claude   | CLI  | Subscription |
| Gemini   | CLI  | Free |
| Codex    | CLI  | Subscription |

[전체 프로바이더 목록 →](docs/PROVIDERS.md)

## 확장

npm i -g @codeagora/web    # 웹 대시보드
npm i -g @codeagora/mcp    # Claude Code 통합
npm i -g @codeagora/tui    # 인터랙티브 TUI

## GitHub Actions

[5줄 예시]

[전체 문서 →](docs/)
```

### docs/ 이동 대상

| 현재 README 섹션 | 이동 위치 |
|------------------|-----------|
| 전체 프로바이더 목록 | `docs/PROVIDERS.md` |
| CLI 명령어 레퍼런스 | `docs/CLI_REFERENCE.md` |
| 아키텍처 상세 (L0~L3) | `docs/ARCHITECTURE.md` |
| 설정 가이드 | `docs/CONFIGURATION.md` |
| MCP/Web/TUI 가이드 | `docs/EXTENSIONS.md` |
| 연구 배경 | `docs/RESEARCH.md` |

---

## Phase 4: 릴리즈 품질 보장 (Day 4-5)

### publish smoke test (CI)

```yaml
# .github/workflows/release.yml
release:
  steps:
    - pnpm build
    - npm pack
    - mkdir /tmp/smoke && cd /tmp/smoke
    - npm init -y
    - npm i ../codeagora-*.tgz
    - npx agora --version
    - npx agora doctor
```

### 프로바이더 헬스체크 (주간 cron)

```yaml
# .github/workflows/provider-health.yml
schedule:
  - cron: '0 9 * * 1'  # 매주 월요일
steps:
  - Tier 1 프로바이더에 "Say OK" 핑
  - 실패 시 GitHub Issue 자동 생성
```

### CHANGELOG

rc.1~rc.12 히스토리를 v2.0.0 단일 엔트리로 통합:

```markdown
## v2.0.0 (2026-03-XX)

### Breaking Changes
- 패키지 구조 변경: web/tui/mcp/notifications → 별도 optional 패키지
- 프로바이더 Tier 도입 (Tier 3은 실험적)

### Highlights
- 보안 하드닝: CRITICAL 5건 + HIGH 12건 수정
- 테스트: 1817 → 2671 (+854)
- 아키텍처: 순환 의존 해소, orchestrator 분해
- rules 엔진 파이프라인 연결
- models.dev 연동 + 자동 감지 기반 init
- 실제 API E2E 테스트 (Groq L1 + Claude CLI L2/L3)
```

---

## Phase 5: v2.0.0 정식 릴리즈 (Day 5)

### 체크리스트

- [ ] Phase 1: 패키지 분리 + optional 안내 메시지
- [ ] Phase 2: 프로바이더 Tier + provider-registry 메타데이터
- [ ] Phase 3: 데모 GIF 생성 + README 다이어트 + docs/ 이동
- [ ] Phase 4: publish smoke test CI + 프로바이더 헬스체크 cron
- [ ] Phase 4: CHANGELOG v2.0.0 작성
- [ ] `pnpm typecheck && pnpm vitest run` — 전체 통과
- [ ] `npm pack` → 임시 설치 → `agora --version` + `agora doctor`
- [ ] `npm publish` (정식, rc 태그 제거)
- [ ] optional 패키지 각각 `npm publish`
- [ ] GitHub Release 생성 + 릴리즈 노트
- [ ] GitHub repo description 업데이트

---

## 일정 요약

```
Day 1-2: Phase 1 (패키지 분리) — 가장 큰 구조 변경
Day 2-3: Phase 2 (프로바이더 Tier) — 코드 + 문서
Day 3-4: Phase 3 (데모 GIF + README) — 구조 확정 후 한 번만
Day 4-5: Phase 4 (CI + CHANGELOG) + Phase 5 (릴리즈)
```

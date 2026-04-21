<p align="center">
  <img src="assets/logo.svg" width="120" alt="CodeAgora Logo">
</p>

<h1 align="center">CodeAgora</h1>
<p align="center"><strong>LLM들이 당신의 코드를 토론합니다</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/codeagora"><img src="https://img.shields.io/npm/v/codeagora?color=%2305A6B9" alt="Version"></a>
  <img src="https://img.shields.io/badge/tests-3442%20passing-%23191A51" alt="Tests">
  <img src="https://img.shields.io/badge/version-2.3.3-%2305A6B9" alt="v2.3.3">
  <img src="https://img.shields.io/badge/node-%3E%3D20-%2305A6B9" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-%23191A51" alt="License">
</p>

CodeAgora는 여러 LLM을 병렬로 실행하여 코드를 독립적으로 리뷰하고, 의견 충돌이 생기면 구조화된 토론을 거쳐 Head 에이전트가 최종 판결을 내리는 코드 리뷰 파이프라인입니다. 서로 다른 모델은 서로 다른 사각지대를 가지고 있어, 함께 실행하면 더 많은 이슈를 잡아내고 합의를 통해 노이즈를 걸러냅니다.

---

## 동작 방식

```
git diff | agora review

  사전분석 --- 시맨틱 Diff 분류
           --- TypeScript 진단
           --- 변경 영향 분석
                |
  L1       --- Reviewer A (보안)   --+
           --- Reviewer B (로직)   --+-- 병렬 전문 리뷰
           --- Reviewer C (일반)   --+
                |
  필터     --- 환각 검증 (파일/라인 유효성)
           --- 자기모순 필터
           --- 근거 중복 제거
                |
  L2       --- 적대적 토론 (서포터가 반증해야 함)
           --- 정적 분석 근거 활용
                |
  L3       --- Head Agent --> ACCEPT / REJECT / NEEDS_HUMAN
                |
  출력     --- 트리아지: N개 필수수정 / N개 검증필요 / N개 무시
```

**사전 분석 레이어**: L1 리뷰어 실행 전에 5개 분석기가 diff를 선처리합니다 -- 시맨틱 분류, TypeScript 진단, 변경 영향 분석, 외부 AI 규칙 파일 감지(.cursorrules, CLAUDE.md, copilot-instructions), 빌드 아티팩트 자동 제외(dist/, 락 파일, *.min.js).

**L1 - 전문 페르소나 리뷰어**: 여러 LLM이 전문 역할(`builtin:security`, `builtin:logic`, `builtin:api-contract`, `builtin:general`)에 따라 diff를 독립적으로 리뷰합니다.

**환각 필터 (4단계)**: LLM 리뷰어의 오탐을 100%에서 25% 미만으로 줄입니다. 파일/라인 유효성 검증, 자기모순 감지, 근거 중복 제거, 신뢰도 기반 판정(0% 신뢰도 CRITICAL은 REJECT가 아닌 NEEDS_HUMAN으로).

**L2 - 토론**: 서포터 풀과 Devil's Advocate가 여러 라운드에 걸쳐 논쟁하고, 정적 분석 근거를 활용하며, 모더레이터가 합의를 이끌어내거나 강제 판결합니다.

**L3 - Head 판결**: 이슈를 그룹화하고, 미확인 발견사항을 스캔한 뒤, 최종 `ACCEPT`, `REJECT`, `NEEDS_HUMAN` 결정을 내립니다. CRITICAL+ 제안은 tsc 트랜스파일 검증을 거칩니다.

**트리아지 다이제스트**: 리뷰 상단에 한 줄 분류(필수수정 / 검증필요 / 무시)를 표시합니다.

---

## 빠른 시작

2분이면 됩니다.

**사전 요구사항**: Node.js 20+

```bash
# 1. 설치
npm install -g codeagora

# 2. 프로젝트에서 초기화
cd /your/project
agora init

# 5. API 키 설정 (Groq은 무료 — 시작하기 좋음)
export GROQ_API_KEY=your_key_here

# 6. 첫 리뷰 실행
git diff HEAD~1 | agora review
```

`agora init`은 사용 가능한 프로바이더로 `.ca/config.json`을 생성합니다.

---

## 설치

```bash
npm install -g codeagora

# 또는 설치 없이 바로 실행
npx codeagora
```

### 소스에서 설치

```bash
git clone <repo-url> codeagora
cd codeagora
pnpm install
pnpm build
```

빌드 결과물은 `dist/cli/index.js`이며, `agora`와 `codeagora` 두 가지 이름으로 사용 가능합니다.

### API 키

최소 하나의 프로바이더 API 키가 필요합니다:

| 프로바이더 | 환경 변수 |
|-----------|----------|
| Groq | `GROQ_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GOOGLE_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Qwen | `QWEN_API_KEY` |
| xAI | `XAI_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` |
| ZAI | `ZAI_API_KEY` |
| GitHub Models | `GITHUB_TOKEN` |
| GitHub Copilot | `GITHUB_COPILOT_TOKEN` |

API 키는 `~/.config/codeagora/credentials`에 안전하게 저장됩니다. TUI에서 설정하거나 직접 파일을 편집할 수 있습니다.

```bash
# 감지된 키 확인
agora providers
```

---

## CLI 명령어

### `agora review [diff-path]`

전체 리뷰 파이프라인을 실행합니다.

```bash
# diff 파일 리뷰
agora review changes.diff

# git에서 파이프
git diff HEAD~1 | agora review

# 특정 커밋 범위 리뷰
git diff main...feature-branch | agora review

# JSON 출력 (CI용)
git diff HEAD~1 | agora review --output json

# L2 토론 건너뛰기 (빠르지만 덜 정밀)
agora review changes.diff --no-discussion

# GitHub PR에서 직접 리뷰
agora review --pr 123

# 리뷰 결과를 PR에 게시
agora review --pr https://github.com/owner/repo/pull/123 --post-review
```

**옵션:**

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--output <format>` | 출력 형식: `text`, `json`, `md`, `github`, `annotated` | `text` |
| `--provider <name>` | 모든 리뷰어의 프로바이더 오버라이드 | - |
| `--model <name>` | 모든 리뷰어의 모델 오버라이드 | - |
| `--reviewers <value>` | 리뷰어 수 또는 쉼표 구분 ID | - |
| `--timeout <seconds>` | 파이프라인 타임아웃 | - |
| `--reviewer-timeout <seconds>` | 리뷰어별 타임아웃 | - |
| `--no-discussion` | L2 토론 건너뛰기 | - |
| `--quick` | 빠른 리뷰 (L1만, 토론 없음) | - |
| `--staged` | 스테이지된 변경 리뷰 (`git diff --staged`) | - |
| `--json-stream` | NDJSON 스트리밍 출력 (한 줄에 객체 하나) | - |
| `--pr <url-or-number>` | GitHub PR URL 또는 번호 | - |
| `--post-review` | PR에 리뷰 코멘트 게시 (`--pr` 필요) | - |
| `--dry-run` | 설정 검증만 | - |
| `--quiet` | 진행 출력 숨기기 | - |
| `--verbose` | 상세 텔레메트리 | - |

**종료 코드:**

| 코드 | 의미 |
|------|------|
| `0` | 성공 - 리뷰 통과 |
| `1` | `REJECT` 판정 |
| `2` | 설정 또는 셋업 에러 |
| `3` | 런타임 에러 |

### `agora init`

현재 프로젝트에 CodeAgora를 초기화합니다. `.ca/config.json`과 `.reviewignore`를 생성합니다.

```bash
# 대화형 위자드 (사용 가능한 API 키 감지)
agora init

# 기본값으로 비대화형 (CI 셋업용)
agora init --yes

# 기존 설정 덮어쓰기
agora init --force
```

### `agora doctor`

상태 검사. Node.js 버전, 설정 유효성, API 키 존재 여부를 확인합니다.

```bash
agora doctor
```

### `agora config`

현재 설정을 검증하고 표시합니다.

```bash
agora config
```

### `agora providers`

지원되는 프로바이더와 API 키 상태를 표시합니다.

```bash
agora providers
```

### `agora sessions`

과거 리뷰 세션을 관리합니다.

```bash
agora sessions list                     # 최근 세션 목록
agora sessions show 2026-03-19/001      # 세션 상세 보기
agora sessions diff 001 002             # 두 세션 비교
agora sessions stats                    # 리뷰 통계
agora sessions prune --days 30          # 오래된 세션 삭제
```

### `agora notify <session-id>`

과거 리뷰 세션의 알림을 설정된 Discord/Slack 웹훅으로 전송합니다.

```bash
agora notify 2026-03-19/001
```

설정에 `notifications.discord.webhookUrl` 또는 `notifications.slack.webhookUrl`이 필요합니다.

### `agora tui`

인터랙티브 터미널 UI를 실행합니다 - 리뷰 설정 위자드, 실시간 파이프라인 진행, 토론 뷰어, 결과 드릴다운.

```bash
agora tui
```

### `agora models`

모델 리더보드를 출력합니다 — Thompson Sampling 점수, 사용 횟수, 승률, 상태.

```bash
agora models
```

### `agora explain <session>`

과거 리뷰 세션의 내러티브 설명을 생성합니다 — 무엇이 발견되었고, 왜 플래그되었으며, 토론이 어떤 결론을 냈는지.

```bash
agora explain 2026-03-16/001
```

### `agora agreement <session>`

세션의 리뷰어 합의 매트릭스를 표시합니다.

```bash
agora agreement 2026-03-19/001
```

각 리뷰어 쌍이 같은 이슈를 얼마나 자주 지적했는지 교차 합의율을 보여줍니다.

### `agora replay <session>`

과거 세션의 파이프라인 이벤트를 인터랙티브하게 재생합니다.

```bash
agora replay 2026-03-16/001
```

### `agora status`

상태 개요를 표시합니다 — 활성 설정, 감지된 프로바이더, 마지막 세션 요약, 모델 상태.

```bash
agora status
```

### `agora dashboard`

로컬 웹 대시보드를 실행합니다. Hono.js REST API + React SPA를 브라우저에서 엽니다.

```bash
agora dashboard              # 기본 포트로 시작
agora dashboard --port 4000  # 포트 지정
agora dashboard --open       # 브라우저 자동 열기
```

**옵션:**

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--port <number>` | 대시보드 서버 포트 | `3141` |
| `--open` | 기본 브라우저에서 대시보드 자동 열기 | - |

### `agora costs`

과거 리뷰 세션의 비용 분석을 표시합니다.

```bash
agora costs                        # 전체 비용 요약
agora costs --last 10              # 최근 10개 세션
agora costs --by reviewer          # 리뷰어별 분류
agora costs --by provider          # 프로바이더별 분류
```

**옵션:**

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--last <n>` | 최근 N개 세션으로 제한 | - |
| `--by <dimension>` | `reviewer` 또는 `provider`별 그룹화 | - |

### `agora language [locale]`

CLI 메시지의 출력 언어를 조회하거나 설정합니다.

```bash
agora language        # 현재 언어 표시
agora language en     # 영어로 전환
agora language ko     # 한국어로 전환
```

### `agora config-set <key> <value>`

파일을 직접 열지 않고 점 표기법으로 설정값을 변경합니다.

```bash
agora config-set discussion.maxRounds 3
agora config-set errorHandling.forfeitThreshold 0.5
```

### `agora config-edit`

`$EDITOR`로 현재 설정 파일을 엽니다.

```bash
agora config-edit
```

### `agora providers-test`

각 설정된 프로바이더에 경량 프로브를 전송하여 API 키 상태를 검증합니다.

```bash
agora providers-test
```

### `agora learn`

과거 리뷰 세션에서 학습된 패턴을 관리합니다.

```bash
agora learn list             # 학습된 패턴 목록 보기
agora learn stats            # 학습 통계 표시
agora learn remove <id>      # ID로 패턴 삭제
agora learn clear            # 모든 학습 패턴 삭제
agora learn export <file>    # 패턴을 JSON 파일로 내보내기
agora learn import <file>    # JSON 파일에서 패턴 가져오기
```

---

## 설정

CodeAgora는 현재 디렉토리의 `.ca/config.json`을 읽습니다.

`agora init`으로 기본 설정을 생성하거나, 직접 작성할 수 있습니다:

```json
{
  "reviewers": [
    { "id": "r1-llama-70b", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "timeout": 120 },
    { "id": "r2-gpt4o", "model": "gpt-4o-mini", "backend": "api", "provider": "github-models", "timeout": 120 }
  ],
  "supporters": {
    "pool": [
      { "id": "s1", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "timeout": 120 }
    ],
    "pickCount": 2,
    "pickStrategy": "random",
    "devilsAdvocate": {
      "id": "da", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "timeout": 120
    },
    "personaPool": [".ca/personas/strict.md", ".ca/personas/pragmatic.md", ".ca/personas/security-focused.md"],
    "personaAssignment": "random"
  },
  "moderator": {
    "model": "llama-3.3-70b-versatile",
    "backend": "api",
    "provider": "groq"
  },
  "head": {
    "backend": "claude",
    "model": "claude-sonnet-4-20250514"
  },
  "discussion": {
    "maxRounds": 3,
    "registrationThreshold": {
      "HARSHLY_CRITICAL": 1,
      "CRITICAL": 1,
      "WARNING": 2,
      "SUGGESTION": null
    },
    "codeSnippetRange": 10
  },
  "errorHandling": {
    "maxRetries": 2,
    "forfeitThreshold": 0.7
  }
}
```

### 주요 설정 항목

**`reviewers`** - L1 리뷰어 에이전트. 다양한 프로바이더와 모델을 섞어 이질적 커버리지를 확보합니다.

**`supporters.devilsAdvocate`** - 다수 의견에 반대 논거를 제시하여 간과된 관점을 드러내는 에이전트.

**`supporters.personaPool`** - 리뷰어 페르소나를 정의한 마크다운 파일 (strict, pragmatic, security-focused).

**`head`** - L3 Head 에이전트. LLM 기반으로 토론 품질을 평가하여 최종 판결. 설정하지 않으면 규칙 기반 fallback.

**`discussion.registrationThreshold`** - 토론 등록 임계값:
- `HARSHLY_CRITICAL: 1` - 1명이면 충분
- `CRITICAL: 1` - 1명 + 서포터 동의
- `WARNING: 2` - 2명 이상 필요
- `SUGGESTION: null` - 토론 없이 `suggestions.md`로

### 페르소나

`.ca/personas/` 디렉토리에 마크다운 파일로 정의합니다:

- **strict.md** - 보안과 정확성을 최우선시하는 엄격한 리뷰어
- **pragmatic.md** - 실용성과 코드 품질의 균형을 잡는 리뷰어
- **security-focused.md** - 공격자 관점에서 보안 취약점을 찾는 리뷰어

### `reviewContext` 설정

리뷰 컨텍스트를 세밀하게 제어합니다:

```json
{
  "reviewContext": {
    "deploymentType": "production",
    "notes": "인증 모듈 리팩토링 중",
    "bundledOutputs": true,
    "pathRules": {
      "src/auth/**": "builtin:security",
      "src/api/**": "builtin:api-contract"
    },
    "verifySuggestions": true
  }
}
```

| 필드 | 설명 |
|------|------|
| `deploymentType` | 배포 유형 (production, staging, internal) |
| `notes` | 리뷰어에게 전달할 프로젝트 컨텍스트 메모 |
| `bundledOutputs` | 번들된 출력 포함 여부 |
| `pathRules` | 경로별 전문 페르소나 매핑 |
| `verifySuggestions` | CRITICAL+ 제안에 tsc 트랜스파일 검증 활성화 |

### 전문 페르소나

리뷰어에 빌트인 전문 페르소나를 할당할 수 있습니다:

```json
{
  "reviewers": [
    { "id": "r1", "model": "...", "persona": "builtin:security" },
    { "id": "r2", "model": "...", "persona": "builtin:logic" },
    { "id": "r3", "model": "...", "persona": "builtin:api-contract" },
    { "id": "r4", "model": "...", "persona": "builtin:general" }
  ]
}
```

### 외부 AI 규칙 파일

CodeAgora는 프로젝트 루트의 AI 규칙 파일을 자동으로 감지하여 리뷰 컨텍스트에 포함합니다:
- `.cursorrules`
- `CLAUDE.md`
- `copilot-instructions.md`

별도 설정이 필요 없습니다.

### 빌드 아티팩트 자동 제외

다음 패턴은 기본적으로 리뷰에서 제외됩니다:
- `dist/` 디렉토리
- 락 파일 (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`)
- 미니파이된 파일 (`*.min.js`, `*.min.css`)

### `.reviewignore`

리뷰에서 제외할 파일을 지정합니다. `.gitignore`와 같은 glob 문법:

```
dist/**
*.min.js
coverage/**
tests/fixtures/**
```

---

## 지원 프로바이더

### API 프로바이더 (15개)

| 프로바이더 | 모델 예시 | 비고 |
|-----------|----------|------|
| Groq | llama-3.3-70b, qwen3-32b, kimi-k2 | 무료 티어 |
| OpenAI | gpt-4o, gpt-4o-mini, o1 | |
| Anthropic | claude-sonnet-4, claude-haiku | |
| Google | gemini-2.0-flash, gemini-2.5-pro | |
| OpenRouter | 모든 모델 (라우팅) | |
| DeepSeek | deepseek-chat, deepseek-coder | |
| Mistral | mistral-large-latest | |
| Qwen | qwen-turbo, qwen-max | |
| xAI | grok-2 | |
| Together | llama, mixtral 등 | |
| Cerebras | llama-3.3-70b | |
| NVIDIA NIM | deepseek-r1 | |
| ZAI | zai-default | |
| GitHub Models | gpt-4o, llama, phi-4 | 무료 (PAT) |
| GitHub Copilot | gpt-4o | Copilot Pro |

### CLI 백엔드 (5개)

| 백엔드 | CLI | 용도 |
|--------|-----|------|
| claude | claude | Head 판정, 리뷰 |
| codex | codex | 리뷰어/서포터 |
| gemini | gemini | 리뷰어/서포터 |
| copilot | gh copilot | 리뷰어/서포터 |
| opencode | opencode | 리뷰어/서포터 |

---

## GitHub Actions

PR마다 자동으로 인라인 리뷰 코멘트와 commit status check를 받을 수 있습니다.

### 설정

1. 프로젝트에 설정 추가:
   ```bash
   npx codeagora init
   ```

2. 레포지토리 시크릿에 API 키 등록 (Settings > Secrets):
   ```
   GROQ_API_KEY=your_key_here
   ```

3. `.github/workflows/review.yml` 생성:
   ```yaml
   name: CodeAgora Review
   on:
     pull_request:
       types: [opened, synchronize, reopened]

   permissions:
     contents: read
     pull-requests: write
     statuses: write

   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0
         - uses: justn-hyeok/CodeAgora@v2
           with:
             github-token: ${{ secrets.GITHUB_TOKEN }}
           env:
             GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
   ```

PR마다 받는 것:
- 변경된 라인에 인라인 리뷰 코멘트
- verdict와 이슈 테이블이 포함된 요약 코멘트
- 머지를 차단할 수 있는 commit status check (pass/fail)

### Action 입력

| 입력 | 설명 | 기본값 |
|------|------|--------|
| `github-token` | 리뷰 게시용 GitHub 토큰 | (필수) |
| `config-path` | `.ca/config.json` 경로 | `.ca/config.json` |
| `fail-on-reject` | REJECT 시 exit 1 (required check로 머지 차단) | `true` |
| `max-diff-lines` | diff가 이 줄 수를 초과하면 스킵 (0 = 무제한) | `5000` |

### Action 출력

| 출력 | 설명 |
|------|------|
| `verdict` | `ACCEPT`, `REJECT`, `NEEDS_HUMAN` |
| `review-url` | 게시된 GitHub 리뷰 URL |
| `session-id` | CodeAgora 세션 ID |

### 리뷰 건너뛰기

PR에 `review:skip` 라벨을 추가하면 리뷰를 건너뜁니다.

---

## 디렉토리 구조

### `.ca/` 구조

```
.ca/
+-- config.json          <- git tracked (팀 공유)
+-- personas/            <- git tracked (팀 공유)
|   +-- strict.md
|   +-- pragmatic.md
|   +-- security-focused.md
+-- sessions/            <- gitignored (로컬 데이터)
|   +-- 2026-03-16/
|       +-- 001/
|           +-- reviews/        # L1 리뷰어 출력
|           +-- discussions/    # L2 토론 기록
|           +-- suggestions.md  # 제안 사항
|           +-- report.md       # 모더레이터 보고서
|           +-- result.md       # Head 최종 판결
+-- logs/                <- gitignored (로컬)
+-- model-quality.json   <- gitignored (학습 데이터)
```

API 키: `~/.config/codeagora/credentials` (홈 디렉토리, git 밖)

### 소스 구조

v2는 8개 패키지로 구성된 pnpm 모노레포입니다:

```
packages/
+-- shared/        # @codeagora/shared — 타입, 유틸, zod 스키마, 설정
+-- core/          # @codeagora/core — L0/L1/L2/L3 파이프라인, 세션 관리
+-- github/        # @codeagora/github — PR 리뷰 게시, SARIF, diff 파싱
+-- notifications/ # @codeagora/notifications — Discord/Slack 웹훅, 이벤트 스트림
+-- cli/           # @codeagora/cli — CLI 명령어, 포맷터, 옵션
+-- tui/           # @codeagora/tui — 인터랙티브 터미널 UI (실험적, ink + React)
+-- mcp/           # @codeagora/mcp — MCP 서버 (9개 도구)
+-- web/           # @codeagora/web — Hono.js REST API + React SPA 대시보드
                   #   총 249 테스트 파일, 3442+ 테스트
```

---

## MCP 서버

`@codeagora/mcp`은 CodeAgora 파이프라인 전체를 MCP 서버로 노출합니다. Claude Code, Cursor, Windsurf, VS Code와 호환됩니다.

**9개 도구:** `review_quick`, `review_full`, `review_pr`, `dry_run`, `explain`, `leaderboard`, `stats`, `config_get`, `config_set`

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["@codeagora/mcp"],
      "env": { "GROQ_API_KEY": "your_key_here" }
    }
  }
}
```

`review_quick`은 L1만 실행(토론 없음)하여 빠른 피드백을 제공합니다. `review_full`은 전체 L1→L2→L3 파이프라인을 실행합니다.

---

## 웹 대시보드

`@codeagora/web`은 로컬 웹 대시보드를 제공합니다 — Hono.js REST API 백엔드 + 8개 페이지의 React SPA:

- 어노테이션 diff 뷰어가 포함된 리뷰 결과
- 실시간 파이프라인 진행 (WebSocket)
- 모델 인텔리전스 (Thompson Sampling, 리더보드)
- 세션 히스토리 브라우저
- 비용 분석
- 토론/디베이트 뷰어
- 설정 관리 UI

```bash
# 대시보드 실행
agora dashboard

# 또는 독립 실행
npx @codeagora/web
```

`127.0.0.1`(루프백 전용)에 바인딩됩니다. CORS는 localhost 출처로만 제한됩니다.

---

## 개발

```bash
# 의존성 설치
pnpm install

# 모든 패키지 빌드
pnpm build:ws

# 모든 패키지 테스트
pnpm test:ws

# 특정 테스트 파일 실행
pnpm test -- l1-reviewer

# 모든 패키지 타입 체크
pnpm typecheck:ws

# 단일 패키지 빌드
pnpm --filter @codeagora/core build

# CLI 직접 실행 (빌드 불필요)
pnpm cli review path/to/diff.patch
```

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| 런타임 | Node.js + TypeScript (strict) |
| CLI 프레임워크 | commander |
| TUI | ink + React |
| LLM SDK | Vercel AI SDK (멀티 프로바이더) |
| 웹 API | Hono.js |
| MCP | @modelcontextprotocol/sdk |
| 검증 | zod |
| 설정 | yaml / json |
| 테스트 | vitest (249 파일, 3442+ 테스트) |
| 컴포넌트 테스트 | @testing-library/react |
| 빌드 | tsup |
| 프롬프트 / 위자드 | @clack/prompts |
| 스피너 / 색상 | ora, picocolors |
| GitHub API | @octokit/rest |

---

## 연구 배경

CodeAgora의 토론 아키텍처는 멀티 에이전트 추론 연구에 기반합니다:

- **Debate or Vote** (Du et al., 2023): 멀티 에이전트 토론은 단일 모델 응답보다 사실성과 추론 품질을 향상시킵니다.
- **Free-MAD** (Chen et al., 2024): 반순응(anti-conformity) 프롬프트가 집단사고를 방지하고 강한 근거에 기반한 소수 의견을 보존합니다.
- **이질적 앙상블**: 서로 다른 모델은 서로 다른 에러 프로파일을 가지므로, 함께 실행하면 커버리지가 향상되고 상관된 오탐이 줄어듭니다.

---

## 라이선스

MIT

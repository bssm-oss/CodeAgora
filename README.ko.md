# CodeAgora

**LLM들이 당신의 코드를 토론합니다**

[![Version](https://img.shields.io/npm/v/codeagora)](https://www.npmjs.com/package/codeagora)
![Tests](https://img.shields.io/badge/tests-1313%20passing-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

CodeAgora는 여러 LLM을 병렬로 실행하여 코드를 독립적으로 리뷰하고, 의견 충돌이 생기면 구조화된 토론을 거쳐 Head 에이전트가 최종 판결을 내리는 코드 리뷰 파이프라인입니다. 서로 다른 모델은 서로 다른 사각지대를 가지고 있어, 함께 실행하면 더 많은 이슈를 잡아내고 합의를 통해 노이즈를 걸러냅니다.

---

## 동작 방식

```
git diff | agora review

  L1  --- Reviewer A --+
        --- Reviewer B --+-- 병렬 독립 리뷰
        --- Reviewer C --+
                |
  L2  --- 토론 모더레이터
        --- 서포터 풀 + Devil's Advocate
        --- 이슈별 합의 투표
                |
  L3  --- Head Agent --> ACCEPT / REJECT / NEEDS_HUMAN
```

**L1 - 병렬 리뷰어**: 여러 LLM이 diff를 독립적으로 리뷰합니다. severity 기반 임계값에 따라 토론 대상이 결정됩니다 (`CRITICAL`은 바로 토론, `SUGGESTION`은 제안 파일로).

**L2 - 토론**: 서포터 풀과 Devil's Advocate가 여러 라운드에 걸쳐 논쟁하고, 모더레이터가 합의를 이끌어내거나 강제 판결합니다.

**L3 - Head 판결**: 이슈를 그룹화하고, 미확인 발견사항을 스캔한 뒤, 최종 `ACCEPT`, `REJECT`, `NEEDS_HUMAN` 결정을 내립니다.

---

## 빠른 시작

2분이면 됩니다.

**사전 요구사항**: Node.js 18+, pnpm

```bash
# 1. 클론 및 설치
git clone <repo-url> codeagora
cd codeagora
pnpm install

# 2. 빌드
pnpm build

# 3. CLI를 전역으로 링크 (또는 npx 사용)
npm link

# 4. 프로젝트에서 초기화
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

### `agora tui`

인터랙티브 터미널 UI를 실행합니다 - 리뷰 설정 위자드, 실시간 파이프라인 진행, 토론 뷰어, 결과 드릴다운.

```bash
agora tui
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
         - uses: justn-hyeok/CodeAgora@main
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

```
src/
+-- cli/           # CLI 명령어, 포맷터, 옵션, 에러 유틸
+-- tui/           # 인터랙티브 터미널 UI (ink + React)
+-- pipeline/      # 파이프라인 오케스트레이터, 진행 이미터
+-- l0/            # 모델 레지스트리, 품질 추적 (Thompson Sampling)
+-- l1/            # 병렬 리뷰어 실행, 프로바이더 레지스트리
+-- l2/            # 토론 모더레이터, 중복 제거, 임계값 로직
+-- l3/            # Head 판결, 이슈 그룹핑
+-- config/        # 설정 로드, 검증, 템플릿, 마이그레이션, 크레덴셜
+-- providers/     # 프로바이더 레지스트리, 환경 변수 매핑
+-- session/       # 세션 관리 및 저장
+-- github/        # GitHub Actions, PR 리뷰 게시, SARIF 출력
+-- types/         # 공유 TypeScript 타입 정의
+-- utils/         # 공유 유틸리티
+-- tests/         # 81 테스트 파일, 1313 테스트
```

---

## 개발

```bash
# 모든 테스트 실행
pnpm test

# 특정 테스트 파일 실행
pnpm test -- l1-reviewer

# 타입 체크
pnpm typecheck

# 빌드
pnpm build

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
| 검증 | zod |
| 설정 | yaml / json |
| 테스트 | vitest (81 파일, 1313 테스트) |
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

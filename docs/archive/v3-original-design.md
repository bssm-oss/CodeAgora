> **Note**: This document describes the original v3 design. For the current architecture (v2.2.0 with Pre-Analysis Layer, Hallucination Filter, Specialist Personas, and Suggestion Verification), see [ARCHITECTURE.md](ARCHITECTURE.md).

# CodeAgora v3 — Architecture Design Document

> Multi-Agent Debate Code Review System
> Last updated: 2026-02-16

---

## 1. 설계 철학

- **Claude Code 전용**: 독립 CLI가 아닌 Claude Code 스킬(`/agora:review`)로 실행. Claude Code 밖에서는 동작하지 않음.
- **Epic급 PR 타겟**: 대규모 PR에 최적화. 작은 PR 라이트 모드는 로드맵.
- **모델 유동 배정**: 리뷰어, 서포터, 중재자 모두 config에서 자유 변경. 단, 헤드는 Claude Code 고정.
- **GitHub-Like 토론**: 코드 snippet 사전 첨부, 근거 문서 기반 Discussion.

---

## 2. 아키텍처 Overview

```
┌─────────────────────────────────────────────────────┐
│  유저: /agora:review                                │
└──────────────┬──────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────┐
│  L3 헤드 (Claude Code, 고정)                        │
│  ① diff 전체 읽기 → 관련 파일 그루핑 + PR 요약 작성 │
└──────────────┬──────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────┐
│  L1 리뷰어 (저가 모델 5개, 병렬)                     │
│  ② 그룹별 독립 코드 리뷰                             │
│  ③ 이슈 발견 시 근거 문서(md) 작성                   │
└──────────────┬──────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────┐
│  L2 중재자 (config 설정, 권장: sonnet)               │
│  ④ 리뷰 5개 읽고 이슈 식별 + 그루핑                  │
│  ⑤ Discussion 등록 판단                              │
│  ⑥ 서포터와 함께 토론 진행                           │
│  ⑦ 마크다운 리포트 작성                              │
│                                                     │
│  서포터 (config 설정, 권장: Codex + Gemini)          │
│  - 리뷰어 근거 검증 (변호사/검사 역할)               │
│  - 합의 선언 시 이의제기권                           │
└──────────────┬──────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────┐
│  L3 헤드 (Claude Code)                              │
│  ⑧ 마크다운 리포트 읽고 최종 판단                    │
│  ⑨ 의문 시 토론 로그 원본 확인 / 인간에게 질문       │
│  ⑩ 코드 수정 직접 수행                              │
└─────────────────────────────────────────────────────┘
```

> 헤드(Claude Code)가 처음(diff 그루핑)과 끝(최종 판단 + 수정)을 모두 담당하여 전체 맥락이 끊기지 않는 **북엔드 구조**.

---

## 3. 각 레이어 상세

### 3.1 L1 — 리뷰어

**역할**: 코드에서 이슈를 최대한 많이 찾아내는 스크리닝 레이어.

**특징**:
- 저가/무료 모델 5개 병렬 실행
- 자유형 출력 (JSON 스키마 강제 없음)
- 이슈 발견 시 **근거 문서(md)** 작성 필수
- L2 토론에는 직접 참여하지 않음 (stateless 한계 → 문서로 대체)

**근거 문서 템플릿** (권장, 강제 아님):

```markdown
## Issue: [이슈 제목]

### 문제
[무엇이 문제인지]

### 근거
1. [구체적 근거 1]
2. [구체적 근거 2]
3. [구체적 근거 3]

### 심각도
[HARSHLY_CRITICAL / CRITICAL / WARNING / SUGGESTION] (See Severity Guide in reviewer prompt)

### 제안
[어떻게 수정하면 되는지]
```

**에러 핸들링**:
- CLI 실패 시 최대 2회 재시도
- 재시도 후에도 실패 → "기권" 판정
- 5개 중 4개 이상 기권 (70%+) → 전체 에러로 종료

---

### 3.2 L2 — 중재자 + 서포터

#### 중재자

**역할**: L2 전체 오케스트레이션.

**담당 업무**:
- 리뷰어 5개 결과 전체를 읽고 이슈 식별 + 그루핑
- 전담 파서 에이전트 없음 — 중재자가 자연어 수준에서 처리
- 토론 진행 중 중복 발견 시 "이거 아까 한 건데?" → 병합
- Discussion 등록 판단
- 토론 진행 및 합의 선언
- 최종 마크다운 리포트 작성 → 헤드에 전달

#### 서포터

**역할**: 리뷰어가 제기한 이슈에 대한 검증. 변호사/검사 역할.

**특징**:
- 독립 리뷰어가 아님 — 리뷰어 지적에 대해서만 찬반 논증
- 코드 전체 리뷰 X, Discussion에 첨부된 코드 snippet만 확인
- 새 이슈 발견은 역할 밖
- 합의 선언 시 **이의제기권** 보유
- Codex와 Gemini 권장 (성향 차이로 자연스러운 역할 분화)
- 역할 제시를 config에서 간단하게 설정 가능

---

### 3.3 L3 — 헤드

**역할**: 전체 프로세스의 시작과 끝. 최종 의사결정.

**고정**: Claude Code (config로 변경 불가)

**초반 (diff 그루핑)**:
- `git diff` 전체를 읽고 관련 파일끼리 그룹핑
- 각 그룹에 PR 요약 컨텍스트 첨부
- 리뷰어에게 그룹 단위로 배분

**후반 (최종 판단)**:
- 중재자가 작성한 마크다운 리포트 읽기
- 의문 시 `.ca/` 내 토론 로그 원본 확인
- 판단 불가 시 인간에게 질문
- 최종 판정 후 코드 수정 직접 수행

**미확인 큐 스캔**:
- 1명만 지적하여 Discussion 등록 안 된 이슈들
- 헤드가 마지막에 한 번 스캔: "이거 실제로 문제 아님?"

---

## 4. Discussion 규칙

### 4.1 등록 조건

**Severity 판단 기준: Impact × Reversibility 2축 매트릭스**

```
                   Reversible (git revert fixes)   Irreversible (data lost/leaked)
High Impact        ┌─────────────────────────┐     ┌─────────────────────────┐
(prod user harm)   │      CRITICAL           │     │   HARSHLY_CRITICAL      │
                   │  - API 500              │     │  - Data corruption      │
                   │  - Memory leak          │     │  - SQL injection        │
                   │  - Auth broken          │     │  - Secrets in repo      │
                   └─────────────────────────┘     └─────────────────────────┘

Low Impact         ┌─────────────────────────┐     ┌─────────────────────────┐
(no direct harm)   │      WARNING            │     │      WARNING            │
                   │  - Perf degradation     │     │  (rare case)            │
                   │  - Missing error check  │     │                         │
                   │  - A11y issues          │     │                         │
                   └─────────────────────────┘     └─────────────────────────┘
```

**Q1. Impact**: Does this cause direct harm to production users?
  - YES → High Impact (CRITICAL or HARSHLY_CRITICAL)
  - NO → Low Impact (WARNING or SUGGESTION)

**Q2. Reversibility**: Can harm be fully undone by `git revert` + redeploy?
  - YES → CRITICAL
  - NO → HARSHLY_CRITICAL

**Discussion 대상: CRITICAL, WARNING만. SUGGESTION은 토론 대상 아님.**

| Severity | 등록 조건 |
|---|---|
| HARSHLY_CRITICAL | 1명이라도 → 즉시 등록, 중재자 기각 불가, 무조건 헤드행 |
| CRITICAL | 1명 + 서포터 1명 동의 시 등록 |
| WARNING | 2명+ 리뷰어 동의 시 등록 |
| SUGGESTION | Discussion 미등록 → `suggestions.md`에 수집 |
| 1명만 지적 (CRITICAL/WARNING) | 미확인 큐 → 헤드 스캔 |

### 4.2 Discussion 컨텍스트

등록 시 포함되는 정보 (GitHub PR 리뷰처럼):
- 리뷰어 원문 (근거 문서)
- 해당 코드 snippet (±10줄)
- 파일 경로 + 라인 번호

### 4.3 토론 라운드

```
라운드 1: 리뷰어 근거 문서 기반 → 서포터 검증
         → 합의 도달? → 종료

라운드 2: 추가 논증
         → 합의 도달? → 종료

라운드 3: 마지막 기회
         → 합의 도달? → 종료
         → 안 되면 중재자 강제 판정
```

- 합의 도달 시 즉시 종료 (최소 1라운드)
- 최대 3라운드, 초과 시 중재자 강제 판정
- 무한루프 없음

### 4.4 합의 판정 프로세스

```
중재자: "합의된 것 같습니다. 결론: ___"
    ↓
서포터 A: "이의 없음" / "이의 있음 + 근거"
서포터 B: "이의 없음" / "이의 있음 + 근거"
    ↓
이의 없음 → 합의 확정
이의 있음 → 라운드 연장
```

### 4.5 HARSHLY_CRITICAL 안전장치

**판단 기준**:
- Q1 (Impact): 프로덕션 유저에게 직접적 피해? YES
- Q2 (Reversibility): git revert로 피해 완전 복구 가능? NO

**안전장치**:
- 중재자 기각 불가 — 1명이라도 HC 지적하면 무조건 헤드까지 올라감
- 헤드(Claude Code)가 최종 판단 — "실제 HC 맞나?" 재검증
- **의심 시 CRITICAL 원칙** — 불확실하면 낮은 심각도 선택

**이유**:
- HC false positive는 비싸다 — 헤드 직행이라 중재자+서포터 리소스 낭비
- HC false negative는 안전망 있음 — CRITICAL로 내려가도 서포터+중재자가 재검증
- 따라서 리뷰어는 확실할 때만 HC 선언, 의심스러우면 CRITICAL

### 4.6 SUGGESTION 처리

**SUGGESTION은 Discussion을 거치지 않는다.**

```
L1 리뷰어: SUGGESTION 발견 시 → suggestions.md에 추가
    ↓
L2 토론 진행 (CRITICAL/WARNING만)
    ↓
토론 종료 후
    ↓
중재자: suggestions.md 검토
    → 가치 있음 → 리포트에 포함
    → 노이즈 → 버림
    ↓
리포트 작성 → 헤드로
```

- 모든 에이전트가 `suggestions.md`에 기여 가능
- 토론 파이프라인에 부담 안 줌
- 완전히 버리는 것이 아니라 중재자가 마지막에 필터링
- 저장 위치: `.ca/sessions/{date}/{session}/suggestions.md`

---

## 5. Git Diff 전달 방식

**방식: 헤드 사전 그루핑 (방식 D)**

```
유저: /agora:review
    ↓
헤드(Claude Code): git diff 전체 읽음
    → "auth.ts + middleware.ts + user.ts = 인증 관련 묶음"
    → "components/ 변경 = UI 묶음"
    → "tests/ = 테스트 묶음"
    → 각 그룹에 간단한 PR 요약 첨부
    ↓
리뷰어 5개: 그룹별 병렬 리뷰
    (자기 그룹 diff + "이 PR은 전체적으로 인증 리팩토링임" 요약)
```

**장점**:
- 저가 모델은 전체 PR 이해 불필요, 자기 그룹에서 이슈만 찾으면 됨
- 파일 간 의존성은 그룹핑으로 해결
- 그룹 간 의존성은 헤드가 처음+마지막에 전체를 보므로 잡힘
- 시니어 개발자가 리뷰 분배하는 것과 동일한 패턴

---

## 6. 디렉토리 구조

```
.ca/
├── config.json
├── sessions/
│   └── 2026-02-16/
│       ├── 001/                              # 오늘 첫 번째 리뷰
│       │   ├── reviews/
│       │   │   ├── r1-kimi-k2.5.md
│       │   │   ├── r2-grok-fast.md
│       │   │   ├── r3-codex-mini.md
│       │   │   ├── r4-glm-4.7.md
│       │   │   └── r5-gemini-flash.md
│       │   ├── discussions/
│       │   │   ├── d001-sql-injection/
│       │   │   │   ├── round-1.md
│       │   │   │   ├── round-2.md
│       │   │   │   └── verdict.md
│       │   │   └── d002-accessibility/
│       │   │       ├── round-1.md
│       │   │       └── verdict.md
│       │   ├── unconfirmed/                  # 미확인 큐
│       │   │   └── u001-variable-naming.md
│       │   ├── suggestions.md                # SUGGESTION 수집 (토론 미대상)
│       │   ├── report.md                     # 중재자 최종 리포트
│       │   └── result.md                     # 헤드 최종 판정
│       └── 002/                              # 오늘 두 번째 리뷰
│           └── ...
└── logs/                                     # 원본 CLI 출력 (디버깅용)
    └── 2026-02-16/
        └── 001/
            ├── r1-kimi-k2.5.raw.log
            └── ...
```

---

## 7. Config 구조

```jsonc
{
  // 리뷰어 (L1) — 모델/백엔드/provider 자유 변경
  "reviewers": [
    { "id": "r1", "backend": "opencode", "provider": "kimi", "model": "kimi-k2.5" },
    { "id": "r2", "backend": "opencode", "provider": "grok", "model": "grok-fast" },
    { "id": "r3", "backend": "codex", "model": "codex-mini" },
    { "id": "r4", "backend": "opencode", "provider": "glm", "model": "glm-4.7" },
    { "id": "r5", "backend": "gemini", "model": "gemini-flash" }
  ],

  // 서포터 (L2) — 권장: Codex + Gemini (성향 차이 활용)
  "supporters": [
    { "id": "s1", "backend": "codex", "model": "o4-mini", "role": "검증자" },
    { "id": "s2", "backend": "gemini", "model": "gemini-2.5-pro", "role": "검증자" }
  ],

  // 중재자 (L2)
  "moderator": {
    "backend": "codex",
    "model": "claude-sonnet"
  },

  // 헤드 (L3) — Claude Code 고정, config 변경 불가
  // head는 config에 포함하지 않음

  // 토론 설정
  "discussion": {
    "maxRounds": 3,
    "registrationThreshold": {       // Severity 기반 동적 등록
      "HARSHLY_CRITICAL": 1,         // 1명 → 즉시 등록 + 헤드행
      "CRITICAL": 1,                 // 1명 + 서포터 1명 동의
      "WARNING": 2,                  // 2명+ 리뷰어 동의
      "SUGGESTION": null             // Discussion 미등록 → suggestions.md
    },
    "codeSnippetRange": 10           // ±N줄 코드 첨부
  },

  // 에러 핸들링
  "errorHandling": {
    "maxRetries": 2,
    "forfeitThreshold": 0.7        // 70%+ 기권 시 에러 종료
  }
}
```

---

## 8. 비용 시뮬레이션

**가정**: Epic급 PR, diff ~3000줄 (~15K 토큰)

### 단계별 비용

| 단계 | 모델 | 예상 비용 |
|---|---|---|
| L1 리뷰어 ×5 | 저가/무료 모델 | ~$0.01 (무료 모델 시 $0) |
| L2 중재자 | sonnet | ~$0.12 |
| L2 서포터 ×2 | o4-mini + gemini-pro | ~$0.04 |
| L2 합의 확인 | 서포터 ×2 | ~$0.02 |
| L3 헤드 (초반) | Claude Code | 구독 포함 |
| L3 헤드 (후반) | Claude Code | 구독 포함 |

### 시나리오별 총 비용

| 시나리오 | API 비용 |
|---|---|
| Best (토론 없음) | ~$0.15 |
| Normal (Discussion 2~3개, 1~2라운드) | ~$0.30 |
| Worst (Discussion 5개+, 3라운드씩) | ~$0.80 |

> L1 무료 모델 + L3 Claude Code 구독 활용 시, 실질 비용은 L2(중재자+서포터)에만 발생.
> Epic PR 1회에 $0.15 ~ $0.80 — 시니어 개발자 30분 인건비($25~$50) 대비 1/50 수준.

---

## 9. v2 → v3 주요 변경점

| 항목 | v2 | v3 |
|---|---|---|
| 아키텍처 | Flat (모든 리뷰어 동등) | 3계층 (리뷰어/중재자+서포터/헤드) |
| 토론 방식 | Stateless CLI끼리 3라운드 debate | 근거 문서 제출 + 서포터 검증 + 중재자 판정 |
| 그루핑 | 파서 에이전트 (JSON 정규화) | 파서 없음, 중재자가 자연어로 처리 |
| diff 전달 | 전체 diff 통째로 | 헤드가 사전 그루핑 후 배분 |
| 헤드 역할 | 마지막에 합성만 | 처음(그루핑) + 끝(판단+수정) 북엔드 |
| 파이프라인 | TypeScript CLI 제어 | Claude Code 스킬 제어 |
| 출력 | 터미널 or md | Claude Code 터미널 + `.ca/result.md` |
| voting 로직 | 75% Majority Gate (트리거③ 버그) | Severity 기반 동적 등록 threshold |
| SUGGESTION 처리 | 다른 이슈와 동등 취급 | Discussion 미대상, suggestions.md 수집 후 중재자 필터링 |

---

## 10. 로드맵

- [ ] v3 구현 (현재)
- [ ] Validation: 실측 데이터 수집 (CodeRabbit / 단일 LLM 비교)
- [ ] 커뮤니티 런칭 (GeekNews → Reddit → Hacker News)
- [ ] 작은 PR 라이트 모드
- [ ] GitHub Action / standalone CLI 지원
- [ ] 오픈소스 전환

---

## 11. 학술적 근거

- **Debate or Vote**: Majority Voting의 martingale 증명 → Discussion 등록 기준
- **Free-MAD**: Conformity 문제 → 리뷰어 독립 실행 (L1에서 서로 결과 공유 안 함)
- **Heterogeneous 모델 조합**: 다양한 관점 확보 → 이종 모델 5개 병렬
- **Productive Noise**: 의도적 다양성이 리뷰 품질을 높임

---

*Generated from CodeAgora v3 design session, 2026-02-16*
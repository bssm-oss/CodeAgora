---
name: config
description: View and validate CodeAgora configuration
prefix: agora
user_invocable: true
---

# CodeAgora Config

현재 CodeAgora 설정을 표시하고 검증합니다.

## Usage

- `/agora config` — 현재 설정 표시
- `/agora config validate` — 설정 유효성 검사

## Workflow

### Step 1: 설정 파일 읽기

`.ca/config.json` 파일을 읽습니다.

### Step 2: 포맷팅 출력

다음 형식으로 표시:

```
## CodeAgora Configuration

### Reviewers (N개 활성)
| ID | Backend | Model | Enabled | Timeout |
|----|---------|-------|---------|---------|

### Supporters (N개 풀)
| ID | Backend | Model | Role |
|----|---------|-------|------|

### Moderator
- Backend: (backend)
- Model: (model)

### Discussion Settings
- Max Rounds: (maxRounds)
- Thresholds: HC=(n), CRITICAL=(n), WARNING=(n)

### Error Handling
- Max Retries: (n)
- Forfeit Threshold: (n)%
```

### Step 3: 검증 (validate 옵션)

`validate` 인자가 있으면 추가로:
1. core CLI의 config 명령 실행: `node {PROJECT_ROOT}/src/dist/cli/index.js config`
2. 검증 결과 표시

## Error Handling

- `.ca/config.json`이 없으면: 설정 파일 없음 안내 + `npx codeagora init` 실행 안내
- JSON 파싱 실패: 문법 오류 위치 표시

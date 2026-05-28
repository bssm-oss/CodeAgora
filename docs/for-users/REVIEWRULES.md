# .reviewrules

프로젝트 루트에 `.reviewrules` (또는 `.reviewrules.yml`, `.reviewrules.yaml`) 파일을 만들면 정규식 기반 커스텀 룰을 LLM 리뷰와 함께 실행할 수 있습니다.

## 기본 형식

```yaml
rules:
  - id: no-todo
    pattern: "TODO:"
    severity: SUGGESTION
    message: Resolve TODO comments before merging

  - id: no-console-log
    pattern: "console\\.log\\("
    severity: WARNING
    message: Remove console.log before production
    suggestion: Use a structured logger instead

  - id: no-hardcoded-secret
    pattern: "(password|secret|token)\\s*=\\s*['\"][^'\"]{8,}"
    severity: CRITICAL
    message: Possible hardcoded secret detected
    suggestion: Use environment variables or a secrets manager
    filePatterns:
      - "**/*.ts"
      - "**/*.js"
```

## 필드

| 필드 | 필수 | 타입 | 설명 |
|------|------|------|------|
| `id` | O | string | 룰 고유 식별자 |
| `pattern` | O | string | 정규식 패턴 (추가된 줄에만 매칭) |
| `severity` | O | enum | `HARSHLY_CRITICAL`, `CRITICAL`, `WARNING`, `SUGGESTION` |
| `message` | O | string | 위반 설명 |
| `suggestion` | X | string | 수정 제안 |
| `filePatterns` | X | string[] | glob 패턴으로 대상 파일 제한 (`*`, `**` 지원) |

## 동작 방식

1. diff에서 **추가된 줄(`+`)만** 대상으로 패턴 매칭
2. 삭제된 줄은 무시
3. `filePatterns`가 있으면 해당 glob에 매칭되는 파일에서만 실행
4. 매칭된 결과는 LLM 리뷰어의 evidence와 **동일한 형태**로 병합
5. L2 토론과 L3 판결에 함께 반영

## severity 선택 가이드

| 레벨 | 언제 쓸까 | 예시 |
|------|----------|------|
| `HARSHLY_CRITICAL` | 절대 머지 불가 | 시크릿 하드코딩, SQL injection 패턴 |
| `CRITICAL` | 머지 전 수정 필수 | 에러 핸들링 누락, 위험한 API 호출 |
| `WARNING` | 수정 권장 | console.log, TODO, 미사용 import |
| `SUGGESTION` | 참고 | 스타일, 네이밍 컨벤션 |

## 예시: 보안 룰셋

```yaml
rules:
  - id: no-eval
    pattern: "\\beval\\s*\\("
    severity: CRITICAL
    message: eval() is a code injection risk
    suggestion: Use JSON.parse() or a sandboxed evaluator

  - id: no-innerhtml
    pattern: "\\.innerHTML\\s*="
    severity: CRITICAL
    message: Direct innerHTML assignment is an XSS vector
    suggestion: Use textContent or a DOM sanitizer

  - id: no-exec
    pattern: "\\bexec\\s*\\("
    severity: CRITICAL
    message: exec() allows shell injection — use execFile() or spawn()
    filePatterns:
      - "**/*.ts"
      - "**/*.js"

  - id: no-disable-eslint
    pattern: "eslint-disable"
    severity: WARNING
    message: Disabling eslint rules should be reviewed
```

## 예시: 프로젝트 컨벤션

```yaml
rules:
  - id: no-any-type
    pattern: ":\\s*any\\b"
    severity: WARNING
    message: Avoid using 'any' type — use proper typing
    filePatterns:
      - "src/**/*.ts"

  - id: no-magic-numbers
    pattern: "(?<!\\.)\\b[2-9]\\d{2,}\\b(?!\\s*(px|em|rem|ms|s|%))"
    severity: SUGGESTION
    message: Consider extracting magic number to a named constant

  - id: require-jsdoc-export
    pattern: "^export (function|const|class) "
    severity: SUGGESTION
    message: Exported symbols should have JSDoc documentation
    filePatterns:
      - "src/lib/**/*.ts"
```

## 주의사항

- 패턴은 JavaScript 정규식 문법 (`RegExp`)
- 잘못된 정규식은 경고 로그 후 스킵 (다른 룰은 계속 실행)
- `.reviewignore`에 의해 제외된 파일에는 룰도 적용되지 않음
- 룰 매칭 결과의 `source` 필드가 `"rule"`로 표시되어 LLM 리뷰와 구분 가능

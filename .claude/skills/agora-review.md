# CodeAgora V3 Multi-Agent Review

Multi-agent 코드 리뷰 파이프라인. 5개 LLM이 병렬로 리뷰 → 토론 → 최종 판결.

## Commands

- `review` — Run multi-agent code review on current git diff
- `config` — View and validate configuration
- `status` — Show recent review sessions

---

## review

### Step 1: Diff 확보

인자가 없으면:
1. `git diff --staged` 실행
2. staged changes가 없으면 `git diff HEAD~1` 실행
3. 그래도 비어있으면 사용자에게 diff 경로 요청

인자가 있으면 해당 파일을 diff로 사용.

### Step 2: Diff 저장

```bash
git diff --staged > /tmp/codeagora-review-$(date +%s).diff
```

### Step 3: 리뷰 실행

V3 core pipeline CLI 실행:
```bash
pnpm dev review <diff-path>
```

이 명령은 L0→L1→L2→L3 파이프라인을 실행합니다:
- L0: Thompson Sampling 기반 모델 선택
- L1: 5개 리뷰어 병렬 독립 리뷰
- L2: 모더레이터 토론 (최대 3라운드, 심각도 기반 임계값)
- L3: 최종 판결 (ACCEPT / REJECT / NEEDS_HUMAN)

### Step 4: 결과 읽기

`.ca/sessions/` 에서 최신 세션을 찾아 결과 파일을 읽습니다:
- `.ca/sessions/{date}/{id}/result.md` — 최종 판결
- `.ca/sessions/{date}/{id}/report.md` — 모더레이터 리포트
- `.ca/sessions/{date}/{id}/suggestions.md` — 제안 모음

### Step 5: 포맷팅 출력

```markdown
## CodeAgora Review Result

**Verdict:** ACCEPT / REJECT / NEEDS_HUMAN

### Critical Issues
(HARSHLY_CRITICAL / CRITICAL 이슈)

### Warnings
(WARNING 이슈)

### Suggestions
(SUGGESTION)

### Discussion Summary
(토론 요약)

**Session:** {date}/{id} | **Duration:** Xs
```

### Error Handling
- diff가 비어있으면: "리뷰할 변경사항이 없습니다"
- CLI 실패: stderr 내용 표시
- config 파일 없음: `.ca/config.json` 설정 안내

### Notes
- 리뷰에 1~3분 소요 (외부 LLM API 호출)
- `--dry-run` 옵션으로 설정만 확인 가능

---

## config

`.ca/config.json` 파일을 읽어 현재 설정을 표시합니다.

표시 항목:
- Reviewers (ID, backend, model, enabled, timeout)
- Supporters (pool, devil's advocate)
- Moderator (backend, model)
- Discussion settings (maxRounds, thresholds)
- Error handling (maxRetries, forfeitThreshold)

검증: `pnpm dev config`

---

## status

`.ca/sessions/` 디렉토리를 스캔하여 최근 세션을 표시합니다.

기본: 최근 5개 세션 요약 (date, id, status, duration, diff)
인자 있음: 특정 세션 상세 결과 (verdict + report + suggestions)

---

## MCP Tools

이 프로젝트에서 다음 MCP tools도 사용 가능합니다:
- `agora_run_review` — 프로그래밍적 리뷰 실행
- `agora_get_result` — 세션 결과 조회
- `agora_list_sessions` — 세션 목록

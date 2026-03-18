# 변경 이력

## 1.1.1-rc.1 (2026-03-19)

### 개선 사항
- **TUI 전면 개편** — lazygit 스타일 마스터-상세 패널로 8개 화면 전면 재작성
- **테마 시스템** — 중앙화된 색상, 유니코드 아이콘 (●/○/▸/✓/✗), 둥근 테두리
- **7개 공유 컴포넌트** — Panel, ScrollableList, TextInput, Toast, HelpOverlay, TabBar, DetailRow
- **Config 화면** — reviewers/supporters/moderator 전체 CRUD, ? 도움말 오버레이, Ctrl+e $EDITOR, 1-5 탭 단축키
- **ModelSelector** — provider/ 프리픽스 검색, API 키 상태 아이콘, 캐시 로딩, 반응형 높이
- **상태 검사** — API Keys 탭에서 단일 프로바이더 (h), 전체 검사 (t), 재시도 (r)
- **프로바이더 상태** — 프리셋의 missing key 경고, 푸터의 키 개수, 리뷰어 목록의 상태 아이콘
- **Results 화면** — 모든 이슈 표시 (상위 5개만 아님), 심각도 요약 바, 마스터-상세 레이아웃
- **파이프라인 진행률** — 리뷰어 개수 표시, 스테이지 아이콘 (●/◐/○), 취소 힌트
- **리뷰어 복제** — c 키로 선택된 리뷰어 복제
- **검증자 경고** — 리뷰어 개수, 서포터 풀 크기, 토론 라운드 권장사항

### 버그 수정
- 설정에 moderator/discussion/errorHandling 필드 누락 시 preset apply 크래시 수정
- delete+add 시 리뷰어 ID 충돌 수정 (이제 max suffix 전략 사용)
- API 키가 소독되지 않은 상태로 process.env에 저장되는 문제 수정
- toast 알림의 setTimeout 타이머 누수 수정
- 상태 검사 promise rejection이 UI를 프리징하는 문제 수정
- spawn 전 $EDITOR 경로 검증 안 하는 문제 수정
- null config type cast가 런타임 크래시를 초래할 수 있는 문제 수정
- 대량 상태 검사에서 프로바이더 ID를 잃어버리는 문제 수정

### 내부
- L0: 모델 선택 시 includeReasoning 제약 강제 적용
- 57개 신규 테스트 (1386→1443), provider-status, theme, shared components 포함
- 3개 탭 파일에서 DetailRow 공유 컴포넌트 추출

## 1.1.0 (2026-03-17)

### 새 기능
- **Strict/Pragmatic 리뷰 모드** — 모드별 프리셋으로 임계값과 페르소나 자동 설정
- **한국어 지원** — L2/L3 프롬프트 완전 한국어화, language 설정 (`en`/`ko`)
- **자동 승인** — 사소한 diff(주석, 빈 줄, 문서만 변경) 감지 시 LLM 파이프라인 생략
- **커스텀 규칙** — `.reviewrules` YAML로 정규식 기반 정적 패턴 검사, L1 결과에 병합
- **신뢰도 점수** — 리뷰어 합의율 기반 0–100점, L2 합의 결과로 보정
- **학습 루프** — 기각된 패턴을 `.ca/learned-patterns.json`에 저장, 자주 기각되는 패턴 자동 억제
- **`agora learn`** — `--from-pr <number>` CLI 명령으로 과거 리뷰에서 학습
- **GitHub 토론 개선** — 라운드별 상세 로그 + 합의 아이콘, 네이티브 코드 제안 블록
- **심각도 에스컬레이션** — 파일 경로 매칭 실패 시 CRITICAL로 승격
- **정량적 힌트** — L3 판결 프롬프트에 추가하여 판단 품질 향상
- **Strict 모드** — WARNING 3개 이상 시 NEEDS_HUMAN 트리거
- **Init 위자드 개선** — 모드/언어 선택, 모든 기본 템플릿에 head 설정 포함

### 버그 수정
- 종합 안정성 수정 — 서킷 브레이커, 중복 제거, lint 정리
- 데드 코드 정리 + TUI 수정
- 안정성 수정 Phase 2-3 (나머지 28건)

### 내부
- `action.yml`을 소스 빌드에서 `npm install`로 전환
- Strict 모드 프리셋에 security-focused 페르소나 포함

## 1.0.3 (2026-03-17)

### 버그 수정
- `init` 시 기본 페르소나 파일 자동 생성

### 문서
- 로고 추가 및 배지 색상 브랜드 통일

## 1.0.2 (2026-03-17)

### 버그 수정
- CI에서 Node 18 제거 (ESLint 10은 Node 20+ 필요)

### 문서
- README에 npm/npx 설치 방법 추가

## 1.0.1 (2026-03-17)

패치 릴리즈 — 버전 범프만 (기능 변경 없음).

## 1.0.0 (2026-03-17)

첫 안정 릴리즈. rc.1–rc.8의 모든 기능 통합.

### 새 기능
- **GitHub Actions 통합** — PR 인라인 리뷰 코멘트, commit status check, SARIF 출력
- **15개 API 프로바이더** — OpenAI, Anthropic, Google, Groq, DeepSeek, Qwen, Mistral, xAI, Together, Cerebras, NVIDIA NIM, ZAI, OpenRouter, GitHub Models, GitHub Copilot
- **5개 CLI 백엔드** — claude, codex, gemini, copilot, opencode
- **LLM 기반 Head 판결** — L3 Head 에이전트가 LLM으로 추론 품질 평가 (규칙 기반 fallback)
- **과반수 합의** — checkConsensus가 >50% agree/disagree 투표 처리
- **의미적 파일 그룹핑** — import 관계 기반 클러스터링
- **리뷰어 페르소나** — strict, pragmatic, security-focused 페르소나 파일
- **설정 가능한 청킹** — maxTokens를 config에서 설정 가능
- **NEEDS_HUMAN 처리** — 자동 리뷰어 요청 + 라벨 추가
- **SARIF 2.1.0 출력** — GitHub Code Scanning 호환
- **안전한 크레덴셜** — API 키를 ~/.config/codeagora/credentials에 저장
- **TUI 붙여넣기 지원** — 모든 텍스트 입력에서 클립보드 붙여넣기 동작
- **CLI --pr 플래그** — 커맨드라인에서 직접 GitHub PR 리뷰
- **병렬 청크 처리** — 대규모 diff를 위한 적응형 동시성

### 버그 수정
- dist 빌드 크래시 수정 (로케일 JSON 미번들)
- 토론 매칭 수정 (substring 대신 정확한 filePath:line 매칭)
- forfeit threshold division by zero 수정
- CLI 플래그 (--provider, --model, --timeout, --no-discussion) 무시되는 문제 수정
- GitHub Action multiline output 깨짐 수정
- parser "looks good" false negative 수정
- 인라인 코멘트 position 에러 시 summary-only fallback
- doctor 포맷 테스트에서 ANSI 코드 제거 (CI 호환)
- CI lint 실패하는 미사용 import 제거

## 1.0.0-rc.1 ~ rc.7

초기 개발 릴리즈. 자세한 내용은 git 히스토리를 참고하세요.

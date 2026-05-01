# 보안 정책

## 취약점 신고

보안 취약점을 발견하셨다면 책임감 있게 신고해주세요:

1. **공개 이슈를 열지 마세요**
2. 메인테이너에게 이메일을 보내거나 [GitHub Security Advisories](https://github.com/bssm-oss/CodeAgora/security/advisories/new)를 이용하세요
3. 재현 단계와 잠재적 영향을 포함해주세요

48시간 내에 응답하고 수정 작업을 진행합니다.

## API 키 안전

- API 키는 `~/.config/codeagora/credentials`에 저장됩니다 (프로젝트 디렉토리가 아닌 홈 디렉토리)
- 절대 API 키를 git에 커밋하지 마세요
- 프로젝트 루트의 `.env` 파일은 gitignore 처리됩니다
- `agora doctor`로 설정을 확인하세요

## 지원 버전

| 버전 | 지원 여부 |
|------|----------|
| 2.x  | 지원 |
| 1.x  | 미지원 |
| < 1.0 | 미지원 |

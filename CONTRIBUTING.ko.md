# CodeAgora 기여 가이드

기여에 관심을 가져주셔서 감사합니다!

## 시작하기

```bash
git clone https://github.com/justn-hyeok/CodeAgora.git
cd CodeAgora
pnpm install
pnpm build
pnpm test
```

## 개발

- `pnpm test` — 전체 테스트 실행
- `pnpm typecheck` — 타입 체크
- `pnpm lint` — 린트
- `pnpm build` — 빌드

## Pull Request

1. 레포를 포크하고 `main`에서 브랜치를 생성하세요
2. 새 기능에 대한 테스트를 추가하세요
3. 모든 테스트가 통과하는지 확인하세요 (`pnpm test`)
4. 타입 체크를 통과하는지 확인하세요 (`pnpm typecheck`)
5. 명확한 설명과 함께 PR을 열어주세요

## 커밋 컨벤션

- `feat:` 새 기능
- `fix:` 버그 수정
- `refactor:` 리팩토링
- `test:` 테스트 추가/수정
- `docs:` 문서 수정
- `chore:` 빌드/설정 관련

## 이슈 보고

[GitHub Issues](https://github.com/justn-hyeok/CodeAgora/issues)를 이용해주세요. 포함할 내용:
- 재현 단계
- 기대 동작 vs 실제 동작
- Node.js 버전 및 OS

## 행동 강령

[CODE_OF_CONDUCT.ko.md](CODE_OF_CONDUCT.ko.md)를 참고하세요.

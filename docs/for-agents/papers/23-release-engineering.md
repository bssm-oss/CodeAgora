# 릴리스 엔지니어링과 패키지 표면 재정의

## 초록 초안

본 논문은 CodeAgora v0.1.0-alpha.2 릴리스를 중심으로 monorepo CLI/MCP 프로젝트의 공개 패키지 표면 재정의와 릴리스 안정화 과정을 다룬다. legacy 2.x package surface를 `@codeagora/review`와 `@codeagora/mcp`로 재정의하고, SHA-pinned workflow, clean install smoke, production audit, tag recovery를 통해 배포 품질을 확보했다.

## 핵심 연구 질문

복잡한 monorepo CLI/MCP 프로젝트에서 공개 패키지 표면을 어떻게 안정적으로 재정의하고 배포할 수 있는가?

## 주장

릴리스 안정성은 build 성공만으로 보장되지 않으며, 실제 packed artifact를 clean environment에서 설치하고 실행하는 smoke test가 필요하다.

## 방법

- public package surface를 두 scoped package로 제한한다.
- release workflow action을 SHA pinning한다.
- npm pack 후 clean temp project에 설치한다.
- CLI와 MCP binary smoke를 수행한다.
- 실패한 tag-triggered release를 publish 전 실패로 분리하고 복구한다.

## 근거와 소스 앵커

- `docs/release-alpha2-paper.md`
- `.github/workflows/release.yml`
- `package.json`
- `packages/mcp/package.json`

## 실험 설계

- release failure taxonomy 작성.
- pack/install smoke가 잡는 오류 유형 분류.
- publish 전 실패와 publish 후 실패 복구 절차 비교.

## 타당성 위협

- 단일 release case이므로 일반화가 제한적이다.
- npm/GitHub Actions 정책 변경에 영향을 받을 수 있다.

## 작성 TODO

- v0.1.0-alpha.2 timeline 표 작성.
- 실패 run과 성공 run 비교.
- release checklist 작성.

## 확장 본문 초안

### 1. 서론

릴리스 엔지니어링은 소프트웨어 품질의 마지막 방어선이다. 특히 monorepo 기반 CLI/MCP 프로젝트는 build가 성공해도 실제 npm package가 정상 동작하지 않을 수 있다. CodeAgora v0.1.0-alpha.2 릴리스는 legacy 2.x package surface에서 scoped alpha package surface로 전환하면서, release workflow, package metadata, runtime dependencies, docs, smoke test를 함께 정렬한 사례다.

본 논문은 이 릴리스를 단순 배포 기록이 아니라 package surface 재정의와 release gate 설계 사례로 분석한다. 핵심 주장은 publish 전에 실제 packed artifact를 clean environment에 설치하고 실행하는 smoke test가 필요하다는 것이다.

### 2. 문제 배경

CodeAgora는 여러 workspace package를 갖는 monorepo다. 내부 package와 외부 public package가 혼재하면 사용자는 무엇을 설치해야 하는지 혼란스러워지고, release workflow는 의도하지 않은 package까지 publish할 수 있다. 또한 MCP package는 CLI/core 내부 모듈과 provider dependency를 사용하므로, build output이 성공해도 npm 설치 후 runtime dependency가 누락될 수 있다.

v0.1.0-alpha.2에서는 public surface를 `@codeagora/review`와 `@codeagora/mcp`로 제한하고, workspace package는 internal implementation으로 문서화했다. Release workflow는 두 package만 publish하도록 정리되었고, GitHub Actions는 SHA pinning으로 supply-chain 변동성을 줄였다.

### 3. 방법

릴리스 과정은 네 단계로 구성된다. 첫째, package metadata와 docs를 public surface에 맞춘다. 둘째, dependency audit와 runtime dependency 검증을 수행한다. 셋째, `npm pack`으로 실제 publish artifact를 만들고 clean temp project에 설치해 `agora --version`과 `codeagora-mcp --help`를 실행한다. 넷째, tag-triggered GitHub Actions workflow로 publish와 GitHub release를 수행한다.

초기 workflow run `25085355364`는 publish 이전 `pnpm test --no-file-parallelism` 단계에서 실패했다. 원인은 `src/tests/cli-init-ci.test.ts`가 이전 command인 `npx codeagora review`를 기대했기 때문이다. 테스트를 새 pinned command로 수정한 뒤, 사용자 승인 하에 `v0.1.0-alpha.2` tag를 수정 커밋으로 이동했고, workflow run `25085451982`가 성공했다.

### 4. 평가 계획

릴리스 논문의 평가는 failure taxonomy와 gate effectiveness를 중심으로 할 수 있다. Build-only gate, pack/install smoke gate, published package smoke gate를 비교해 각 gate가 잡을 수 있는 오류 유형을 분류한다. 또한 publish 전 실패와 publish 후 실패의 복구 비용을 비교한다.

### 5. 논의

Tag 이동은 일반적으로 조심해야 하는 작업이다. 본 사례에서는 첫 실패가 publish 이전에 발생했고, 동일 alpha version을 유지하려는 목적이 있었으며, 사용자 승인 하에 tag를 이동했다. 이 절차는 human-in-the-loop release governance의 필요성을 보여준다.

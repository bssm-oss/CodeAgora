# 인간-에이전트 협업 기반 릴리스 프로세스

## 초록 초안

본 논문은 CodeAgora v0.1.0-alpha.2 릴리스에서 관찰된 인간-에이전트 협업 과정을 사례로 분석한다. 에이전트는 변경 분석, 검증, commit 분할, workflow 감시, 실패 진단을 수행했고, 인간은 태그 이동 같은 irreversible 또는 policy-sensitive 결정에 승인자로 개입했다.

## 핵심 연구 질문

인간 의사결정과 에이전트 실행을 결합하면 릴리스 검증 및 복구를 어떻게 수행할 수 있는가?

## 주장

에이전트는 반복적 검증과 진단을 빠르게 수행할 수 있지만, tag movement, force update, release rerun 같은 운영 결정은 human-in-the-loop approval이 필요하다.

## 방법

- 에이전트가 release surface와 diff를 분석한다.
- 변경을 atomic commit으로 분할한다.
- workflow failure를 진단하고 test drift를 수정한다.
- 인간 승인 후 tag를 이동한다.
- 재실행 workflow와 published smoke를 검증한다.

## 근거와 소스 앵커

- `docs/release-alpha2-paper.md`
- v0.1.0-alpha.2 release process
- release workflow run `25085355364`와 `25085451982`

## 실험 설계

- 수동 릴리스 대비 진단 시간 비교.
- human approval point taxonomy 작성.
- agent-generated commit plan의 atomicity 평가.

## 타당성 위협

- 단일 사례 연구이므로 보편성을 주장하기 어렵다.
- 에이전트 성능은 도구와 권한 설정에 의존한다.

## 작성 TODO

- timeline reconstruction 작성.
- human decision point 정리.
- 실패 복구 playbook 추출.

## 확장 본문 초안

### 1. 서론

에이전트 기반 개발은 단순 코드 생성보다 넓은 작업을 포함한다. 실제 프로젝트에서 에이전트는 변경 범위 분석, 테스트 실행, release workflow 감시, 실패 원인 진단, commit 분할, 문서 작성까지 수행할 수 있다. 그러나 모든 결정을 자동화할 수는 없다. 특히 tag 이동, force update, publish rerun 같은 운영상 민감한 작업은 인간 승인과 책임 경계가 필요하다.

본 논문은 CodeAgora v0.1.0-alpha.2 릴리스 과정을 인간-에이전트 협업 사례로 분석한다. 에이전트는 반복적이고 검증 가능한 작업을 수행했고, 인간은 irreversible 또는 policy-sensitive decision point에서 승인자로 개입했다.

### 2. 문제 배경

릴리스 작업은 작은 실수의 비용이 크다. 잘못된 package를 publish하거나, 실패한 tag를 그대로 두거나, publish 후 version을 재사용하려 하면 복구가 어렵다. 에이전트는 빠르게 명령을 실행할 수 있지만, 그만큼 잘못된 명령도 빠르게 실행할 수 있다. 따라서 작업 권한과 의사결정 경계가 명확해야 한다.

이번 사례에서 에이전트는 release surface 문제를 분석하고, 15개 파일 변경을 6개 atomic commit으로 나눴으며, workflow run을 감시했다. 첫 release workflow가 실패하자 테스트 기대값 drift를 진단하고 수정했다. 그러나 tag를 이동해 같은 alpha version으로 재실행할지, 새 alpha.3로 갈지는 인간에게 질문했다.

### 3. 방법

협업 프로세스는 네 단계로 재구성할 수 있다. 첫째, 에이전트가 context gathering과 validation을 수행한다. 둘째, 변경을 atomic commit과 release tag로 구성한다. 셋째, CI/CD 결과를 감시하고 실패 시 root cause를 진단한다. 넷째, 복구 전략이 irreversible하거나 remote history에 영향을 주는 경우 인간에게 선택지를 제시하고 승인 후 실행한다.

이 과정에서 중요한 것은 에이전트의 보고가 검증 가능해야 한다는 점이다. 예를 들어 “workflow가 성공했다”는 말은 run id와 단계별 성공 상태로 뒷받침되어야 하고, “package가 publish됐다”는 말은 npm view와 실제 dlx smoke로 확인되어야 한다.

### 4. 평가 계획

이 주제는 단일 사례 연구에서 출발하지만, 향후 여러 릴리스 작업을 비교해 확장할 수 있다. 측정 지표로는 failure detection time, recovery time, human approval point count, agent-suggested plan adoption rate, post-release smoke success를 사용할 수 있다. 또한 수동 릴리스와 에이전트 보조 릴리스의 checklist coverage를 비교할 수 있다.

### 5. 논의

인간-에이전트 협업은 에이전트 자율성을 극대화하는 문제가 아니라, 실패 비용이 큰 결정에서 인간 판단을 적절히 배치하는 문제다. 본 사례는 에이전트가 release engineering을 상당 부분 수행할 수 있음을 보여주지만, tag movement와 publish policy 같은 결정에는 명시적 승인 절차가 필요함을 동시에 보여준다.

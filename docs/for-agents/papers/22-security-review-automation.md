# 보안 리뷰 자동화와 취약점 탐지

## 초록 초안

본 논문은 LLM 기반 코드 리뷰가 보안 취약점 탐지에서 갖는 가능성과 한계를 다룬다. CodeAgora는 security reviewer persona, SARIF mapping, severity calibration, evidence requirement를 결합하여 보안 finding을 자동화된 PR workflow 안으로 가져온다.

## 핵심 연구 질문

LLM 기반 코드 리뷰가 보안 취약점 탐지에서 어떤 강점과 한계를 갖는가?

## 주장

LLM은 보안 취약점 후보를 넓게 탐지할 수 있지만, severity와 exploitability 판단에는 evidence 기반 검증과 SARIF-compatible mapping이 필요하다.

## 방법

- security-focused reviewer prompt를 사용한다.
- finding을 severity와 category로 정규화한다.
- evidence requirement를 적용한다.
- SARIF output으로 GitHub security workflow와 연결한다.

## 근거와 소스 앵커

- `src/tests/github-sarif*`
- `src/tests/l1-reviewer*`
- `docs/for-agents/HALLUCINATION_FILTER_DESIGN.md`
- `docs/for-users/5_GITHUB_INTEGRATION.md`

## 실험 설계

- CWE 기반 benchmark 구성.
- severity misclassification rate 측정.
- evidence filter 적용 전후 security FP 비교.

## 타당성 위협

- 보안 ground truth labeling이 어렵다.
- LLM은 plausible exploit narrative를 생성할 수 있다.

## 작성 TODO

- CWE taxonomy mapping 작성.
- SARIF output 예시 추가.
- security-specific FP 사례 수집.

## 확장 본문 초안

### 1. 서론

보안 리뷰는 LLM 코드 리뷰의 중요한 응용 영역이지만, 동시에 false positive 비용이 큰 영역이다. LLM은 SQL injection, auth bypass, secret exposure, unsafe deserialization 같은 취약점 후보를 잘 떠올릴 수 있지만, 실제 exploitability와 코드 맥락을 과장할 위험도 있다. CodeAgora의 보안 리뷰 자동화는 security persona, severity calibration, evidence requirement, SARIF mapping을 결합해 이 문제를 다룬다.

본 논문은 보안 리뷰 자동화를 “취약점 후보 생성”과 “검증 가능한 보안 finding 생산”의 차이로 설명한다. 후보 생성은 LLM이 잘하는 영역이지만, CI에서 신뢰할 수 있는 결과가 되려면 evidence와 location, severity 근거가 필요하다.

### 2. 문제 배경

보안 finding은 일반 bug finding보다 더 강한 triage pressure를 만든다. CRITICAL이나 HIGH severity가 표시되면 개발자는 즉시 대응해야 한다. 따라서 evidence가 약한 보안 finding은 생산성을 크게 해칠 수 있다. 반대로 실제 취약점을 놓치는 false negative는 더 큰 위험을 초래한다.

CodeAgora는 보안 reviewer를 L1 역할 중 하나로 둘 수 있고, hallucination filter와 SARIF mapper를 통해 finding을 검증 가능한 형태로 변환한다. Severity calibration과 confidence trace는 보안 finding의 신뢰도를 조정하는 데 사용될 수 있다.

### 3. 방법

보안 리뷰 자동화는 먼저 security-focused prompt로 취약점 후보를 생성한다. 이후 parser가 finding을 category, severity, file, line, evidence로 정규화한다. Evidence filter는 해당 취약점 주장이 실제 diff와 연결되는지 확인한다. SARIF mapping은 rule id, level, location, message로 변환하여 GitHub code scanning ecosystem과 연결한다.

보안 finding은 CWE taxonomy와 연결될 수 있다. 예를 들어 SQL injection, XSS, path traversal, secret exposure 같은 범주는 서로 다른 evidence requirement를 갖는다. SQL injection은 user input과 query construction의 연결이 필요하고, secret exposure는 literal pattern과 file context가 중요하다.

### 4. 평가 계획

평가는 CWE별 precision/recall, severity misclassification, evidence filter 효과를 포함해야 한다. Synthetic security benchmark와 실제 historical vulnerability diff를 함께 사용할 수 있다. 또한 SARIF output이 GitHub UI에서 올바르게 표시되는지 integration test가 필요하다.

### 5. 논의

LLM 보안 리뷰는 human security review를 대체하기보다 후보 탐색과 triage 보조에 적합하다. 특히 exploitability 판단은 runtime context, deployment configuration, threat model을 필요로 하므로 자동 시스템은 한계를 명시해야 한다.

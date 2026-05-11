<!-- Parent: ./BETA2_TO_RC_QUALITY_PLAN.md -->

# Review Benchmark Repository Set

## Purpose

This document defines the benchmark repository set for measuring CodeAgora review
quality before RC. The goal is to evaluate realistic code review behavior across
frontend, backend, library, CLI, and mobile surfaces.

The benchmark should not become a large maintenance burden. The recommended
starting point is 12 repositories, each with realistic app structure, tests,
GitHub Actions CI, hidden defect scenarios, and false-positive traps.

## Repository Set

Recommended total set:

```txt
01. frontend-react-vite-flow
02. fullstack-nextjs-commerce
03. backend-springboot-kotlin-api
04. backend-express-api
05. library-typescript-utils
06. library-python-data-utils
07. library-kotlin-jvm-utils
08. cli-go-taskrunner
09. cli-rust-logscan
10. cli-typescript-devtool
11. mobile-flutter-expense
12. mobile-react-native-notes
```

Specialized scenarios should be distributed across these repositories instead of
becoming separate repositories:

| Area | Distribution |
| --- | --- |
| DB / Migration | Next.js, Spring Boot, Express |
| Security / Auth | Next.js, Spring Boot, Express |
| Async / Concurrency | Go CLI, Rust CLI, Express |
| Infra / CI | Common GitHub Actions across repos plus selected Docker files |
| Testing Quality | Defective or incomplete tests in every repo |

This keeps the set closer to a real code review landscape instead of a language
sample gallery.

## Common Repository Shape

Each repository should use this baseline structure:

```txt
repo-name/
  README.md
  BUGS.md
  BENCHMARK.md
  package/source files...
  tests/
  .github/workflows/ci.yml
```

`BUGS.md` is the answer key. It should identify scenario IDs, defect type,
expected severity, expected location, and the expected finding. It must not mark
exact source lines as "bug here".

Example:

```md
# BUGS

## BUG-FE-001
Type: logic
Severity: medium
Location: src/features/signup/SignupForm.tsx
Expected finding: Submit button can become enabled before file upload validation completes.
```

Source code may include subtle scenario markers, but not explicit defect labels:

```ts
// scenario: FE-001
```

Do not use comments such as `BUG HERE`, `intentional vulnerability`, or `for
benchmark`; those turn the benchmark into a prompt leak.

## Scenario Volume

Initial target:

```txt
12 repos x 10 real bugs = 120 real bugs
12 repos x 5 false-positive traps = 60 FP traps

Total scenarios = 180
```

This is heavy enough for alpha quality measurement without making maintenance
the benchmark itself.

## Repository Specifications

### 1. frontend-react-vite-flow

Stack: React, Vite, TypeScript, React Query, Zustand, React Hook Form, Vitest,
Testing Library.

Concept: student application workflow UI with multi-step forms, file upload,
draft saving, preview, admin review status, and a node/card editor with
undo/redo.

Core defects:

- FE-001: submit can become enabled before file upload validation finishes.
- FE-002: stale closure submits or fetches with an old `userId`.
- FE-003: application update does not invalidate the correct React Query key.
- FE-004: user-controlled preview content renders through `dangerouslySetInnerHTML`.
- FE-005: undo history stores object references instead of immutable snapshots.
- FE-006: double submit is possible before pending state locks the button.
- FE-007: file validation checks extension but not MIME type or size consistently.
- FE-008: form fields start uncontrolled and later become controlled.
- FE-009: failed optimistic update does not restore previous state.
- FE-010: errors are not connected to inputs with `aria-describedby`.

False-positive traps:

- fallback value for draft recovery is intentional.
- mock token exists only in test fixtures.
- React StrictMode double execution is handled intentionally.
- complex regex is safe because input length is capped first.
- compatibility field is required for older saved drafts.

### 2. fullstack-nextjs-commerce

Stack: Next.js App Router, TypeScript, Prisma, PostgreSQL, Zod, server actions
or route handlers, Vitest or Playwright.

Concept: commerce/order app with products, cart, coupons, checkout, order
history, and admin product management.

Core defects:

- NX-001: IDOR in order detail route.
- NX-002: unsafe caching can leak user-specific data.
- NX-003: concurrent coupon requests can double-apply.
- NX-004: order creation and stock decrement are not atomic.
- NX-005: login `redirectTo` is not validated.
- NX-006: server-only config is imported by a client component.
- NX-007: server trusts client-sent price.
- NX-008: cursor pagination uses `createdAt` only.
- NX-009: API returns unnecessary private user fields.
- NX-010: admin route lacks server-side role check.

False-positive traps:

- development-only loose CORS is gated by `NODE_ENV`.
- test fixture contains fake secret values.
- compatibility route is intentionally kept.
- broad catch exists only in a top-level error boundary.
- cache is safe for public product data.

### 3. backend-springboot-kotlin-api

Stack: Kotlin, Spring Boot, Spring Web, Spring Security, Spring Data JPA,
PostgreSQL, Flyway, JUnit 5, Testcontainers.

Concept: community API with posts, comments, users, roles, admin approval, file
metadata, and search.

Core defects:

- KT-001: nullable value is force-unwrapped with `!!`.
- KT-002: comment creation and counter update are not transactional.
- KT-003: post list triggers N+1 lazy loading.
- KT-004: migration adds a non-null column without default.
- KT-005: service path can update data without role check.
- KT-006: DTO mapping allows `role` or `isAdmin` mutation.
- KT-007: `LocalDateTime` stored or compared without UTC handling.
- KT-008: internal exception detail leaks in API response.
- KT-009: 1-based and 0-based pagination indexes are mixed.
- KT-010: weak password validation allows whitespace or repeated weak strings.

False-positive traps:

- broad exception mapper intentionally normalizes public API errors.
- nullable DB column is intentional for legacy imported rows.
- Testcontainers credentials are test-only.
- lazy loading is acceptable in one detail endpoint.
- deprecated compatibility DTO field is intentionally accepted.

### 4. backend-express-api

Stack: Node.js, Express, TypeScript, Zod, JWT, PostgreSQL or SQLite,
Vitest/Jest, Supertest.

Concept: content API with users, sessions, posts, downloads, search, and admin
moderation.

Core defects:

- EX-001: async route does not pass errors to Express error handling.
- EX-002: JWT verification omits issuer, audience, or algorithm expectations.
- EX-003: search query uses unsafe string concatenation.
- EX-004: expensive upload/body parsing runs before auth.
- EX-005: rate limiter uses a shared/static key.
- EX-006: filename is joined into a path without safe normalization.
- EX-007: credentials are allowed with overly broad CORS origin handling.
- EX-008: refresh tokens are not rotated or invalidated.
- EX-009: Zod schema and DB constraints disagree.
- EX-010: post update route does not verify ownership.

False-positive traps:

- local dev CORS is intentionally permissive only in development.
- fake JWT secret appears only in tests.
- public search endpoint intentionally does not require auth.
- broad catch exists at process boundary for clean shutdown.
- raw SQL is safe in one path because parameter binding is used.

### 5. library-typescript-utils

Stack: TypeScript, tsup, Vitest, pnpm.

Concept: utility library for deep merge, retry, dates, Result helpers, query
parsing, and JSON helpers.

Core defects:

- TSLIB-001: prototype pollution in `deepMerge`.
- TSLIB-002: retry executes one extra attempt.
- TSLIB-003: date parsing uses local timezone unexpectedly.
- TSLIB-004: non-null type can return `null` at runtime.
- TSLIB-005: query parser drops repeated keys.
- TSLIB-006: public API breaking change hidden in a minor-style update.
- TSLIB-007: `reduce` on empty input lacks initial value.
- TSLIB-008: package exports mismatch for ESM/CJS.
- TSLIB-009: Result wrapper loses original error cause.
- TSLIB-010: unsafe `JSON.parse` without fallback.

### 6. library-python-data-utils

Stack: Python 3.12+, pytest, ruff, mypy, optional pydantic.

Concept: data utility package for CSV/JSON loading, text normalization, event
ranking, caching, and report export.

Core defects:

- PYLIB-001: mutable default argument in cache/options.
- PYLIB-002: CSV formula injection in exported values.
- PYLIB-003: non-UTF-8 input fails due to fixed UTF-8 assumption.
- PYLIB-004: ranking tie-breaker missing for equal scores.
- PYLIB-005: naive and aware datetime comparison.
- PYLIB-006: path traversal in export filename.
- PYLIB-007: broad except silently drops invalid rows.
- PYLIB-008: float precision issue for points or money.
- PYLIB-009: generator is reused after exhaustion.
- PYLIB-010: validation gap between pydantic model and internal dict.

### 7. library-kotlin-jvm-utils

Stack: Kotlin, Gradle, JUnit 5, optional Kotest.

Concept: JVM utility library for validation, money/point calculation,
pagination, event condition matching, and retry/backoff.

Core defects:

- KLIB-001: point sum overflows `Int`.
- KLIB-002: `BigDecimal.equals` treats `1.0` and `1.00` differently.
- KLIB-003: non-null Kotlin type can receive null from Java interop.
- KLIB-004: validation regex can cause ReDoS.
- KLIB-005: exponential backoff overflows.
- KLIB-006: input collection is mutated instead of copied.
- KLIB-007: locale-sensitive lowercase bug.
- KLIB-008: date boundary inclusive/exclusive mistake.
- KLIB-009: Gradle publishing misses sources/javadoc artifacts.
- KLIB-010: tests repeat one fixture and miss edge cases.

### 8. cli-go-taskrunner

Stack: Go, Cobra, optional SQLite, Go test.

Concept: task runner CLI with global/project config, parallel execution, retry,
logs, timeout, and cancellation.

Core defects:

- GOCLI-001: worker goroutine leaks after context cancellation.
- GOCLI-002: multiple goroutines can close the same channel.
- GOCLI-003: shared map is accessed without mutex.
- GOCLI-004: SIGINT leaves child process running.
- GOCLI-005: project/global config precedence is reversed.
- GOCLI-006: secret config file is written as `0644`.
- GOCLI-007: retry reruns already completed tasks.
- GOCLI-008: tilde path expansion is missing.
- GOCLI-009: task name can inject into logs.
- GOCLI-010: timeout is not propagated to child process.

### 9. cli-rust-logscan

Stack: Rust, clap, serde, regex, optional tokio, optional criterion.

Concept: log scanning CLI with config parsing, include/exclude patterns, JSON
output, ignore rules, and streaming mode.

Core defects:

- RSCLI-001: malformed config causes `unwrap` panic.
- RSCLI-002: unbounded user regex can cause ReDoS.
- RSCLI-003: huge log file is read into memory at once.
- RSCLI-004: `map_err` loses error context.
- RSCLI-005: blocking file IO runs inside async runtime.
- RSCLI-006: invalid UTF-8 log file fails.
- RSCLI-007: ignore glob includes unintended parent directories.
- RSCLI-008: exit codes do not distinguish match/error/no match.
- RSCLI-009: CLI flag and config precedence is reversed.
- RSCLI-010: optimization helps small files but regresses large files.

### 10. cli-typescript-devtool

Stack: TypeScript, Commander or CAC, tsx, execa, fs-extra, Vitest.

Concept: developer preset manager CLI with apply, status, backup, undo, doctor,
dry-run, and package manager detection.

Core defects:

- TSCLI-001: dry-run still writes files.
- TSCLI-002: backup names collide due to low-resolution timestamp.
- TSCLI-003: Windows path separator bug.
- TSCLI-004: shell injection through `shell: true`.
- TSCLI-005: symlink traversal modifies files outside project.
- TSCLI-006: undo restores changed files but does not delete newly created files.
- TSCLI-007: config discovery walks too far upward.
- TSCLI-008: partial write leaves corrupted file instead of atomic write.
- TSCLI-009: package manager detection precedence is wrong.
- TSCLI-010: permission errors are swallowed or unclear.

### 11. mobile-flutter-expense

Stack: Flutter, Dart, Riverpod or Bloc, sqflite or shared_preferences,
flutter_test.

Concept: expense tracker with local storage, categories, monthly summaries, CSV
export, and offline-first behavior.

Core defects:

- FL-001: draft state is lost across lifecycle changes.
- FL-002: currency calculation uses `double`.
- FL-003: local DB migration is missing for existing users.
- FL-004: permission denial flow is incomplete.
- FL-005: timezone boundary groups expense under the wrong month.
- FL-006: async callback calls `setState` after dispose.
- FL-007: CSV formula injection in export.
- FL-008: offline sync conflict loses local changes.
- FL-009: amount input lacks accessibility semantics.
- FL-010: test DB schema differs from production schema.

### 12. mobile-react-native-notes

Stack: React Native, TypeScript, Expo, AsyncStorage or SQLite, React Navigation,
Jest.

Concept: note-taking app with tags, search, local storage, share integration,
and a lock screen.

Core defects:

- RN-001: older AsyncStorage save overwrites newer save.
- RN-002: deep link bypasses lock screen.
- RN-003: locked notes are stored in plaintext.
- RN-004: deleted notes remain in search index.
- RN-005: focus listener cleanup is missing.
- RN-006: Android back button handling is missing.
- RN-007: debounced search calls setState after unmount.
- RN-008: share template inserts unsanitized user input.
- RN-009: date sorting uses string order instead of timestamp.
- RN-010: fake timer tests pass but do not match real timer behavior.

## Defect Taxonomy

Quality reports should aggregate by defect type, not only by repository:

| Category | Examples |
| --- | --- |
| Security | XSS, SQL injection, IDOR, open redirect, weak JWT/session, path traversal, secret leakage, CORS, CSV injection, shell injection |
| Logic | off-by-one, wrong sorting, wrong precedence, stale cache, duplicate submit, wrong permission condition, boundary date bug |
| Async / Concurrency | race condition, goroutine leak, async setState after dispose, missing cancellation, retry idempotency, transaction missing |
| Data / DB | migration breakage, N+1 query, missing uniqueness, timezone mismatch, pagination cursor bug, validation mismatch |
| DX / Infra | CI permission too broad, `pull_request_target` misuse, Docker secret leak, cache key bug, package exports mismatch, dry-run side effect |
| Testing | false-confidence tests, missing edge cases, mock hides behavior, flaky async tests, snapshot overuse |

CodeAgora should look strongest on security, async/concurrency, and data
integrity. A system that only finds lint-like issues should not pass RC quality
review.

## False-Positive Traps

Each repository should include 3-5 false-positive traps. Common trap classes:

- intentional fallback values
- framework conventions that look suspicious out of context
- test-only fixtures with fake secrets or unsafe strings
- safe regex paths guarded by input length limits
- backwards compatibility code
- React StrictMode double-render handling
- broad catch at a CLI/process boundary
- local-only insecure development settings
- generated code that should be low priority

Precision must be measured. A review bot that flags everything is not useful.

## Benchmark Guide Template

Every benchmark repository should include this `BENCHMARK.md` shape:

```md
# Benchmark Guide

This repository is part of the CodeAgora review benchmark.

## Goals

Evaluate whether a code review system can:

1. Identify real defects.
2. Avoid false positives.
3. Provide file/line evidence.
4. Explain impact.
5. Assign reasonable severity.
6. Suggest useful fixes.
7. Handle cross-file reasoning.

## Scoring

### Recall

A bug is counted as found when the review identifies:
- the correct scenario,
- the affected location or flow,
- and the reason it is harmful.

### Precision

A finding is counted as false positive when:
- it reports acceptable code as a defect,
- ignores documented constraints,
- or flags test-only/local-only code as production risk.

### Severity

Expected severity levels:
- critical: auth bypass, secret leak, destructive data loss
- high: injection, IDOR, transaction/data integrity issue
- medium: race, stale cache, lifecycle bug, broken edge case
- low: accessibility, DX, minor compatibility issue

## Expected Output Shape

Each finding should include:
- title
- severity
- affected files
- evidence
- impact
- suggested fix
- confidence
```

## CodeAgora Evaluation Prompt

Use this prompt when running CodeAgora against generated benchmark repos:

```txt
Review this repository as a production code review.

Focus on:
1. Security vulnerabilities
2. Data integrity bugs
3. Authorization and ownership checks
4. Async/concurrency issues
5. Cache invalidation and stale state
6. DB migration and transaction risks
7. Edge cases not covered by tests
8. CI/CD or packaging risks
9. False positives: avoid flagging test-only, dev-only, or documented compatibility code

For each finding, provide:
- title
- severity: critical/high/medium/low
- confidence: high/medium/low
- affected files
- evidence from code
- why it matters
- minimal fix suggestion

Do not report style-only issues.
Do not report generic best practices without concrete evidence.
Do not flag test fixtures as production vulnerabilities.
Prefer fewer, high-evidence findings over many speculative findings.
```

## Generation Prompt Template

Use this template to generate each benchmark repository:

```txt
You are generating a benchmark repository for CodeAgora, an AI code review evaluation system.

Goal:
Create a realistic, runnable, intentionally imperfect software project.
The repository must look like a normal open-source project, not a toy benchmark.
It should include real application structure, tests, documentation, and CI.

Repository name:
{{REPO_NAME}}

Tech stack:
{{TECH_STACK}}

Project concept:
{{PROJECT_CONCEPT}}

Core features:
{{CORE_FEATURES}}

Intentional bug scenarios:
{{BUG_SCENARIOS}}

False-positive trap scenarios:
{{FP_TRAPS}}

Requirements:
1. Create a complete repository structure.
2. Include realistic source code, not placeholder-only files.
3. Include tests. Some tests may pass despite hidden bugs, because the benchmark should test review ability beyond test execution.
4. Include README.md with setup, usage, scripts, and architecture overview.
5. Include BUGS.md listing the hidden scenarios using scenario IDs, but do not mark exact lines as "bug".
6. Include BENCHMARK.md explaining how CodeAgora should be evaluated on this repo.
7. Include GitHub Actions CI.
8. Add comments only when they would naturally appear in production code.
9. Do not write comments like "this is buggy", "intentional vulnerability", or "for benchmark".
10. Make the bugs subtle but reviewable from code context.
11. Make at least some bugs require cross-file reasoning.
12. Include at least 3 false-positive traps where code looks suspicious but is actually acceptable due to surrounding constraints.
13. Keep the project small enough to review, but large enough to be realistic.
14. Prefer clear domain logic over random contrived code.
15. Use idiomatic patterns for the chosen stack.

Output:
- Full file tree
- Then each file with path and content
- Keep generated code self-contained
- Do not use external paid services
- Prefer local/mock implementations where needed
```

## Build Order

Do not generate all 12 repositories at once. Build the set in phases:

```txt
Phase 1: Core review demo
01. frontend-react-vite-flow
02. fullstack-nextjs-commerce
03. backend-express-api
04. cli-typescript-devtool

Phase 2: Language diversity
05. backend-springboot-kotlin-api
06. library-python-data-utils
07. cli-go-taskrunner
08. cli-rust-logscan

Phase 3: Coverage expansion
09. library-typescript-utils
10. library-kotlin-jvm-utils
11. mobile-flutter-expense
12. mobile-react-native-notes
```

Phase 1 is enough for a CodeAgora demo. Phase 2 makes it feel like a quality
benchmark. Phase 3 makes it a general-purpose code review evaluation set.

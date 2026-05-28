<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-05-29 -->

# docs/

## Purpose

Reference documentation for the CodeAgora multi-agent code review system. Docs are organized by audience:

| Directory | Purpose |
|---|---|
| `for-users/` | User-facing CLI, configuration, provider, GitHub integration, rules, FAQ, and troubleshooting docs. |
| `for-agents/` | Maintainer/agent-facing product, architecture, benchmark, research, quality, and readiness docs. |
| `archived/` | Dated plans, release notes, evidence snapshots, and superseded docs kept for historical reference. |

Use `README.md` as the docs index.

## Key Files

| File | Purpose | Audience |
|------|---------|----------|
| `README.md` | Top-level documentation index. | Everyone |
| `for-users/CLI_REFERENCE.md` | CLI commands and options. | Users, integrators |
| `for-users/CONFIGURATION.md` | Configuration reference. | Users, operators |
| `for-users/5_GITHUB_INTEGRATION.md` | GitHub Action, PR comments, and SARIF integration. | Users, DevOps |
| `for-agents/1_PRD.md` | Product Requirements Document. Problem definition, solution hypothesis, target users, success metrics, v1 scope. | Product owners, architects, agents |
| `for-agents/ARCHITECTURE.md` | Current system architecture — pipeline, component boundaries, data flow, tech stack. | Engineers, architects, agents |
| `for-agents/AGENT_CONTRACT.md` | Reviewer/agent output and behavior contract. | Agents, implementers |
| `for-agents/BENCHMARK_MEASUREMENT_PLAN.md` | Benchmark metrics, model families, role analysis, and run stages. | Maintainers, agents |
| `for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md` | Multi-Agent Debate research and improvement roadmap. | Architects, research engineers |
| `for-agents/PRODUCTION_READINESS_ROADMAP.md` | Production-readiness gates for CLI, GitHub Actions, MCP, benchmarks, security, packaging, and desktop sequencing. | Maintainers, release owners |

## Archive

Superseded or dated documents live in `archived/` and are not normative unless a current doc explicitly references them.

The previous archive directory was folded into `archived/archive/`, including old design notes, audits, session reports, and archived Korean translations.

## For AI Agents

### Working In This Directory

**When exploring CodeAgora:**
1. Start with `README.md` to choose the audience path.
2. Read `for-agents/1_PRD.md` to understand the core problem and hypothesis.
3. Read `for-agents/ARCHITECTURE.md` for the current architecture.
4. Reference `for-users/5_GITHUB_INTEGRATION.md` when working on GitHub-related features.
5. Consult `for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md` when optimizing debate logic or discussion protocols.
6. Consult `for-agents/BENCHMARK_MEASUREMENT_PLAN.md` when planning benchmark/model comparison work.

**When implementing features:**
- Current source-of-truth docs should live in `for-users/` or `for-agents/`.
- If implementation details conflict with current design docs, flag the discrepancy rather than deviating silently.
- Use section numbers with `§` notation when referencing specific design decisions in commit messages and PR descriptions.

**When making architectural decisions:**
- Check `for-agents/ARCHITECTURE.md` first.
- Cross-reference `for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md` for debate-related decisions.
- Cross-reference `for-agents/PRODUCTION_READINESS_ROADMAP.md` for release gate implications.

**Documents are living but versioned:**
- `for-agents/1_PRD.md` is stable unless product scope changes.
- `for-agents/ARCHITECTURE.md` is the source of truth for current pipeline design.
- `for-users/5_GITHUB_INTEGRATION.md` is a complete spec; changes require care.
- `for-agents/MAD_RESEARCH_AND_IMPROVEMENTS.md` is evergreen research; implementation status is tracked in git history and release docs.
- Dated plans, old evidence, and superseded docs belong in `archived/`.

**When adding new documentation:**
- Pick an audience first: `for-users/`, `for-agents/`, or `archived/`.
- Create focused documents with one purpose per file.
- Link to parent documents using a `<!-- Parent: ... -->` header when useful.
- Include a table of contents for documents over ~1000 lines.
- Update `README.md` when adding a new top-level source-of-truth doc.

<!-- MANUAL: -->

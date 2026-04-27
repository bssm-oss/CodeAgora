<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# docs/

## Purpose

Reference documentation for the CodeAgora multi-agent code review system. This directory contains:

- **Product strategy & vision**: Why the system exists, target users, core hypothesis
- **Architecture & design**: 10-stage pipeline (CLI → L0 → Pre-Analysis → L1 → Rules & Learning → Hallucination Filter → Confidence → Suggestion Verification → L2 → L3), component boundaries, data flow
- **Integration patterns**: GitHub Actions, PR comments, SARIF output, MCP adapters
- **Research & roadmap**: Academic foundations (MAD), implementation phases, feature catalog
- **Implementation guides**: Complete specifications for developers building new features

These documents guide both strategic decision-making and tactical implementation work.

## Key Files

| File | Purpose | Audience |
|------|---------|----------|
| `1_PRD.md` | Product Requirements Document. Problem definition, solution hypothesis, target users, success metrics, v1 scope. Answered: "Why are we building this?" | Product owners, architects, team leads |
| `ARCHITECTURE.md` | Current system architecture — 10-stage pipeline, component boundaries, data flow, tech stack. | Engineers, architects |
| `5_GITHUB_INTEGRATION.md` | GitHub Integration Specification. PR comment formatting, GitHub Actions workflow, SARIF output structure, UX mockups, API mappings. | Backend/CLI engineers, DevOps |
| `MAD_RESEARCH_AND_IMPROVEMENTS.md` | Multi-Agent Debate Research & Roadmap. Academic foundations (NeurIPS 2025, X-MAS, Free-MAD), current state analysis, improvement roadmap. | Architects, research engineers |

## Archive

Superseded documents are in `archive/` — kept for historical reference, not normative:

| File | Notes |
|------|-------|
| `archive/v3-original-design.md` | Original v3 architecture design; superseded by `ARCHITECTURE.md` |
| `archive/web-ux-expansion-roadmap.md` | Sprint 7 web/UX roadmap; features since implemented |
| `archive/audit-2026-04.md` | April 2026 documentation audit; findings applied, now stale |
| `archive/session-report-2026-04-01.md` | Development session log for 2026-04-01 |

## For AI Agents

### Working In This Directory

**When exploring CodeAgora:**
1. Start with `1_PRD.md` to understand the core problem and hypothesis
2. Read `ARCHITECTURE.md` for the current architecture
3. Reference `5_GITHUB_INTEGRATION.md` when working on GitHub-related features
4. Consult `MAD_RESEARCH_AND_IMPROVEMENTS.md` when optimizing debate logic or discussion protocols

**When implementing features:**
- These documents are normative. They define the design contract.
- If implementation details conflict with the design, flag the discrepancy to the team rather than deviating silently.
- Use section numbers (e.g., "3_V3_DESIGN.md § 2.4") to reference specific design decisions in commit messages and PR descriptions.

**When making architectural decisions:**
- Check `ARCHITECTURE.md` first (current 10-stage pipeline)
- Cross-reference `MAD_RESEARCH_AND_IMPROVEMENTS.md § 3` for debate-related decisions

**Documents are living but versioned:**
- `1_PRD.md` is stable (v1 scope is fixed)
- `ARCHITECTURE.md` is the source of truth for current pipeline design
- `5_GITHUB_INTEGRATION.md` is a complete spec; changes require team sign-off
- `MAD_RESEARCH_AND_IMPROVEMENTS.md` is evergreen research; implementation status is tracked in git history and CHANGELOG.md
- Superseded documents live in `archive/` — do not reference them as normative

**When adding new documentation:**
- Create focused documents (one purpose per file)
- Use consistent naming: `{number}_{purpose}.md` for strategic docs, or `{purpose}.md` for tactical guides
- Link to parent documents (use `<!-- Parent: ... -->` header)
- Include a "Table of Contents" section for documents >1000 lines
- Reference section numbers using `§` notation to enable stable linking

<!-- MANUAL: -->

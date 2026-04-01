<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# docs/

## Purpose

Reference documentation for the CodeAgora multi-agent code review system. This directory contains:

- **Product strategy & vision**: Why the system exists, target users, core hypothesis
- **Architecture & design**: 6-stage pipeline (Pre-Analysis, L0-L3, Hallucination Filter), component boundaries, data flow
- **Integration patterns**: GitHub Actions, PR comments, SARIF output, webhooks
- **Research & roadmap**: Academic foundations (MAD), implementation phases, feature catalog
- **Implementation guides**: Complete specifications for developers building new features

These documents guide both strategic decision-making and tactical implementation work.

## Key Files

| File | Purpose | Audience |
|------|---------|----------|
| `1_PRD.md` | Product Requirements Document. Problem definition, solution hypothesis, target users, success metrics, v1 scope. Answered: "Why are we building this?" | Product owners, architects, team leads |
| `3_V3_DESIGN.md` | Original v3 Architecture Design Document. For current architecture (v2.2.0 with Pre-Analysis, Hallucination Filter, Specialist Personas), see [ARCHITECTURE.md](ARCHITECTURE.md). | Engineers, architects |
| `5_GITHUB_INTEGRATION.md` | GitHub Integration Specification. PR comment formatting, GitHub Actions workflow, SARIF output structure, UX mockups, API mappings. Answered: "How does the system integrate with GitHub?" | Backend/CLI engineers, DevOps |
| `6_WEB_AND_UX_EXPANSION.md` | Web & UX Roadmap. Feature phases (GitHub enrichment → Discord → meme mode → web dashboard → MCP), difficulty matrix, execution order, TypeScript limitations. Answered: "What's next after v3 CLI?" | Product owners, frontend engineers, planners |
| `MAD_RESEARCH_AND_IMPROVEMENTS.md` | Multi-Agent Debate Research & Roadmap. Academic foundations (NeurIPS 2025, X-MAS, Free-MAD), current state analysis, 4 priority improvements (87.5% debate cost reduction), implementation roadmap. Answered: "How do we improve debate quality?" | Architects, research engineers |

## For AI Agents

### Working In This Directory

**When exploring CodeAgora:**
1. Start with `1_PRD.md` to understand the core problem and hypothesis
2. Read `3_V3_DESIGN.md` for the current architecture
3. Reference `5_GITHUB_INTEGRATION.md` when working on GitHub-related features
4. Check `6_WEB_AND_UX_EXPANSION.md` for the feature roadmap and next phases
5. Consult `MAD_RESEARCH_AND_IMPROVEMENTS.md` when optimizing debate logic or discussion protocols

**When implementing features:**
- These documents are normative. They define the design contract.
- If implementation details conflict with the design, flag the discrepancy to the team rather than deviating silently.
- Use section numbers (e.g., "3_V3_DESIGN.md § 2.4") to reference specific design decisions in commit messages and PR descriptions.

**When making architectural decisions:**
- Check `3_V3_DESIGN.md § 2` (Architecture Overview) first
- Cross-reference `MAD_RESEARCH_AND_IMPROVEMENTS.md § 3` for debate-related decisions
- Consult `6_WEB_AND_UX_EXPANSION.md § 6` (Dependency Graph) if your work affects roadmap sequencing

**Documents are living but versioned:**
- `1_PRD.md` is stable (v1 scope is fixed; post-v1 changes go in roadmap documents)
- `3_V3_DESIGN.md` describes the original v3 design; for current architecture see `ARCHITECTURE.md`
- `5_GITHUB_INTEGRATION.md` is a complete spec; changes require team sign-off
- `6_WEB_AND_UX_EXPANSION.md` is the source of truth for feature phases and priorities
- `MAD_RESEARCH_AND_IMPROVEMENTS.md` is evergreen research; implementation status tracked separately in IMPLEMENT_PLAN.md (root docs/)

**When adding new documentation:**
- Create focused documents (one purpose per file)
- Use consistent naming: `{number}_{purpose}.md` for strategic docs, or `{purpose}.md` for tactical guides
- Link to parent documents (use `<!-- Parent: ... -->` header)
- Include a "Table of Contents" section for documents >1000 lines
- Reference section numbers using `§` notation to enable stable linking

<!-- MANUAL: -->

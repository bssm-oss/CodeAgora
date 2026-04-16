import { classifyDiffFiles } from "./analyzers/diff-classifier.js";
import { runTscDiagnostics } from "./analyzers/tsc-runner.js";
import { analyzeChangeImpact } from "./analyzers/impact-analyzer.js";
import { loadExternalRules } from "./analyzers/external-rules.js";
import { matchPathRules } from "./analyzers/path-rules.js";
function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}
async function analyzeBeforeReview(repoPath, diffContent, config, changedFiles) {
  const TIMEOUT_MS = 15e3;
  const pathRules = config.reviewContext?.pathRules ?? [];
  const [
    classificationsResult,
    tscResult,
    impactResult,
    rulesResult,
    pathNotesResult
  ] = await Promise.allSettled([
    // 1. Diff classification (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(classifyDiffFiles(diffContent)),
      TIMEOUT_MS,
      /* @__PURE__ */ new Map()
    ),
    // 2. TypeScript diagnostics
    withTimeout(
      runTscDiagnostics(repoPath, changedFiles),
      TIMEOUT_MS,
      []
    ),
    // 3. Impact analysis
    withTimeout(
      analyzeChangeImpact(repoPath, diffContent),
      TIMEOUT_MS,
      /* @__PURE__ */ new Map()
    ),
    // 4. External rules
    withTimeout(
      loadExternalRules(repoPath),
      TIMEOUT_MS,
      []
    ),
    // 5. Path rules (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(matchPathRules(changedFiles, pathRules)),
      TIMEOUT_MS,
      []
    )
  ]);
  return {
    fileClassifications: classificationsResult.status === "fulfilled" ? classificationsResult.value : /* @__PURE__ */ new Map(),
    tscDiagnostics: tscResult.status === "fulfilled" ? tscResult.value : [],
    impactAnalysis: impactResult.status === "fulfilled" ? impactResult.value : /* @__PURE__ */ new Map(),
    externalRules: rulesResult.status === "fulfilled" ? rulesResult.value : [],
    pathRuleNotes: pathNotesResult.status === "fulfilled" ? pathNotesResult.value : []
  };
}
function buildEnrichedSection(ctx) {
  const sections = [];
  if (ctx.fileClassifications.size > 0) {
    const lines = [...ctx.fileClassifications.entries()].map(([file, cls]) => `- [${cls.toUpperCase()}] ${file}`).join("\n");
    sections.push(`## File Classifications
${lines}`);
  }
  if (ctx.tscDiagnostics.length > 0) {
    const lines = ctx.tscDiagnostics.slice(0, 20).map((d) => `- ${d.file}:${d.line} \u2014 error TS${d.code}: ${d.message}`).join("\n");
    sections.push(`## TypeScript Diagnostics
${lines}`);
  }
  if (ctx.impactAnalysis.size > 0) {
    const lines = [...ctx.impactAnalysis.entries()].map(([, entry]) => {
      const level = entry.callerCount >= 10 ? "HIGH" : entry.callerCount >= 5 ? "MEDIUM" : "LOW";
      return `- ${entry.symbol}() \u2014 ${entry.callerCount} importers (${level})`;
    }).join("\n");
    sections.push(`## Change Impact
${lines}`);
  }
  if (ctx.externalRules.length > 0) {
    sections.push(`## Project Rules
${ctx.externalRules.join("\n\n")}`);
  }
  if (ctx.pathRuleNotes.length > 0) {
    const lines = ctx.pathRuleNotes.map((n) => `- ${n}`).join("\n");
    sections.push(`## Path-Specific Review Notes
${lines}`);
  }
  if (sections.length === 0) return "";
  return `
## Pre-Analysis Context

${sections.join("\n\n")}
`;
}
export {
  analyzeBeforeReview,
  buildEnrichedSection
};

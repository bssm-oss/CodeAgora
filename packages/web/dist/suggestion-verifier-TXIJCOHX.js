import "./chunk-MCKGQKYU.js";

// ../core/src/pipeline/suggestion-verifier.ts
import { access } from "fs/promises";
import path from "path";
function extractCodeBlock(suggestion) {
  const match = /```[\w]*\n([\s\S]*?)```/.exec(suggestion);
  return match?.[1]?.trim() ?? null;
}
async function verifySingle(code, hasTypeScript) {
  if (!hasTypeScript) {
    return { status: "skipped", error: "typescript not available" };
  }
  try {
    const ts = await import("./typescript-Z53JHS5G.js");
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: true,
        noEmit: true,
        // Allow imports without resolution — we only check syntax/basic types
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        // Suppress import-related errors since we lack project context
        noResolve: true
      },
      reportDiagnostics: true
    });
    const errors = (result.diagnostics ?? []).filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );
    if (errors.length > 0) {
      const messages = errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("; ");
      return { status: "failed", error: messages };
    }
    return { status: "passed" };
  } catch {
    return { status: "failed", error: "Transpilation failed" };
  }
}
async function isTypeScriptAvailable() {
  try {
    await import("./typescript-Z53JHS5G.js");
    return true;
  } catch {
    return false;
  }
}
async function verifySuggestions(repoPath, evidenceDocs) {
  const candidates = evidenceDocs.filter(
    (doc) => (doc.severity === "CRITICAL" || doc.severity === "HARSHLY_CRITICAL") && doc.suggestion && /```[\w]*\n/.test(doc.suggestion)
  );
  if (candidates.length === 0) return;
  const tsconfigPath = path.join(repoPath, "tsconfig.json");
  const hasTsConfig = await access(tsconfigPath).then(() => true).catch(() => false);
  if (!hasTsConfig) {
    for (const doc of candidates) {
      doc.suggestionVerified = "skipped";
    }
    return;
  }
  const hasTS = await isTypeScriptAvailable();
  for (const doc of candidates) {
    const code = extractCodeBlock(doc.suggestion);
    if (!code) {
      doc.suggestionVerified = "skipped";
      continue;
    }
    const result = await verifySingle(code, hasTS);
    doc.suggestionVerified = result.status;
    if (result.status === "failed") {
      doc.confidence = Math.round((doc.confidence ?? 50) * 0.5);
    }
  }
}
export {
  extractCodeBlock,
  verifySuggestions
};

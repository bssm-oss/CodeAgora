import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { SeveritySchema } from "../types/core.js";
const DismissedPatternSchema = z.object({
  pattern: z.string(),
  severity: SeveritySchema,
  dismissCount: z.number().int().positive(),
  lastDismissed: z.string(),
  // ISO date
  action: z.enum(["downgrade", "suppress"])
});
const LearnedPatternsSchema = z.object({
  version: z.literal(1),
  dismissedPatterns: z.array(DismissedPatternSchema)
});
async function loadLearnedPatterns(projectRoot) {
  const filePath = path.join(projectRoot, ".ca", "learned-patterns.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return LearnedPatternsSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}
async function saveLearnedPatterns(projectRoot, data) {
  const filePath = path.join(projectRoot, ".ca", "learned-patterns.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
function mergePatterns(existing, incoming) {
  const merged = [...existing];
  for (const inc of incoming) {
    const idx = merged.findIndex((p) => p.pattern === inc.pattern);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        dismissCount: merged[idx].dismissCount + inc.dismissCount,
        lastDismissed: inc.lastDismissed
      };
    } else {
      merged.push(inc);
    }
  }
  return merged;
}
export {
  DismissedPatternSchema,
  LearnedPatternsSchema,
  loadLearnedPatterns,
  mergePatterns,
  saveLearnedPatterns
};

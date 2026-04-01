import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";
import { ReviewRulesSchema } from "./types.js";
const CANDIDATE_FILENAMES = [".reviewrules", ".reviewrules.yml", ".reviewrules.yaml"];
async function loadReviewRules(projectRoot) {
  let rawContent = null;
  for (const filename of CANDIDATE_FILENAMES) {
    const filePath = path.join(projectRoot, filename);
    try {
      rawContent = await fs.readFile(filePath, "utf-8");
      break;
    } catch {
    }
  }
  if (rawContent === null) {
    return null;
  }
  let parsed;
  try {
    parsed = parseYaml(rawContent);
  } catch (err) {
    throw new Error(
      `Failed to parse .reviewrules file: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const result = ReviewRulesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid .reviewrules schema: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  const compiled = [];
  for (const rule of result.data.rules) {
    let regex;
    try {
      regex = new RegExp(rule.pattern);
    } catch (err) {
      console.warn(
        `[reviewrules] Skipping rule "${rule.id}": invalid regex pattern "${rule.pattern}" \u2014 ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    compiled.push({ ...rule, regex });
  }
  return compiled;
}
export {
  loadReviewRules
};

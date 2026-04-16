import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";
import { validateConfig } from "../types/config.js";
import { readJson, CA_ROOT } from "@codeagora/shared/utils/fs.js";
async function loadConfigFrom(baseDir) {
  const jsonPath = path.join(baseDir, CA_ROOT, "config.json");
  const yamlPath = path.join(baseDir, CA_ROOT, "config.yaml");
  const ymlPath = path.join(baseDir, CA_ROOT, "config.yml");
  const [jsonExists, yamlExists, ymlExists] = await Promise.all([
    fileExists(jsonPath),
    fileExists(yamlPath),
    fileExists(ymlPath)
  ]);
  const yamlFilePath = yamlExists ? yamlPath : ymlExists ? ymlPath : null;
  if (jsonExists) {
    if (yamlFilePath) {
      console.warn(
        `Both config.json and ${path.basename(yamlFilePath)} found in ${path.join(baseDir, CA_ROOT)}. config.json takes precedence; config.yaml is ignored.`
      );
    }
    const data = await readJson(jsonPath);
    return validateConfig(data);
  }
  if (yamlFilePath) {
    return loadYamlConfig(yamlFilePath);
  }
  throw new Error(
    `Config file not found. Run \`agora init\` to create one.`
  );
}
async function loadConfig() {
  return loadConfigFrom(process.cwd());
}
function buildDefaultConfig(provider = "groq") {
  return validateConfig({
    mode: "pragmatic",
    reviewers: {
      count: 3,
      constraints: { minFamilies: 1 }
    },
    discussion: { maxRounds: 2 },
    head: { provider, model: "auto", backend: "api", enabled: true },
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 }
  });
}
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadYamlConfig(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  let parsed;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML parse error in ${filePath}: ${msg}`);
  }
  return validateConfig(parsed);
}
function validateConfigData(data) {
  return validateConfig(data);
}
function isStaticReviewer(entry) {
  return !("auto" in entry && entry.auto === true);
}
function getEnabledReviewers(config) {
  if (!Array.isArray(config.reviewers)) {
    return (config.reviewers.static ?? []).filter(
      (r) => isStaticReviewer(r) && r.enabled
    );
  }
  return config.reviewers.filter(
    (r) => isStaticReviewer(r) && r.enabled
  );
}
function getEnabledReviewerEntries(config) {
  if (!Array.isArray(config.reviewers)) {
    return expandDeclarativeReviewers(config.reviewers).filter((r) => r.enabled);
  }
  return config.reviewers.filter((r) => r.enabled);
}
function getEnabledSupporters(config) {
  return config.supporters.pool.filter((s) => s.enabled);
}
function getDevilsAdvocate(config) {
  return config.supporters.devilsAdvocate.enabled ? config.supporters.devilsAdvocate : null;
}
function checkMinReviewers(config, minRequired = 3) {
  const enabled = getEnabledReviewers(config);
  if (enabled.length < minRequired) {
    return {
      valid: false,
      message: `Insufficient reviewers: ${enabled.length} enabled, ${minRequired} required`
    };
  }
  return { valid: true };
}
function isDeclarativeReviewers(reviewers) {
  return !Array.isArray(reviewers) && typeof reviewers === "object" && "count" in reviewers;
}
function expandDeclarativeReviewers(decl) {
  const entries = [];
  const staticReviewers = (decl.static ?? []).slice(0, decl.count);
  entries.push(...staticReviewers);
  const remaining = decl.count - staticReviewers.length;
  for (let i = 0; i < remaining; i++) {
    entries.push({
      id: `auto-${i + 1}`,
      auto: true,
      enabled: true
    });
  }
  return entries;
}
function normalizeConfig(config) {
  if (isDeclarativeReviewers(config.reviewers)) {
    return {
      ...config,
      reviewers: expandDeclarativeReviewers(config.reviewers)
    };
  }
  return config;
}
export {
  buildDefaultConfig,
  checkMinReviewers,
  expandDeclarativeReviewers,
  getDevilsAdvocate,
  getEnabledReviewerEntries,
  getEnabledReviewers,
  getEnabledSupporters,
  isDeclarativeReviewers,
  loadConfig,
  loadConfigFrom,
  normalizeConfig,
  validateConfigData
};

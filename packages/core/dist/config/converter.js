import { parse as yamlParse, stringify as yamlStringify } from "yaml";
function jsonToYaml(jsonContent) {
  const warnings = [];
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${msg}`);
  }
  const yamlBody = yamlStringify(parsed, { lineWidth: 120 });
  const content = `# CodeAgora Configuration
# Generated from JSON

${yamlBody}`;
  return { content, format: "yaml", warnings };
}
function yamlToJson(yamlContent) {
  const warnings = [];
  let parsed;
  try {
    parsed = yamlParse(yamlContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML parse error: ${msg}`);
  }
  const content = JSON.stringify(parsed, null, 2);
  return { content, format: "json", warnings };
}
function configToYaml(config) {
  const body = yamlStringify(config, { lineWidth: 120 });
  return `# CodeAgora Configuration
# Edit this file to configure your review pipeline.

${body}`;
}
export {
  configToYaml,
  jsonToYaml,
  yamlToJson
};

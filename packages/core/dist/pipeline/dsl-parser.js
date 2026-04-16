import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
const VALID_STAGE_TYPES = [
  "parallel-reviewers",
  "discussion",
  "head-verdict",
  "custom"
];
const VALID_ERROR_ACTIONS = ["skip", "retry", "abort"];
function parsePipelineDsl(yamlContent) {
  const errors = [];
  let raw;
  try {
    raw = parseYaml(yamlContent);
  } catch (e) {
    return {
      success: false,
      errors: [`YAML parse error: ${e instanceof Error ? e.message : String(e)}`]
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      success: false,
      errors: ["Pipeline definition must be a YAML object"]
    };
  }
  const obj = raw;
  if (!obj["name"] || typeof obj["name"] !== "string") {
    errors.push("Missing required field: name");
  }
  if (!obj["version"] || typeof obj["version"] !== "string") {
    errors.push("Missing required field: version");
  }
  if (!Array.isArray(obj["stages"])) {
    errors.push("Missing required field: stages (must be an array)");
  } else if (obj["stages"].length === 0) {
    errors.push("stages must not be empty");
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  const stages = obj["stages"];
  const seenNames = /* @__PURE__ */ new Set();
  const validatedStages = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (stage === null || typeof stage !== "object" || Array.isArray(stage)) {
      errors.push(`Stage[${i}]: must be an object`);
      continue;
    }
    const s = stage;
    const stageErrors = [];
    if (!s["name"] || typeof s["name"] !== "string") {
      stageErrors.push(`Stage[${i}]: missing required field 'name'`);
    } else if (seenNames.has(s["name"])) {
      stageErrors.push(`Duplicate stage name: '${s["name"]}'`);
    } else {
      seenNames.add(s["name"]);
    }
    if (!s["type"] || typeof s["type"] !== "string") {
      stageErrors.push(`Stage[${i}]: missing required field 'type'`);
    } else if (!VALID_STAGE_TYPES.includes(s["type"])) {
      stageErrors.push(
        `Stage[${i}]: invalid type '${s["type"]}'. Must be one of: ${VALID_STAGE_TYPES.join(", ")}`
      );
    }
    if (s["onError"] !== void 0) {
      if (!VALID_ERROR_ACTIONS.includes(s["onError"])) {
        stageErrors.push(
          `Stage[${i}]: invalid onError '${s["onError"]}'. Must be one of: ${VALID_ERROR_ACTIONS.join(", ")}`
        );
      }
    }
    if (s["retries"] !== void 0) {
      const r = s["retries"];
      if (typeof r !== "number" || !Number.isInteger(r) || r < 1) {
        stageErrors.push(`Stage[${i}]: retries must be a positive integer`);
      }
    }
    if (s["config"] !== void 0) {
      if (typeof s["config"] !== "object" || Array.isArray(s["config"]) || s["config"] === null) {
        stageErrors.push(`Stage[${i}]: config must be an object`);
      }
    }
    if (s["skipIf"] !== void 0 && typeof s["skipIf"] !== "string") {
      stageErrors.push(`Stage[${i}]: skipIf must be a string`);
    }
    errors.push(...stageErrors);
    if (stageErrors.length === 0) {
      validatedStages.push({
        name: s["name"],
        type: s["type"],
        ...s["config"] !== void 0 && { config: s["config"] },
        ...s["onError"] !== void 0 && { onError: s["onError"] },
        ...s["retries"] !== void 0 && { retries: s["retries"] },
        ...s["skipIf"] !== void 0 && { skipIf: s["skipIf"] }
      });
    }
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return {
    success: true,
    definition: {
      name: obj["name"],
      version: obj["version"],
      stages: validatedStages
    },
    errors: []
  };
}
function serializePipelineDsl(definition) {
  return stringifyYaml(definition);
}
function getDefaultPipelineDefinition() {
  return {
    name: "default",
    version: "1.0",
    stages: [
      { name: "review", type: "parallel-reviewers" },
      { name: "moderate", type: "discussion" },
      { name: "verdict", type: "head-verdict" }
    ]
  };
}
export {
  getDefaultPipelineDefinition,
  parsePipelineDsl,
  serializePipelineDsl
};

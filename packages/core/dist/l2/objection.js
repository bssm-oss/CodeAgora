import { executeBackend } from "../l1/backend.js";
async function checkForObjections(consensusDeclaration, supporterConfigs, previousRounds) {
  const objections = [];
  const results = await Promise.allSettled(
    supporterConfigs.map(
      (config) => executeSupporterObjectionCheck(config, consensusDeclaration, previousRounds)
    )
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.hasObjection) {
      objections.push({
        supporterId: result.value.supporterId,
        reasoning: result.value.reasoning
      });
    }
  }
  return {
    hasObjections: objections.length > 0,
    objections
  };
}
async function executeSupporterObjectionCheck(config, consensusDeclaration, previousRounds) {
  const prompt = buildObjectionPrompt(consensusDeclaration, previousRounds);
  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    prompt,
    timeout: config.timeout ?? 60,
    temperature: config.temperature
  });
  const hasObjection = parseObjectionResponse(response);
  return {
    supporterId: config.id,
    hasObjection,
    reasoning: response.trim()
  };
}
function buildObjectionPrompt(consensusDeclaration, previousRounds) {
  return `The moderator has declared consensus:

"${consensusDeclaration}"

Previous discussion rounds:
${previousRounds.map(
    (r, i) => `Round ${i + 1}:
${r.supporterResponses.map((s) => `- ${s.supporterId}: ${s.stance}
  ${s.response.substring(0, 200)}`).join("\n")}`
  ).join("\n\n")}

As a supporter, do you OBJECT to this consensus?
- If you object, explain why (new evidence, flawed reasoning, etc.)
- If you agree, say "NO OBJECTION"

Your response:`;
}
const CONSENT_PATTERNS = [/no objection/i, /i accept/i, /i agree/i, /agree with/i, /concur/i, /support the/i];
function parseObjectionResponse(response) {
  if (CONSENT_PATTERNS.some((p) => p.test(response))) return false;
  return !response.toLowerCase().includes("don't object");
}
function handleObjections(objections) {
  if (!objections.hasObjections) {
    return {
      shouldExtend: false,
      extensionReason: ""
    };
  }
  const reasons = objections.objections.map((o) => `${o.supporterId}: ${o.reasoning}`);
  return {
    shouldExtend: true,
    extensionReason: `Objections raised by ${objections.objections.length} supporter(s):
${reasons.join("\n")}`
  };
}
export {
  checkForObjections,
  handleObjections
};

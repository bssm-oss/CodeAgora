import { generateText } from "ai";
import { getModel } from "./provider-registry.js";
async function executeViaAISDK(input) {
  const { model, provider, prompt, systemPrompt, userPrompt, timeout, signal, temperature } = input;
  if (!provider) {
    throw new Error("API backend requires provider parameter");
  }
  const languageModel = getModel(provider, model);
  const abortSignal = signal ?? AbortSignal.timeout(timeout * 1e3);
  const { text } = await generateText({
    model: languageModel,
    // Use split system/user messages when available (better instruction following +
    // prompt injection defense). Fall back to combined prompt for callers that only
    // provide a single string (e.g. custom prompt paths, CLI passthrough).
    ...systemPrompt !== void 0 ? { system: systemPrompt, prompt: userPrompt ?? prompt } : { prompt },
    abortSignal,
    ...temperature !== void 0 && { temperature }
  });
  return text;
}
export {
  executeViaAISDK
};

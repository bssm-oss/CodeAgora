import "./chunk-MCKGQKYU.js";

// ../core/src/l1/api-backend.ts
import { generateText } from "ai";

// ../core/src/l1/provider-registry.ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createFireworks } from "@ai-sdk/fireworks";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createBaseten } from "@ai-sdk/baseten";
function toProviderInstance(provider) {
  return provider;
}
var PROVIDER_FACTORIES = {
  "nvidia-nim": {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "nvidia-nim",
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey
    })),
    apiKeyEnvVar: "NVIDIA_API_KEY"
  },
  groq: {
    create: (apiKey) => toProviderInstance(createGroq({ apiKey })),
    apiKeyEnvVar: "GROQ_API_KEY"
  },
  openrouter: {
    create: (apiKey) => toProviderInstance(createOpenRouter({ apiKey })),
    apiKeyEnvVar: "OPENROUTER_API_KEY"
  },
  google: {
    create: (apiKey) => toProviderInstance(createGoogleGenerativeAI({ apiKey })),
    apiKeyEnvVar: "GOOGLE_API_KEY"
  },
  mistral: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "mistral",
      baseURL: "https://api.mistral.ai/v1",
      apiKey
    })),
    apiKeyEnvVar: "MISTRAL_API_KEY"
  },
  cerebras: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "cerebras",
      baseURL: "https://api.cerebras.ai/v1",
      apiKey
    })),
    apiKeyEnvVar: "CEREBRAS_API_KEY"
  },
  together: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "together",
      baseURL: "https://api.together.xyz/v1",
      apiKey
    })),
    apiKeyEnvVar: "TOGETHER_API_KEY"
  },
  xai: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "xai",
      baseURL: "https://api.x.ai/v1",
      apiKey
    })),
    apiKeyEnvVar: "XAI_API_KEY"
  },
  openai: {
    create: (apiKey) => toProviderInstance(createOpenAI({ apiKey })),
    apiKeyEnvVar: "OPENAI_API_KEY"
  },
  anthropic: {
    create: (apiKey) => toProviderInstance(createAnthropic({ apiKey })),
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
  },
  deepseek: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "deepseek",
      baseURL: "https://api.deepseek.com/v1",
      apiKey
    })),
    apiKeyEnvVar: "DEEPSEEK_API_KEY"
  },
  qwen: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "qwen",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey
    })),
    apiKeyEnvVar: "QWEN_API_KEY"
  },
  zai: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "zai",
      baseURL: "https://api.zai.chat/v1",
      apiKey
    })),
    apiKeyEnvVar: "ZAI_API_KEY"
  },
  "github-models": {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "github-models",
      baseURL: "https://models.inference.ai.azure.com",
      apiKey
    })),
    apiKeyEnvVar: "GITHUB_TOKEN"
  },
  "github-copilot": {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "github-copilot",
      baseURL: "https://api.githubcopilot.com",
      apiKey
    })),
    apiKeyEnvVar: "GITHUB_COPILOT_TOKEN"
  },
  fireworks: {
    create: (apiKey) => toProviderInstance(createFireworks({ apiKey })),
    apiKeyEnvVar: "FIREWORKS_API_KEY"
  },
  cohere: {
    create: (apiKey) => toProviderInstance(createCohere({ apiKey })),
    apiKeyEnvVar: "COHERE_API_KEY"
  },
  deepinfra: {
    create: (apiKey) => toProviderInstance(createDeepInfra({ apiKey })),
    apiKeyEnvVar: "DEEPINFRA_API_KEY"
  },
  moonshot: {
    create: (apiKey) => toProviderInstance(createMoonshotAI({ apiKey })),
    apiKeyEnvVar: "MOONSHOT_API_KEY"
  },
  perplexity: {
    create: (apiKey) => toProviderInstance(createPerplexity({ apiKey })),
    apiKeyEnvVar: "PERPLEXITY_API_KEY"
  },
  huggingface: {
    create: (apiKey) => toProviderInstance(createHuggingFace({ apiKey })),
    apiKeyEnvVar: "HUGGINGFACE_API_KEY"
  },
  baseten: {
    create: (apiKey) => toProviderInstance(createBaseten({ apiKey })),
    apiKeyEnvVar: "BASETEN_API_KEY"
  },
  siliconflow: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "siliconflow",
      baseURL: "https://api.siliconflow.cn/v1",
      apiKey
    })),
    apiKeyEnvVar: "SILICONFLOW_API_KEY"
  },
  novita: {
    create: (apiKey) => toProviderInstance(createOpenAICompatible({
      name: "novita",
      baseURL: "https://api.novita.ai/v3/openai",
      apiKey
    })),
    apiKeyEnvVar: "NOVITA_API_KEY"
  }
};
var providerCache = /* @__PURE__ */ new Map();
function getModel(providerName, modelId) {
  const provider = getOrCreateProvider(providerName);
  return provider(modelId);
}
function getOrCreateProvider(providerName) {
  const cached = providerCache.get(providerName);
  if (cached) return cached;
  const config = PROVIDER_FACTORIES[providerName];
  if (!config) {
    throw new Error(
      `Unknown API provider: '${providerName}'. Supported: ${Object.keys(PROVIDER_FACTORIES).join(", ")}`
    );
  }
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `API key not found for provider '${providerName}'. Set ${config.apiKeyEnvVar} environment variable.
  export ${config.apiKeyEnvVar}=your_key_here`
    );
  }
  const provider = config.create(apiKey);
  providerCache.set(providerName, provider);
  return provider;
}

// ../core/src/l1/api-backend.ts
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

import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
function createBuiltinProviderPlugin(name, apiKeyEnvVar, factory) {
  return {
    name,
    version: "1.0.0",
    type: "provider",
    apiKeyEnvVar,
    createProvider: factory,
    isAvailable: () => !!process.env[apiKeyEnvVar]
  };
}
function getBuiltinProviderPlugins() {
  return [
    createBuiltinProviderPlugin("groq", "GROQ_API_KEY", (apiKey) => {
      const { createGroq } = require2("@ai-sdk/groq");
      return createGroq({ apiKey });
    }),
    createBuiltinProviderPlugin("nvidia-nim", "NVIDIA_API_KEY", (apiKey) => {
      const { createOpenAICompatible } = require2("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: "nvidia-nim",
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey
      });
    }),
    createBuiltinProviderPlugin("openrouter", "OPENROUTER_API_KEY", (apiKey) => {
      const { createOpenRouter } = require2("@openrouter/ai-sdk-provider");
      return createOpenRouter({ apiKey });
    }),
    createBuiltinProviderPlugin("google", "GOOGLE_API_KEY", (apiKey) => {
      const { createGoogleGenerativeAI } = require2("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey });
    }),
    createBuiltinProviderPlugin("mistral", "MISTRAL_API_KEY", (apiKey) => {
      const { createOpenAICompatible } = require2("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: "mistral",
        baseURL: "https://api.mistral.ai/v1",
        apiKey
      });
    }),
    createBuiltinProviderPlugin("cerebras", "CEREBRAS_API_KEY", (apiKey) => {
      const { createOpenAICompatible } = require2("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: "cerebras",
        baseURL: "https://api.cerebras.ai/v1",
        apiKey
      });
    }),
    createBuiltinProviderPlugin("together", "TOGETHER_API_KEY", (apiKey) => {
      const { createOpenAICompatible } = require2("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: "together",
        baseURL: "https://api.together.xyz/v1",
        apiKey
      });
    }),
    createBuiltinProviderPlugin("xai", "XAI_API_KEY", (apiKey) => {
      const { createOpenAICompatible } = require2("@ai-sdk/openai-compatible");
      return createOpenAICompatible({
        name: "xai",
        baseURL: "https://api.x.ai/v1",
        apiKey
      });
    })
  ];
}
export {
  createBuiltinProviderPlugin,
  getBuiltinProviderPlugins
};

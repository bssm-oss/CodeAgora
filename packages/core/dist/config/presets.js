import { getModePreset } from "./mode-presets.js";
const STATIC_PRESETS = [
  {
    id: "quick",
    name: "Quick Setup",
    nameKo: "\uBE60\uB978 \uC124\uC815",
    description: "3 reviewers, no discussion \u2014 fast and cheap",
    descriptionKo: "\uB9AC\uBDF0\uC5B4 3\uAC1C, \uD1A0\uB860 \uC5C6\uC74C \u2014 \uBE60\uB974\uACE0 \uC800\uB834",
    reviewerCount: 3,
    providers: ["groq"],
    models: { groq: "llama-3.3-70b-versatile" },
    discussion: false
  },
  {
    id: "thorough",
    name: "Thorough",
    nameKo: "\uC2EC\uCE35 \uB9AC\uBDF0",
    description: "5 reviewers + discussion + devil's advocate",
    descriptionKo: "\uB9AC\uBDF0\uC5B4 5\uAC1C + \uD1A0\uB860 + \uC545\uB9C8\uC758 \uBCC0\uD638\uC778",
    reviewerCount: 5,
    providers: ["groq"],
    models: { groq: "llama-3.3-70b-versatile" },
    discussion: true
  },
  {
    id: "minimal",
    name: "Minimal",
    nameKo: "\uCD5C\uC18C \uC124\uC815",
    description: "1 reviewer + 1 supporter \u2014 lowest cost",
    descriptionKo: "\uB9AC\uBDF0\uC5B4 1\uAC1C + \uC11C\uD3EC\uD130 1\uAC1C \u2014 \uCD5C\uC800 \uBE44\uC6A9",
    reviewerCount: 1,
    providers: ["groq"],
    models: { groq: "llama-3.3-70b-versatile" },
    discussion: false
  }
];
function buildPresetConfig(options) {
  const { preset, mode = "pragmatic", language = "en" } = options;
  const modePreset = getModePreset(mode);
  const primaryProvider = preset.providers[0];
  const primaryModel = preset.models[primaryProvider] ?? "llama-3.3-70b-versatile";
  const agent = (id, provider, model) => ({
    id,
    model,
    backend: "api",
    provider,
    enabled: true,
    timeout: 120
  });
  const reviewers = Array.from({ length: preset.reviewerCount }, (_, i) => {
    const provIdx = i % preset.providers.length;
    const prov = preset.providers[provIdx];
    const model = preset.models[prov] ?? primaryModel;
    return agent(`r${i + 1}`, prov, model);
  });
  const daProvider = preset.providers.length > 1 ? preset.providers[1] : primaryProvider;
  const daModel = preset.models[daProvider] ?? primaryModel;
  return {
    mode,
    language,
    reviewers,
    supporters: {
      pool: [agent("s1", primaryProvider, primaryModel)],
      pickCount: 1,
      pickStrategy: "random",
      devilsAdvocate: agent("da", daProvider, daModel),
      personaPool: modePreset.personaPool,
      personaAssignment: "random"
    },
    moderator: {
      model: primaryModel,
      backend: "api",
      provider: primaryProvider,
      timeout: 120
    },
    head: {
      model: primaryModel,
      backend: "api",
      provider: primaryProvider,
      timeout: 120,
      enabled: true
    },
    discussion: {
      maxRounds: preset.discussion ? modePreset.maxRounds : 1,
      registrationThreshold: modePreset.registrationThreshold,
      codeSnippetRange: 10,
      objectionTimeout: 60,
      maxObjectionRounds: 1
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7
    }
  };
}
export {
  STATIC_PRESETS,
  buildPresetConfig
};

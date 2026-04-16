import { stringify as yamlStringify } from "yaml";
const FULL_TEMPLATE_DATA = {
  mode: "pragmatic",
  language: "en",
  reviewers: [
    {
      id: "r1",
      label: "Groq Llama Reviewer 1",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    },
    {
      id: "r2",
      label: "Groq Llama Reviewer 2",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    },
    {
      id: "r3",
      label: "Groq Llama Reviewer 3",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    }
  ],
  supporters: {
    pool: [
      {
        id: "s1",
        model: "llama-3.3-70b-versatile",
        backend: "api",
        provider: "groq",
        enabled: true,
        timeout: 120
      },
      {
        id: "s2",
        model: "llama-3.3-70b-versatile",
        backend: "api",
        provider: "groq",
        enabled: true,
        timeout: 120
      }
    ],
    pickCount: 2,
    pickStrategy: "random",
    devilsAdvocate: {
      id: "da",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    },
    personaPool: [".ca/personas/strict.md", ".ca/personas/pragmatic.md"],
    personaAssignment: "random"
  },
  moderator: {
    model: "llama-3.3-70b-versatile",
    backend: "api",
    provider: "groq"
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null
    },
    codeSnippetRange: 10
  },
  head: {
    backend: "api",
    model: "llama-3.3-70b-versatile",
    provider: "groq",
    enabled: true
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7
  },
  autoApprove: {
    enabled: false,
    maxLines: 5,
    allowedFilePatterns: ["*.md", "*.txt", "docs/**"]
  }
};
const MINIMAL_TEMPLATE_DATA = {
  mode: "pragmatic",
  language: "en",
  reviewers: [
    {
      id: "r1",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    }
  ],
  supporters: {
    pool: [
      {
        id: "s1",
        model: "llama-3.3-70b-versatile",
        backend: "api",
        provider: "groq",
        enabled: true,
        timeout: 120
      }
    ],
    pickCount: 1,
    pickStrategy: "random",
    devilsAdvocate: {
      id: "da",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    },
    personaPool: [".ca/personas/strict.md"],
    personaAssignment: "random"
  },
  moderator: {
    model: "llama-3.3-70b-versatile",
    backend: "api",
    provider: "groq"
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null
    },
    codeSnippetRange: 10
  },
  head: {
    backend: "api",
    model: "llama-3.3-70b-versatile",
    provider: "groq",
    enabled: true
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7
  }
};
const DECLARATIVE_TEMPLATE_DATA = {
  mode: "pragmatic",
  language: "en",
  reviewers: {
    count: 5,
    constraints: {
      minFamilies: 3,
      reasoning: { min: 1, max: 2 },
      contextMin: "32k"
    }
  },
  supporters: {
    pool: [
      {
        id: "s1",
        model: "llama-3.3-70b-versatile",
        backend: "api",
        provider: "groq",
        enabled: true,
        timeout: 120
      }
    ],
    pickCount: 1,
    pickStrategy: "random",
    devilsAdvocate: {
      id: "da",
      model: "llama-3.3-70b-versatile",
      backend: "api",
      provider: "groq",
      enabled: true,
      timeout: 120
    },
    personaPool: [".ca/personas/strict.md"],
    personaAssignment: "random"
  },
  moderator: {
    model: "llama-3.3-70b-versatile",
    backend: "api",
    provider: "groq"
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null
    },
    codeSnippetRange: 10
  },
  head: {
    backend: "api",
    model: "llama-3.3-70b-versatile",
    provider: "groq",
    enabled: true
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7
  }
};
const MULTI_PROVIDER_TEMPLATE_DATA = {
  mode: "pragmatic",
  language: "en",
  // L1: diverse reviewers — budget speed + mid-range performance mix
  reviewers: [
    {
      id: "r1",
      label: "Fireworks Qwen3-Coder (mid-range, code-specialized)",
      model: "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct",
      backend: "api",
      provider: "fireworks",
      enabled: true,
      timeout: 120
    },
    {
      id: "r2",
      label: "DeepInfra DeepSeek V3.1 (mid-range, strong coder)",
      model: "deepseek-ai/DeepSeek-V3.1",
      backend: "api",
      provider: "deepinfra",
      enabled: true,
      timeout: 120
    },
    {
      id: "r3",
      label: "SiliconFlow Qwen3-Coder 30B (budget, code-specialized)",
      model: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      backend: "api",
      provider: "siliconflow",
      enabled: true,
      timeout: 120
    },
    {
      id: "r4",
      label: "Novita Llama 4 Maverick (budget, different family)",
      model: "meta-llama/llama-4-maverick-17b-128e-instruct-fp8",
      backend: "api",
      provider: "novita",
      enabled: true,
      timeout: 120
    },
    {
      id: "r5",
      label: "HuggingFace Qwen2.5-Coder 32B (budget, open-source)",
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      backend: "api",
      provider: "huggingface",
      enabled: true,
      timeout: 120
    }
  ],
  // L2: reasoning models for debate
  supporters: {
    pool: [
      {
        id: "s1",
        label: "DeepInfra DeepSeek R1 (reasoning)",
        model: "deepseek-ai/DeepSeek-R1-0528",
        backend: "api",
        provider: "deepinfra",
        enabled: true,
        timeout: 180
      },
      {
        id: "s2",
        label: "Moonshot Kimi K2.5 (1T MoE, strong reasoning)",
        model: "kimi-k2.5",
        backend: "api",
        provider: "moonshot",
        enabled: true,
        timeout: 180
      },
      {
        id: "s3",
        label: "SiliconFlow Qwen3 Thinking (reasoning)",
        model: "Qwen/Qwen3-235B-A22B-Thinking-2507",
        backend: "api",
        provider: "siliconflow",
        enabled: true,
        timeout: 180
      }
    ],
    pickCount: 2,
    pickStrategy: "random",
    devilsAdvocate: {
      id: "da",
      label: "Cohere Command A (structured analysis)",
      model: "command-a-03-2025",
      backend: "api",
      provider: "cohere",
      enabled: true,
      timeout: 180
    },
    personaPool: [".ca/personas/strict.md", ".ca/personas/pragmatic.md"],
    personaAssignment: "random"
  },
  // L2 moderator: solid reasoning for discussion orchestration
  moderator: {
    model: "deepseek-ai/DeepSeek-V3.2",
    backend: "api",
    provider: "deepinfra"
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null
    },
    codeSnippetRange: 10
  },
  // L3: flagship only — final verdict requires top-tier quality
  head: {
    backend: "api",
    model: "claude-opus-4-6",
    provider: "anthropic",
    enabled: true
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7
  }
};
function toJson(data) {
  return JSON.stringify(data, null, 2);
}
function toYaml(header, data) {
  return `${header}

${yamlStringify(data, { lineWidth: 120 })}`;
}
function generateFullTemplate(format) {
  if (format === "json") {
    return toJson(FULL_TEMPLATE_DATA);
  }
  return toYaml(
    "# CodeAgora Configuration (full)\n# All available options are shown below.",
    FULL_TEMPLATE_DATA
  );
}
function generateMinimalTemplate(format) {
  if (format === "json") {
    return toJson(MINIMAL_TEMPLATE_DATA);
  }
  return toYaml(
    "# CodeAgora Configuration (minimal)\n# Smallest valid configuration to get started.",
    MINIMAL_TEMPLATE_DATA
  );
}
function generateDeclarativeTemplate(format) {
  if (format === "json") {
    return toJson(DECLARATIVE_TEMPLATE_DATA);
  }
  return toYaml(
    "# CodeAgora Configuration (declarative)\n# L0 model intelligence layer selects reviewers automatically.",
    DECLARATIVE_TEMPLATE_DATA
  );
}
function generateMultiProviderTemplate(format) {
  if (format === "json") {
    return toJson(MULTI_PROVIDER_TEMPLATE_DATA);
  }
  return toYaml(
    "# CodeAgora Configuration (multi-provider)\n# Diverse providers across layers: budget L1 reviewers, reasoning L2 supporters, flagship L3 head.",
    MULTI_PROVIDER_TEMPLATE_DATA
  );
}
export {
  generateDeclarativeTemplate,
  generateFullTemplate,
  generateMinimalTemplate,
  generateMultiProviderTemplate
};

import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { SecretKeyField } from "./SecretKeyField";

const meta = preview.meta({ component: SecretKeyField });

export const OpenAi = meta.story({
  args: {
    provider: "OPENAI",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const Bedrock = meta.story({
  args: {
    provider: "BEDROCK",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const OpenRouter = meta.story({
  args: {
    provider: "OPENROUTER",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const Xai = meta.story({
  args: {
    provider: "XAI",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const Vercel = meta.story({
  args: {
    provider: "VERCEL",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const GoogleAiStudio = meta.story({
  args: {
    provider: "GOOGLE_AI_STUDIO",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const Vertex = meta.story({
  args: {
    provider: "VERTEX",
    credential: "",
    hasSavedKey: false,
    onCredentialChange: fn(),
  },
});

export const KeepSavedKey = meta.story({
  args: {
    provider: "ANTHROPIC",
    credential: "",
    hasSavedKey: true,
    onCredentialChange: fn(),
  },
});

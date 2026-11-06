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

export const KeepSavedKey = meta.story({
  args: {
    provider: "ANTHROPIC",
    credential: "",
    hasSavedKey: true,
    onCredentialChange: fn(),
  },
});

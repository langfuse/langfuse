import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionFilter } from "./ConnectionFilter";

const meta = preview.meta({
  component: ConnectionFilter,
  args: {
    connections: [
      { id: "openai", name: "OpenAI", provider: "OPENAI" as const },
      { id: "anthropic", name: "Anthropic", provider: "ANTHROPIC" as const },
      { id: "bedrock", name: "Bedrock EU", provider: "BEDROCK" as const },
    ],
    value: "openai",
    onChange: fn(),
  },
});

export const Default = meta.story({});

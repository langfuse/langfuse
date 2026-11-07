import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionFilter } from "./ConnectionFilter";

const meta = preview.meta({
  component: ConnectionFilter,
  args: {
    connections: [
      { id: "openai", name: "OpenAI" },
      { id: "anthropic", name: "Anthropic" },
      { id: "bedrock", name: "Bedrock EU" },
    ],
    value: "openai",
    onChange: fn(),
  },
});

export const Default = meta.story({});

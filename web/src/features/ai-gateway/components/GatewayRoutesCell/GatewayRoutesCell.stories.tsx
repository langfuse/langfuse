import preview from "@/.storybook/preview";
import { GatewayRoutesCell } from "./GatewayRoutesCell";

const meta = preview.meta({ component: GatewayRoutesCell });

export const Default = meta.story({
  args: { apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"] },
});

export const SingleRoute = meta.story({
  args: { apiFormats: ["Anthropic Messages"] },
});

export const Empty = meta.story({
  args: { apiFormats: [] },
});

/** A table cell too narrow for every route collapses the rest into "+N". */
export const Overflow = meta.story({
  args: {
    apiFormats: [
      "Anthropic Messages",
      "OpenAI Responses",
      "OpenAI Chat Completions",
    ],
  },
  render: (args) => (
    <div className="w-36">
      <GatewayRoutesCell {...args} />
    </div>
  ),
});

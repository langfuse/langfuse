import preview from "@/.storybook/preview";
import { GatewayNotSetUpNotice } from "./GatewayNotSetUpNotice";

const meta = preview.meta({
  component: GatewayNotSetUpNotice,
  parameters: { layout: "padded" },
});

export const Default = meta.story({
  args: {
    organizationName: "Acme",
    providers: [
      { provider: "ANTHROPIC", isConnected: false },
      { provider: "OPENAI", isConnected: false },
    ],
  },
});

/** Pre-release environments also offer Bedrock. */
export const WithBedrock = meta.story({
  args: {
    ...Default.input.args,
    providers: [
      { provider: "ANTHROPIC", isConnected: false },
      { provider: "OPENAI", isConnected: false },
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

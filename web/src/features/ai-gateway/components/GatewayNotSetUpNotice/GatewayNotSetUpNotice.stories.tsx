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
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

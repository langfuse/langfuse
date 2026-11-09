import preview from "@/.storybook/preview";
import { GatewaySetupHero } from "./GatewaySetupHero";

const meta = preview.meta({
  component: GatewaySetupHero,
  // Spans the full page width, as on Overview.
  parameters: { layout: "fullscreen" },
});

export const NotStarted = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: false },
      { provider: "OPENAI", isConnected: false },
    ],
  },
});

export const ProviderConnected = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: false },
    ],
  },
});

/** Pre-release environments also offer Bedrock. */
export const WithBedrock = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: true },
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

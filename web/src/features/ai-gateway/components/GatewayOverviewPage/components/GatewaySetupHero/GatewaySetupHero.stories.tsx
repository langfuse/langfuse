import { expect } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewaySetupHero } from "./GatewaySetupHero";
import { GatewaySetupSwitchboard } from "./GatewaySetupSwitchboard";

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
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

export const ProviderConnected = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: false },
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

/** Every provider, OpenRouter, xAI, Vercel and pre-release Vertex AI included. */
export const WithAllProviders = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: true },
      { provider: "BEDROCK", isConnected: false },
      { provider: "OPENROUTER", isConnected: false },
      { provider: "XAI", isConnected: false },
      { provider: "VERCEL", isConnected: false },
      { provider: "VERTEX", isConnected: false },
    ],
  },
});

/** Every provider plus "More soon", as in the Models empty state. */
export const SwitchboardWithAllRows = meta.story({
  name: "(Test) Eight switchboard rows stay inside the diagram",
  args: { providers: [] },
  render: () => (
    <div className="mx-auto aspect-[440/200] w-full max-w-xl">
      <GatewaySetupSwitchboard
        providers={[
          { provider: "ANTHROPIC", isConnected: false },
          { provider: "OPENAI", isConnected: false },
          { provider: "BEDROCK", isConnected: false },
          { provider: "OPENROUTER", isConnected: false },
          { provider: "XAI", isConnected: false },
          { provider: "VERCEL", isConnected: false },
          { provider: "VERTEX", isConnected: false },
        ]}
        addLabel="Add"
        comingSoonLabel="More soon"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const pills = [...canvasElement.querySelectorAll('rect[width="150"]')];
    await expect(pills).toHaveLength(8);
    for (const pill of pills) {
      const top = Number(pill.getAttribute("y"));
      const bottom = top + Number(pill.getAttribute("height"));
      await expect(top).toBeGreaterThanOrEqual(0);
      await expect(bottom).toBeLessThanOrEqual(200);
    }
  },
});

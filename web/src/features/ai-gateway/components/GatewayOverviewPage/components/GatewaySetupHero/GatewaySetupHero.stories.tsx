import { expect } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewaySetupHero } from "./GatewaySetupHero";
import { GatewaySetupSwitchboard } from "./GatewaySetupSwitchboard";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";

const HERO_PROVIDERS = getGatewaySetupHeroProviders(new Set());

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

export const DiagramLabelsInside = meta.story({
  name: "(Test) Diagram labels stay inside the diagram",
  args: { providers: [] },
  play: async ({ canvasElement }) => {
    const labels = [...canvasElement.querySelectorAll<SVGTextElement>("text")];
    await expect(labels).not.toHaveLength(0);
    for (const label of labels) {
      const diagram = label.ownerSVGElement?.getBoundingClientRect();
      await expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(
        diagram?.right ?? 0,
      );
    }
  },
});

/** Every provider plus "More soon". */
export const SwitchboardWithAllRows = meta.story({
  name: "(Test) All switchboard rows stay inside the diagram",
  args: { providers: [] },
  render: () => (
    <div className="mx-auto aspect-[440/200] w-full max-w-xl">
      <GatewaySetupSwitchboard
        providers={HERO_PROVIDERS}
        unconnectedVariant="placeholder"
        comingSoonLabel="More soon"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const pills = [...canvasElement.querySelectorAll('rect[rx="4"]')];
    await expect(pills).toHaveLength(HERO_PROVIDERS.length + 1);
    for (const pill of pills) {
      const top = Number(pill.getAttribute("y"));
      const bottom = top + Number(pill.getAttribute("height"));
      await expect(top).toBeGreaterThanOrEqual(0);
      await expect(bottom).toBeLessThanOrEqual(200);
    }
  },
});

import { expect } from "storybook/test";

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

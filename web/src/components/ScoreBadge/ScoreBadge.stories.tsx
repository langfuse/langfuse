import { type LastUserScore } from "@langfuse/shared";
import { expect } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ScoreBadge } from "./ScoreBadge";

const score = {
  id: "quality",
  name: "quality",
  dataType: "NUMERIC",
  source: "API",
  value: 0.92,
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
  traceId: "trace-id",
  observationId: "observation-id",
  userId: "user-id",
} satisfies LastUserScore;

const meta = preview.meta({
  component: ScoreBadge,
});

export const Default = meta.story({
  args: {
    name: score.name,
    scores: [score],
  },
});

export const Constrained = meta.story({
  name: "(Test) Constrained",
  args: {
    name: "groundedness against retrieved context",
    scores: [score],
  },
  render: (args) => (
    <div className="max-w-48">
      <ScoreBadge {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const name = canvasElement.querySelector<HTMLElement>(
      '[title="groundedness against retrieved context"]',
    );
    const value = canvasElement.querySelector<HTMLElement>('[title="0.92"]');

    await expect(name).not.toBeNull();
    await expect(value).not.toBeNull();
    await expect(name!.scrollWidth).toBeGreaterThan(name!.clientWidth);
    await expect(value!.scrollWidth).toBeLessThanOrEqual(value!.clientWidth);
  },
});

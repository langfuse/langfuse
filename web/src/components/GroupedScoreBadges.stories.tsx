import { type LastUserScore } from "@langfuse/shared";
import { expect } from "storybook/test";

import preview from "../../.storybook/preview";
import { GroupedScoreBadges } from "./grouped-score-badge";

const meta = preview.meta({
  component: GroupedScoreBadges,
  args: {
    scores: [],
  },
});

const scores = [
  {
    id: "quality",
    name: "quality",
    dataType: "NUMERIC",
    source: "API",
    value: 0.92,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    traceId: "trace-id",
    observationId: "observation-id",
    userId: "user-id",
  },
  {
    id: "helpfulness",
    name: "helpfulness",
    dataType: "NUMERIC",
    source: "API",
    value: 0.81,
    comment: "Clear and useful response",
    metadata: { evaluator: "human" },
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    traceId: "trace-id",
    observationId: null,
    userId: "user-id",
  },
] satisfies LastUserScore[];

export const Default = meta.story({
  args: { scores },
});

export const Compact = meta.story({
  args: { scores, compact: true },
});

export const WithOverflow = meta.story({
  args: {
    scores: [
      ...scores,
      {
        ...scores[0],
        id: "accuracy",
        name: "accuracy",
        value: 0.95,
      },
    ],
    maxVisible: 2,
  },
});

export const DetailsInsideBadge = meta.story({
  name: "(Test) Details Inside Badge",
  args: {
    scores: [
      scores[0],
      {
        ...scores[1],
        id: "quality-with-details",
        name: "quality",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const value = canvasElement.querySelector('[title="0.81"]');

    await expect(value).not.toBeNull();
    await expect(value?.parentElement?.querySelectorAll("svg")).toHaveLength(2);
    await expect(
      value?.parentElement?.querySelector(
        '[aria-label="View comment for quality: 0.81"]',
      ),
    ).not.toBeNull();
    await expect(
      value?.parentElement?.querySelector(
        '[aria-label="View metadata for quality: 0.81"]',
      ),
    ).not.toBeNull();
  },
});

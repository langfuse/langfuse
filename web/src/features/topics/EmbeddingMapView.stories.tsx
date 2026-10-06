import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { EmbeddingMapView } from "./EmbeddingMapView";

const data = {
  points: [
    {
      traceId: "trace-billing",
      summary: "Customer asks for a copy of an invoice.",
      topicId: "billing",
      outcome: "assigned",
      x: 0,
      y: 0,
    },
    {
      traceId: "trace-outlier",
      summary: "Customer asks about a new integration.",
      topicId: null,
      outcome: "outlier",
      x: 3,
      y: 1,
    },
  ],
  missingSummaryCount: 0,
  unpositionedCount: 0,
} satisfies ComponentProps<typeof EmbeddingMapView>["data"];

const meta = preview.meta({
  component: EmbeddingMapView,
  args: {
    projectId: "storybook-project",
    topics: [{ id: "billing", name: "Billing" }],
    data,
    selectedTopic: null,
    selectedTraceId: null,
    onSelectTopic: fn(),
    onSelectTrace: fn(),
    onOpenTrace: fn(),
  },
});

export const Default = meta.story({});

export const SelectedTopic = meta.story({
  args: { selectedTopic: "billing", selectedTraceId: "trace-billing" },
});

export const Empty = meta.story({
  args: { data: { ...data, points: [] } },
});

export const MissingSummaries = meta.story({
  args: { data: { ...data, missingSummaryCount: 2, unpositionedCount: 3 } },
});

import { expect, fn, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicSetupProgressView } from "./TopicSetupProgressView";

const facets = ["Intent", "Sentiment", "Outcome", "Issues"].map((name) => ({
  key: name,
  name,
  complete: 200,
  requested: 500,
}));

const meta = preview.meta({
  component: TopicSetupProgressView,
  args: {
    stage: "summarizing" as const,
    facets,
    retrying: false,
    canRetry: true,
    onRetry: fn(),
  },
});

export const Summarizing = meta.story({});

export const Naming = meta.story({
  args: {
    stage: "naming" as const,
    facets: facets.map((facet) => ({ ...facet, complete: 500 })),
  },
});

export const ClusteringTopics = meta.story({
  name: "(Test) Building topics counts finished fits, not summaries",
  args: {
    stage: "grouping" as const,
    facets: facets.map((facet) => ({ ...facet, complete: 500 })),
    fits: { done: 2, total: 4 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Clustering and identifying topics"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/^2\s*\/\s*4$/)).toBeInTheDocument();
  },
});

export const Failed = meta.story({ args: { stage: "failed" as const } });

export const WaitingForTraces = meta.story({
  args: { waiting: true, facets: [], canRetry: false },
});

export const SnapshotSummarizing = meta.story({
  name: "Snapshot summarizing",
  args: {
    variant: "snapshot" as const,
    facets: facets.map((facet) => ({
      ...facet,
      complete: 140,
      requested: 300,
    })),
    canRetry: false,
  },
});

export const SnapshotFailed = meta.story({
  name: "Snapshot failed",
  args: {
    variant: "snapshot" as const,
    stage: "failed" as const,
    canRetry: false,
    onViewDetails: fn(),
  },
});

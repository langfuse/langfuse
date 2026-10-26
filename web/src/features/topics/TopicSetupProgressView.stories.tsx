import { fn } from "storybook/test";
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

export const Failed = meta.story({ args: { stage: "failed" as const } });

export const WaitingForTraces = meta.story({
  args: { waiting: true, facets: [], canRetry: false },
});

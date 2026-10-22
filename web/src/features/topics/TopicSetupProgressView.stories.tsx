import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicSetupProgressView } from "./TopicSetupProgressView";

const facets = ["Intent", "Sentiment", "Outcome", "Issues"].map((name) => ({
  key: name,
  name,
  complete: 200,
  requested: 500,
  outcome: null as string | null,
  topicCount: null as number | null,
}));

const meta = preview.meta({
  component: TopicSetupProgressView,
  args: {
    stage: "summarizing" as const,
    facets,
    retrying: false,
    onDisplayResults: fn(),
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

export const Done = meta.story({
  args: {
    stage: "done" as const,
    facets: facets.map((facet, index) => ({
      ...facet,
      complete: 500,
      outcome: index === 3 ? "insufficient_data" : "published",
      topicCount: index === 3 ? null : 4 + index,
    })),
  },
});

export const Failed = meta.story({ args: { stage: "failed" as const } });

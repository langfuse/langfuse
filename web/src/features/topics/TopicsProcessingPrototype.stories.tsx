import { type ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import { TopicsProcessingPrototype } from "./TopicsProcessingPrototype";

const ready = [
  {
    name: "Intent",
    summaries: 240,
    kind: "Built-in" as const,
    active: true,
    version: 1,
    description: "What the user wants to accomplish.",
  },
  {
    name: "Outcome",
    summaries: 64,
    kind: "Built-in" as const,
    active: true,
    version: 1,
    description: "How the conversation ended.",
  },
  {
    name: "Issues",
    summaries: 0,
    kind: "Built-in" as const,
    active: true,
    version: 1,
    description: "Errors and friction during the conversation.",
  },
  {
    name: "Product area",
    summaries: 180,
    kind: "Custom" as const,
    active: true,
    version: 2,
    description: "Which part of the product the conversation concerns.",
  },
];
const empty = ready.map((facet) => ({ ...facet, summaries: 0 }));
const args: ComponentProps<typeof TopicsProcessingPrototype> = {
  configured: true,
  automaticEnabled: false,
  configurePlacement: "menu",
  facets: ready,
  traceCount: 1260,
  running: false,
  initialOperation: "process",
  openInitially: false,
};
const meta = preview.meta({
  component: TopicsProcessingPrototype,
  parameters: { layout: "fullscreen" },
  args,
});

export const Configured = meta.story({});
export const AutomaticProcessingOn = meta.story({
  args: { automaticEnabled: true },
});
export const ConfigureBesideMenu = meta.story({
  args: { configurePlacement: "header" },
});
export const SetupNeeded = meta.story({
  args: { configured: false, facets: empty },
});
export const ProcessTraces = meta.story({
  name: "Summarize traces & embed",
  args: { openInitially: true },
});
export const UpdateTopics = meta.story({
  name: "Generate topics",
  args: { openInitially: true, initialOperation: "update" },
});
export const NoSummaries = meta.story({
  args: { openInitially: true, initialOperation: "update", facets: empty },
});
export const SmallSample = meta.story({
  args: {
    openInitially: true,
    initialOperation: "update",
    facets: ready.map((facet, index) => ({
      ...facet,
      summaries: index === 0 ? 24 : 0,
    })),
  },
});
export const RunInProgress = meta.story({
  args: { openInitially: true, running: true },
});
export const NoMatchingTraces = meta.story({
  args: { openInitially: true, traceCount: 0, facets: empty },
});

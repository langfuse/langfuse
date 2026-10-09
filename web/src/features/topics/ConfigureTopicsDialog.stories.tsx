import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  ConfigureTopicsDialog,
  type ConfigureTopicsDraft,
} from "./ConfigureTopicsDialog";

const providerGroups: Array<[string, string[]]> = [
  [
    "Amazon Bedrock",
    ["us.openai.gpt-6-luna", "us.cohere.embed-v4:0", "us.openai.gpt-5.6-terra"],
  ],
  ["OpenAI", ["gpt-6-luna", "text-embedding-3-small", "gpt-5.6-terra"]],
  ["Anthropic", ["claude-sonnet-4-5"]],
];

const builtInFacets = [
  {
    id: "intent",
    name: "Intent",
    question: "What is the user trying to do?",
    builtIn: true,
    enabled: true,
  },
  {
    id: "outcome",
    name: "Outcome",
    question: "Did the assistant resolve the request?",
    builtIn: true,
    enabled: true,
  },
];

const emptyDraft = {
  summary: null,
  embedding: null,
  embeddingDimensions: "1024",
  clustering: null,
  facets: builtInFacets,
  filters: [],
  sampling: 1,
  idleSeconds: "600",
  embeddingLocked: false,
} satisfies ConfigureTopicsDraft;

const filledDraft = {
  summary: { provider: "Amazon Bedrock", model: "us.openai.gpt-6-luna" },
  embedding: { provider: "Amazon Bedrock", model: "us.cohere.embed-v4:0" },
  embeddingDimensions: "1024",
  clustering: { provider: "Amazon Bedrock", model: "us.openai.gpt-5.6-terra" },
  facets: [
    ...builtInFacets,
    {
      id: "frustration",
      name: "Frustration",
      question: "Is the user frustrated?",
      builtIn: false,
      enabled: false,
    },
  ],
  idleSeconds: "600",
  filters: [
    { column: "name", type: "string", operator: "=", value: "billing" },
  ],
  sampling: 0.4,
  embeddingLocked: true,
} satisfies ConfigureTopicsDraft;

const meta = preview.meta({
  component: ConfigureTopicsDialog,
  parameters: { layout: "fullscreen" },
  args: {
    providerGroups,
    onConfigureProviders: fn(),
    onSave: fn(),
    defaultTestOpen: false,
  },
});

export const NeedsSetup = meta.story({
  args: {
    draft: emptyDraft,
    defaultOpen: true,
    notice: "none",
    triggerVariant: "primary",
  },
});

export const Configured = meta.story({
  args: {
    draft: filledDraft,
    defaultOpen: true,
    notice: "none",
    triggerVariant: "secondary",
  },
});

export const SavesTheSheet = meta.story({
  name: "(Test) Save sends facets, filter, idle time, and sampling",
  args: {
    draft: filledDraft,
    defaultOpen: true,
    notice: "none",
    triggerVariant: "secondary",
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const idle = body.getByRole("spinbutton", {
      name: "Seconds to wait after the last observation",
    });
    await userEvent.clear(idle);
    await userEvent.type(idle, "90");
    await userEvent.click(body.getByRole("tab", { name: "Outcome" }));
    await userEvent.click(body.getByRole("switch", { name: "Enable Outcome" }));
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        idleSeconds: "90",
        sampling: 0.4,
        filters: filledDraft.filters,
        facets: expect.arrayContaining([
          expect.objectContaining({ name: "Intent", enabled: true }),
          expect.objectContaining({ name: "Outcome", enabled: false }),
        ]),
      }),
    );
  },
});

export const Paused = meta.story({
  args: {
    draft: filledDraft,
    defaultOpen: true,
    notice: "paused",
    shortLabel: "LLM connection missing",
    pausedAgo: "3 days ago",
    message:
      "No LLM connection found for the provider used by facet summaries. Add or restore the LLM connection, then reactivate Topics.",
    triggerVariant: "primary",
  },
});

export const Testing = meta.story({
  args: {
    draft: filledDraft,
    defaultOpen: true,
    defaultTestOpen: true,
    notice: "none",
    triggerVariant: "secondary",
  },
});

import preview from "../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";

type TimelineProps = ComponentProps<typeof SessionConversationTimeline>;
type LoadedState = Extract<TimelineProps["state"], { type: "loaded" }>;
type Observation = LoadedState["observations"][number];

const trace = {
  id: "trace-support-answer",
  name: "Answer support question",
  timestamp: new Date("2026-01-01T12:00:00.000Z"),
  environment: "production",
  userId: "user-1",
  observationCount: 2,
  latencyMs: 1840,
  scores: [],
} satisfies TimelineProps["trace"];

const observations = [
  {
    id: "generation-1",
    name: "Generate answer",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:00:00.000Z"),
    input: [
      { role: "system", content: "Answer using the product documentation." },
      { role: "user", content: "How does normalized I/O work?" },
    ],
    output: {
      role: "assistant",
      content:
        "Normalized I/O converts provider-specific payloads into one canonical message stream.",
      tool_calls: [
        {
          id: "call-search-1",
          type: "function",
          function: {
            name: "search_documentation",
            arguments: '{"resultLimit":3}',
          },
        },
      ],
    },
    metadata: {},
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "tool-result-1",
    name: "Search documentation",
    type: "TOOL",
    startTime: new Date("2026-01-01T12:00:01.000Z"),
    input: {
      role: "tool",
      tool_call_id: "call-search-1",
      content: { matches: 3 },
    },
    output: null,
    metadata: {},
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
] as unknown as Observation[];

const loadedArgs = {
  trace,
  state: {
    type: "loaded",
    observations,
    hasMoreObservations: false,
  },
  showSystemPrompt: true,
  onOpenTrace: fn(),
  onOpenObservation: fn(),
} satisfies TimelineProps;

const meta = preview.meta({
  component: SessionConversationTimeline,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Loaded = meta.story({ args: loadedArgs });

export const SystemPromptHidden = meta.story({
  args: { ...loadedArgs, showSystemPrompt: false },
});

export const Loading = meta.story({
  args: { ...loadedArgs, state: { type: "loading" } },
});

export const Error = meta.story({
  args: { ...loadedArgs, state: { type: "error" } },
});

export const Empty = meta.story({
  args: {
    ...loadedArgs,
    state: { type: "empty", message: "This trace has no observations." },
  },
});

export const FilteredEmpty = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "empty",
      message: "No observation matches the “Generations” view in this trace.",
    },
  },
});

export const TruncatedObservation = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "loaded",
      observations: [
        {
          ...observations[0]!,
          input: "First 4,000 characters of the input…",
          output: "First 4,000 characters of the output…",
          inputTruncated: true,
          outputTruncated: true,
        },
      ],
      hasMoreObservations: false,
    },
  },
});

export const MoreObservations = meta.story({
  args: {
    ...loadedArgs,
    state: { ...loadedArgs.state, hasMoreObservations: true },
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Observation",
  args: { ...loadedArgs, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Generate answer/i }),
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
  },
});

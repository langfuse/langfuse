import preview from "@/.storybook/preview";
import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SessionConversationTimelineTrace } from "./SessionConversationTimelineTrace";

type Props = ComponentProps<typeof SessionConversationTimelineTrace>;
type TranscriptState = Extract<Props["state"], { type: "transcript" }>;
type Thread = NonNullable<
  TranscriptState["result"]["transcript"]
>["threads"][number];
const trace: Props["trace"] = {
  id: "trace-1",
  name: "Weather assistant",
  timestamp: new Date("2026-09-24T12:00:00Z"),
  environment: "default",
  userId: null,
  observationCount: 3,
  latencyMs: 1000,
  scores: [],
};
const provenance = {
  observationId: "generation-1",
  traceId: trace.id,
  startTime: trace.timestamp,
  endTime: new Date("2026-09-24T12:00:01Z"),
};
const result: Extract<Props["state"], { type: "transcript" }>["result"] = {
  state: "loaded",
  cutoff: false,
  transcript: {
    threads: [
      {
        conversationHistory: [
          {
            role: "system",
            source: "input",
            parts: [{ type: "text", text: "Help the user plan their trip." }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "I am visiting Berlin." }],
          },
        ],
        currentTurn: {
          nestingLevel: 0,
          observations: [],
          messages: [
            {
              ...provenance,
              role: "user",
              source: "input",
              parts: [{ type: "text", text: "What is the weather?" }],
            },
            {
              ...provenance,
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: "Let me check." },
                {
                  type: "tool-call",
                  toolCallId: "weather-1",
                  toolName: "weather",
                  input: { city: "Berlin" },
                },
              ],
            },
            {
              ...provenance,
              role: "tool",
              source: "output",
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "weather-1",
                  toolName: "weather",
                  output: { temperature: 12, conditions: "Sunny" },
                },
              ],
            },
            {
              ...provenance,
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: "It is **12°C and sunny** in Berlin." },
              ],
            },
          ],
        },
      },
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [],
          messages: [
            {
              ...provenance,
              endTime: null,
              role: "assistant",
              source: "output",
              senderName: "Trip planner",
              parts: [{ type: "text", text: "Looking up outdoor activities…" }],
            },
          ],
        },
      },
    ],
  },
};
const meta = preview.meta({ component: SessionConversationTimelineTrace });
export default meta;
const commonArgs = {
  trace,
  turnNumber: 1,
  onOpenTrace: () => {},
  onOpenObservation: () => {},
  scrollTarget: null,
};
const sourceObservation = {
  id: provenance.observationId,
  traceId: trace.id,
  name: "Weather assistant",
  startTime: trace.timestamp,
  environment: trace.environment,
} as TranscriptState["observations"][number];

function transcriptState({
  messages,
  history,
  observations,
}: {
  messages: Thread["currentTurn"]["messages"];
  history: Thread["conversationHistory"];
  observations: TranscriptState["observations"];
}): TranscriptState {
  return {
    type: "transcript",
    result: {
      state: "loaded",
      cutoff: false,
      transcript: {
        threads: [
          {
            conversationHistory: history,
            currentTurn: { nestingLevel: 0, observations: [], messages },
          },
        ],
      },
    },
    observations,
  };
}

const weatherState = transcriptState({
  messages: result.transcript?.threads[0]?.currentTurn.messages ?? [],
  history: result.transcript?.threads[0]?.conversationHistory ?? [],
  observations: [sourceObservation],
});
export const MultipleThreads = meta.story({
  args: {
    ...commonArgs,
    state: {
      type: "transcript",
      result,
      observations: [{ id: "generation-1" }] as Extract<
        Props["state"],
        { type: "transcript" }
      >["observations"],
    },
  },
});
export const Cutoff = meta.story({
  args: {
    ...commonArgs,
    state: {
      type: "transcript",
      result: { ...result, cutoff: true },
      observations: [{ id: "generation-1" }] as Extract<
        Props["state"],
        { type: "transcript" }
      >["observations"],
    },
  },
});
export const Loading = meta.story({
  args: { ...commonArgs, state: { type: "loading" } },
});
export const Error = meta.story({
  args: { ...commonArgs, state: { type: "error" } },
});
export const Empty = meta.story({
  args: { ...commonArgs, state: { type: "empty" } },
});

export const RenderLoadedConversation = meta.story({
  name: "(Test) Renders Transcript Conversation",
  args: { ...commonArgs, state: weatherState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("What is the weather?")).toBeInTheDocument();
    await expect(canvas.getByText("Let me check.")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand weather" }),
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="generation-1"]',
      ),
    ).not.toBeNull();
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Source Observation",
  args: { ...commonArgs, state: weatherState, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getAllByRole("button", {
        name: "Open observation",
      })[0]!,
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
  },
});

export const ExpandTool = meta.story({
  name: "(Test) Expands Transcript Tool",
  args: { ...commonArgs, state: weatherState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand weather" }),
    );
    await expect(canvas.getByText(/"city": "Berlin"/)).toBeInTheDocument();
    await expect(canvas.getByText(/"temperature": 12/)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse weather" }),
    );
    await expect(
      canvas.queryByText(/"temperature": 12/),
    ).not.toBeInTheDocument();
  },
});

export const AnnotateSourceObservation = meta.story({
  name: "(Test) Annotate Source Observation",
  args: {
    ...commonArgs,
    state: {
      ...weatherState,
      observationActions: {
        annotate: { disabled: false, onSelect: fn() },
        comment: { disabled: false, onSelect: fn() },
        addToDataset: { disabled: false, onSelect: fn() },
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getAllByRole("button", {
        name: "Actions for Weather assistant",
      })[0]!,
    );
    await expect(
      page.getByRole("menuitem", { name: "Annotate" }),
    ).toBeInTheDocument();
    await expect(
      page.getByRole("menuitem", { name: "Comments" }),
    ).toBeInTheDocument();
    await expect(
      page.getByRole("menuitem", { name: "Add to dataset" }),
    ).toBeInTheDocument();
    await userEvent.click(
      page.getByRole("menuitem", {
        name: "Annotate",
      }),
    );
    if (args.state.type !== "transcript")
      throw new globalThis.Error("Expected transcript state");
    await expect(
      args.state.observationActions?.annotate.onSelect,
    ).toHaveBeenCalledWith(sourceObservation);
  },
});

export const MessagesWithoutObservationMetadata = meta.story({
  name: "(Test) Messages Without Observation Metadata",
  args: {
    ...commonArgs,
    state: {
      ...weatherState,
      observations: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByText("No transcript messages."),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("What is the weather?")).toBeInTheDocument();
  },
});

export const EmptyTranscript = meta.story({
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      messages: [],
      observations: [sourceObservation],
    }),
  },
});

export const RenderFalsyValues = meta.story({
  name: "(Test) Renders Falsy Message Values",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "user",
          source: "input",
          parts: [{ type: "text", text: "0" }],
        },
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [{ type: "text", text: "false" }],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("0")).toBeInTheDocument();
    await expect(canvas.getByText("false")).toBeInTheDocument();
  },
});

export const GenerationToolCallOnly = meta.story({
  name: "(Test) Generation Tool Call Only",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Expand get_subscription_details" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("Assistant")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand get_subscription_details" }),
    );
    await expect(canvas.getByText(/CUS-48291/)).toBeInTheDocument();
  },
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call-only",
              toolName: "get_subscription_details",
              input: { customerId: "CUS-48291" },
            },
          ],
        },
      ],
    }),
  },
});

export const ToolResultOnly = meta.story({
  name: "(Test) Tool Result Only",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand get_subscription_details" }),
    );
    await expect(canvas.getByText(/annual_pro/)).toBeInTheDocument();
  },
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "tool",
          source: "output",
          parts: [
            {
              type: "tool-result",
              toolCallId: "result-only",
              toolName: "get_subscription_details",
              output: { plan: "annual_pro" },
            },
          ],
        },
      ],
    }),
  },
});

export const PairMatchingToolData = meta.story({
  name: "(Test) Pairs Matching Tool Call and Result",
  args: { ...commonArgs, state: weatherState },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("button", { name: "Expand weather" }),
    ).toHaveLength(1);
    await expect(
      canvas.queryByText("weather · Result"),
    ).not.toBeInTheDocument();
  },
});

export const KeepDifferentToolData = meta.story({
  name: "(Test) Keeps Different Tool Calls",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: "docs",
              toolName: "search_documentation",
              input: { query: "cancellation policy" },
            },
            {
              type: "tool-call",
              toolCallId: "profile",
              toolName: "get_customer_profile",
              input: { customerId: "CUS-48291" },
            },
          ],
        },
        {
          ...provenance,
          role: "tool",
          source: "output",
          parts: [
            {
              type: "tool-result",
              toolCallId: "docs",
              toolName: "search_documentation",
              output: { found: true },
            },
            {
              type: "tool-result",
              toolCallId: "profile",
              toolName: "get_customer_profile",
              output: { plan: "annual_pro" },
            },
          ],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Expand search_documentation" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand get_customer_profile" }),
    ).toBeInTheDocument();
  },
});

export const CodingAgentSubagentTurn = meta.story({
  args: {
    ...commonArgs,
    state: {
      ...weatherState,
      result: {
        ...weatherState.result,
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                nestingLevel: 0,
                observations: [],
                messages: [
                  {
                    ...provenance,
                    role: "assistant",
                    source: "output",
                    parts: [
                      { type: "text", text: "Delegating the code review." },
                    ],
                  },
                ],
              },
            },
            {
              conversationHistory: [],
              currentTurn: {
                nestingLevel: 1,
                observations: [],
                messages: [
                  {
                    ...provenance,
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "text",
                        text: "Add a test for an empty search query.",
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
});

export const SystemPromptHistory = meta.story({
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [
        {
          role: "system",
          source: "input",
          parts: [
            {
              type: "text",
              text: "You are a demo observability analyst. Use only fictional project data.",
            },
          ],
        },
        {
          role: "user",
          source: "input",
          parts: [{ type: "text", text: "Inspect representative failures." }],
        },
      ],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            { type: "text", text: "Start by investigating the timeout." },
          ],
        },
      ],
    }),
  },
});

export const ToolFailure = meta.story({
  name: "(Test) Renders Tool Failure",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      observations: [sourceObservation],
      messages: [
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: "timeout",
              toolName: "get_order",
              input: { orderId: "LF-20481" },
            },
          ],
        },
        {
          ...provenance,
          role: "tool",
          source: "output",
          parts: [
            {
              type: "tool-result",
              toolCallId: "timeout",
              toolName: "get_order",
              output: { code: "TOOL_TIMEOUT" },
              isError: true,
            },
          ],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Failed")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand get_order" }),
    );
    await expect(canvas.getByText(/TOOL_TIMEOUT/)).toBeInTheDocument();
  },
});

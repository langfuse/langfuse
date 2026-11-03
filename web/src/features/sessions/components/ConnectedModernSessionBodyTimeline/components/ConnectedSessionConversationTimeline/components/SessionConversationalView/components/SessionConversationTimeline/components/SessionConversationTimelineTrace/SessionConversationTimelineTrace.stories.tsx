import type { JsonValue } from "@langfuse/shared/src/utils/normalized-io";
import preview from "@/.storybook/preview";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";

type Props = ComponentProps<typeof SessionConversationTimelineTrace>;
type TranscriptState = Extract<Props["state"], { type: "transcript" }>;
type Thread = NonNullable<
  TranscriptState["result"]["transcript"]
>["threads"][number];
const trace: EventSessionTrace = {
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
                  output: {
                    type: "json",
                    value: { temperature: 12, conditions: "Sunny" },
                  },
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
function transcriptState({
  messages,
  history,
}: {
  messages: Thread["currentTurn"]["messages"];
  history: Thread["conversationHistory"];
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
  };
}

const weatherState = transcriptState({
  messages: result.transcript?.threads[0]?.currentTurn.messages ?? [],
  history: result.transcript?.threads[0]?.conversationHistory ?? [],
});

export const CollapsibleTrace = meta.story({
  name: "(Test) Collapsible Trace",
  args: { ...commonArgs, state: { type: "empty" } },
  render: function Render(args) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <SessionConversationTimelineTrace
        {...args}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed((current) => !current)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", {
      name: "Collapse trace Weather assistant",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);
    await expect(
      canvas.queryByText("This trace has no messages."),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Weather assistant")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand trace Weather assistant" }),
    );
    await expect(
      canvas.getByText("This trace has no messages."),
    ).toBeInTheDocument();
  },
});

function toolPreviewState(
  previews: {
    name: string;
    level?: Thread["currentTurn"]["messages"][number]["level"];
    statusMessage?: Thread["currentTurn"]["messages"][number]["statusMessage"];
    isError?: boolean;
    input: Extract<
      Thread["currentTurn"]["messages"][number]["parts"][number],
      { type: "tool-call" }
    >["input"];
    output: JsonValue;
  }[],
): TranscriptState {
  return transcriptState({
    history: [],
    messages: previews.flatMap<Thread["currentTurn"]["messages"][number]>(
      ({ name, input, output, level, statusMessage, isError }) => [
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: name,
              toolName: name,
              input,
            },
          ],
        },
        {
          ...provenance,
          role: "tool",
          source: "output",
          level,
          statusMessage,
          parts: [
            {
              type: "tool-result",
              toolCallId: name,
              toolName: name,
              output:
                typeof output === "string"
                  ? { type: "text", value: output }
                  : { type: "json", value: output },
              isError,
            },
          ],
        },
      ],
    ),
  });
}
export const NestedThreadsHidden = meta.story({
  name: "(Test) Nested Threads Hidden",
  args: {
    ...commonArgs,
    state: {
      type: "transcript",
      result: {
        ...result,
        transcript: {
          threads: (result.transcript?.threads ?? []).map((thread, index) => ({
            ...thread,
            currentTurn: { ...thread.currentTurn, nestingLevel: index + 2 },
          })),
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByText("Looking up outdoor activities…"),
    ).not.toBeInTheDocument();
  },
});
export const MultipleThreads = meta.story({
  name: "(Test) Multiple Threads Without History",
  args: {
    ...commonArgs,
    state: {
      type: "transcript",
      result,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByText("I am visiting Berlin."),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText("Help the user plan their trip."),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText("Looking up outdoor activities…"),
    ).toBeInTheDocument();
    const text = canvasElement.textContent!;
    await expect(text.indexOf("Let me check.")).toBeGreaterThanOrEqual(0);
    await expect(text.indexOf("Let me check.")).toBeLessThan(
      text.indexOf("Looking up outdoor activities…"),
    );
  },
});
export const FirstThreadHeader = meta.story({
  name: "(Test) First Thread Header",
  args: {
    ...commonArgs,
    threadIndex: 0,
    threadCount: 2,
    displayNumber: "1.1",
    state: { type: "transcript", result },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: trace.name ?? "Trace" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Thread 1" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("1.1")).toBeInTheDocument();
    await expect(canvas.queryByText(trace.id)).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Copy trace ID" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Thread 2" }),
    ).not.toBeInTheDocument();
  },
});

export const SubsequentThreadHeader = meta.story({
  name: "(Test) Subsequent Thread Header",
  args: {
    ...commonArgs,
    threadIndex: 1,
    threadCount: 2,
    displayNumber: "1.2",
    state: { type: "transcript", result },
    onOpenTrace: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const openTrace = canvas.getByRole("button", { name: "Open trace" });
    canvasElement.setAttribute("tabindex", "-1");
    canvasElement.focus();
    try {
      await userEvent.tab();
      await expect(openTrace).toHaveFocus();
      await expect(openTrace).toHaveStyle({ opacity: "1" });
      await userEvent.keyboard("{Enter}");
      await expect(args.onOpenTrace).toHaveBeenCalledOnce();
    } finally {
      canvasElement.removeAttribute("tabindex");
    }
    await expect(
      canvas.queryByRole("button", { name: "Copy trace ID" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText(trace.name!)).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Thread 2" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("1.2")).toBeInTheDocument();
  },
});

export const SingleThreadHeader = meta.story({
  name: "(Test) Single Thread Header",
  args: {
    ...commonArgs,
    threadIndex: 0,
    threadCount: 1,
    displayNumber: "1.1",
    state: weatherState,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: trace.name ?? "Trace" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  },
});

export const Cutoff = meta.story({
  args: {
    ...commonArgs,
    state: {
      type: "transcript",
      result: { ...result, cutoff: true },
    },
  },
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
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Source Observation",
  args: { ...commonArgs, state: weatherState, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const message = canvas
      .getAllByRole("article")
      .find((article) => within(article).queryByText("What is the weather?"))!;
    const pointer =
      "__vitest_browser__" in globalThis
        ? (await import("vitest/browser")).userEvent
        : userEvent;
    await pointer.hover(message);
    await pointer.click(within(message).getByText("Open observation"));
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
  },
});

export const ExpandTool = meta.story({
  name: "(Test) Expands Transcript Tool",
  args: { ...commonArgs, state: weatherState, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "weather" }));
    await expect(canvas.getByText("Input")).toBeInTheDocument();
    await expect(args.onOpenObservation).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "weather" }));
    await expect(canvas.queryByText("Input")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand weather" }),
    );
    await expect(canvasElement).toHaveTextContent('"city": "Berlin"');
    await expect(canvasElement).toHaveTextContent('"temperature": 12');
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse weather" }),
    );
    await expect(canvasElement).not.toHaveTextContent('"temperature": 12');
  },
});

export const ToolPreviewJsonHighlighting = meta.story({
  name: "(Test) Reads JSON Tool Inputs and Outputs",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      {
        name: "json-object",
        input: { query: "example" },
        output: { answer: 42 },
      },
      {
        name: "json-string",
        input: '{"query": "example"}',
        output: '{"answer": 42}',
      },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["json-object", "json-string"]) {
      const expand = canvas.getByRole("button", { name: `Expand ${name}` });
      await userEvent.click(expand);
      await expect(
        canvas.getByRole("combobox", { name: "Tool input language" }),
      ).toHaveTextContent("Auto (JSON)");
      await expect(
        canvas.getByRole("combobox", { name: "Tool output language" }),
      ).toHaveTextContent("Auto (JSON)");
      await expect(canvasElement).toHaveTextContent('"query": "example"');
      await expect(canvasElement).toHaveTextContent('"answer": 42');
      await userEvent.click(
        canvas.getByRole("button", { name: `Collapse ${name}` }),
      );
    }
  },
});

const largeToolPreviewCases = [
  {
    name: "large-json",
    input: { text: "x".repeat(20_000) },
    output: { text: "y".repeat(20_000) },
  },
  {
    name: "large-multiline",
    input: { text: "x".repeat(20_000) },
    output: `${"\n".repeat(10_000)}full value ends here`,
  },
];

export const LargeToolPreviews = meta.story({
  name: "(Test) Large Tool Previews Preserve Full Content",
  args: {
    ...commonArgs,
    state: toolPreviewState(largeToolPreviewCases),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const { name, input, output } of largeToolPreviewCases) {
      const expand = canvas.getByRole("button", { name: `Expand ${name}` });
      await userEvent.click(expand);
      const expectedOutput =
        typeof output === "string"
          ? output
          : JSON.stringify(output, undefined, 2);
      await expect(canvasElement).toHaveTextContent(expectedOutput, {
        normalizeWhitespace: false,
      });
      await expect(
        canvas.getByRole("combobox", { name: "Tool output language" }),
      ).toBeVisible();

      await expect(
        canvas.getByText((text) => text.includes(JSON.stringify(input.text))),
      ).toBeVisible();
      await userEvent.click(
        canvas.getByRole("button", { name: `Collapse ${name}` }),
      );
    }
  },
});

export const ToolPreviewLanguageOverrides = meta.story({
  name: "(Test) Independent Tool Preview Language Overrides",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      { name: "search", input: { query: "example" }, output: { answer: 42 } },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand search" }),
    );
    const inputSelect = canvas.getByRole("combobox", {
      name: "Tool input language",
    });
    const outputSelect = canvas.getByRole("combobox", {
      name: "Tool output language",
    });
    const body = within(document.body);

    await userEvent.click(inputSelect);
    await userEvent.click(body.getByRole("option", { name: "Plain text" }));
    await expect(inputSelect).toHaveTextContent("Plain text");
    await expect(canvasElement).toHaveTextContent('"query": "example"');
    await expect(outputSelect).toHaveTextContent("Auto (JSON)");

    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Python" }));
    await expect(outputSelect).toHaveTextContent("Python");
    await expect(canvasElement).toHaveTextContent('"answer": 42');
    await expect(inputSelect).toHaveTextContent("Plain text");

    await userEvent.click(inputSelect);
    await userEvent.click(body.getByRole("option", { name: "Auto (JSON)" }));
    await expect(inputSelect).toHaveTextContent("Auto (JSON)");
    await expect(outputSelect).toHaveTextContent("Python");

    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Plain text" }));
    await expect(canvasElement).toHaveTextContent('"answer": 42');
    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Auto (JSON)" }));
    await expect(outputSelect).toHaveTextContent("Auto (JSON)");
  },
});

export const ToolPreviewFallbacks = meta.story({
  name: "(Test) Tool Preview Plain Text, HTML Safety, and Empty Values",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      { name: "plain-text", input: null, output: "Hello world" },
      {
        name: "html",
        input: null,
        output: '<script>alert("unsafe")</script>',
      },
      { name: "input-only", input: { query: "example" }, output: null },
      { name: "empty", input: null, output: null },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Show tools: plain-text · html · input-only · empty",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand plain-text" }),
    );
    await expect(
      canvas.getByRole("combobox", { name: "Tool output language" }),
    ).toHaveTextContent("Auto (Plain text)");
    await expect(
      canvas.queryByRole("combobox", { name: "Tool input language" }),
    ).toBeNull();
    await expect(canvas.getByText("Hello world")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse plain-text" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Expand html" }));
    // Untrusted markup must remain literal text, never an executable element.
    const htmlResult = canvas
      .getByRole("button", { name: "Collapse html" })
      .closest<HTMLElement>("[data-session-tool-row]")!;
    await expect(htmlResult.querySelector("script")).toBeNull();
    await expect(htmlResult).toHaveTextContent(
      '<script>alert("unsafe")</script>',
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse html" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand input-only" }),
    );
    await expect(
      canvas.getByRole("combobox", { name: "Tool input language" }),
    ).toHaveTextContent("Auto (JSON)");
    await expect(
      canvas.queryByRole("combobox", {
        name: "Tool output language",
      }),
    ).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse input-only" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Expand empty" }));
    await expect(canvas.queryByRole("combobox")).toBeNull();
    await expect(canvas.getByText("No input or output")).toBeInTheDocument();
  },
});

export const OpenToolObservation = meta.story({
  name: "(Test) Opens Tool Observation",
  args: {
    ...commonArgs,
    state: weatherState,
    onOpenObservation: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "weather" }));
    const tool = canvasElement.querySelector<HTMLElement>(
      "[data-session-tool-row]",
    )!;
    await userEvent.click(
      within(tool).getByRole("button", { name: "Open observation" }),
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
  },
});

export const EmptyTranscript = meta.story({
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      messages: [],
    }),
  },
});

export const Refusal = meta.story({
  name: "(Test) Refusal",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
      messages: [
        {
          ...provenance,
          role: "user",
          source: "input",
          parts: [
            { type: "text", text: "How can I break into someone's account?" },
          ],
        },
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "text",
              refusal: true,
              text: "I can't help with breaking into someone else's account.",
            },
          ],
        },
        {
          ...provenance,
          role: "user",
          source: "input",
          parts: [
            {
              type: "text",
              text: "How can I secure my account and access someone else's?",
            },
          ],
        },
        {
          ...provenance,
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "text",
              text: "Use a unique password and enable two-factor authentication to secure your account.",
            },
            {
              type: "text",
              refusal: true,
              text: "I can't help with accessing someone else's account.",
            },
          ],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "I can't help with breaking into someone else's account.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Use a unique password and enable two-factor authentication to secure your account.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("I can't help with accessing someone else's account."),
    ).toBeInTheDocument();
    const banners = canvas.getAllByRole("alert");
    await expect(banners).toHaveLength(2);
    for (const banner of banners) {
      await expect(
        within(banner).getByRole("heading", { name: "Refusal" }),
      ).toBeInTheDocument();
    }
    await expect(banners[0]).toHaveTextContent(
      "I can't help with breaking into someone else's account.",
    );
    await expect(banners[1]).toHaveTextContent(
      "I can't help with accessing someone else's account.",
    );
  },
});

export const RenderFalsyValues = meta.story({
  name: "(Test) Renders Falsy Message Values",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
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
    await expect(canvasElement).toHaveTextContent("CUS-48291");
  },
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
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
    await expect(canvasElement).toHaveTextContent("annual_pro");
  },
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
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
              output: { type: "json", value: { plan: "annual_pro" } },
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand weather" }),
    );
    const toolRow = canvas
      .getByRole("button", { name: "Collapse weather" })
      .closest("section")!;
    const [inputPreview, outputPreview] = toolRow.querySelectorAll("pre");
    await expect(inputPreview).toHaveTextContent('"city": "Berlin"');
    await expect(outputPreview).toHaveTextContent('"temperature": 12');
  },
});

export const KeepDifferentToolData = meta.story({
  name: "(Test) Keeps Different Tool Calls",
  args: {
    ...commonArgs,
    state: transcriptState({
      history: [],
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
              output: { type: "json", value: { found: true } },
            },
            {
              type: "tool-result",
              toolCallId: "profile",
              toolName: "get_customer_profile",
              output: { type: "json", value: { plan: "annual_pro" } },
            },
          ],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", {
        name: "Show tools: search_documentation · get_customer_profile",
      }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand search_documentation" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand get_customer_profile" }),
    ).toBeInTheDocument();
  },
});

export const SystemPromptHistory = meta.story({
  name: "System Prompt History",
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
      messages: [
        {
          ...provenance,
          role: "system",
          source: "input",
          parts: [{ type: "text", text: "Current system instructions" }],
        },
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
          endTime: null,
          parts: [
            {
              type: "tool-result",
              toolCallId: "timeout",
              toolName: "get_order",
              output: { type: "json", value: { code: "TOOL_TIMEOUT" } },
              isError: true,
            },
          ],
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Tool status: ERROR")).toBeVisible();
    await expect(
      canvas.queryByLabelText("Tool status: WARNING"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand get_order" }),
    );
    await expect(canvasElement).toHaveTextContent("TOOL_TIMEOUT");
  },
});

export const ToolErrorStatus = meta.story({
  name: "(Test) Tool Error Status Message",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "ERROR",
        statusMessage: "Search timed out",
        isError: true,
      },
    ]),
  },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    if (args.state.type !== "transcript") {
      throw new globalThis.Error("Expected transcript fixture");
    }
    const message =
      args.state.result.transcript?.threads[0]?.currentTurn.messages.find(
        (message) => message.role === "tool",
      );
    if (!message?.level || !message.statusMessage) {
      throw new globalThis.Error("Expected tool status fixture");
    }
    const overlays = within(canvasElement.ownerDocument.body);
    const indicator = canvas.getByLabelText(`Tool status: ${message.level}`);
    if (message.level === "WARNING" || message.level === "ERROR") {
      await expect(indicator).toBeVisible();
    } else {
      await expect(indicator).not.toBeVisible();
    }
    await expect(canvas.queryByLabelText("Failed")).not.toBeInTheDocument();
    await expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument();

    // Simulated pointer events do not activate CSS :hover in browser tests.
    if ("__vitest_browser__" in globalThis) {
      const { userEvent: browserUserEvent } = await import("vitest/browser");
      await browserUserEvent.hover(
        canvas.getByRole("button", { name: "search" }),
      );
      await expect(indicator).toBeVisible();
      await browserUserEvent.unhover(
        canvas.getByRole("button", { name: "search" }),
      );
    }
    await userEvent.click(canvas.getByRole("button", { name: "search" }));
    await expect(indicator).toBeVisible();
    await userEvent.hover(indicator);
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      message.statusMessage,
    );
    const tooltip = within(overlays.getByRole("tooltip"));
    await waitFor(() => expect(tooltip.getByText("search")).toBeVisible());
    const statusMessage = tooltip.getByText(message.statusMessage);
    await waitFor(() => expect(statusMessage).toBeVisible());
    await userEvent.unhover(indicator);
    await waitFor(() =>
      expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    const searchButton = canvas.getByRole("button", { name: "search" });
    if ("__vitest_browser__" in globalThis) {
      // Real pointer and keyboard events: a mouse click must not pin the
      // indicator, while keyboard focus still reaches and reveals it.
      const { userEvent: browserUserEvent } = await import("vitest/browser");
      // Earlier synthetic clicks left keyboard-style focus on the button.
      searchButton.blur();
      await browserUserEvent.click(searchButton);
      await browserUserEvent.unhover(searchButton);
      await expect(searchButton).toHaveFocus();
      if (message.level === "WARNING" || message.level === "ERROR") {
        await expect(indicator).toBeVisible();
      } else {
        await expect(indicator).not.toBeVisible();
      }
      await browserUserEvent.keyboard("{Tab}");
    } else {
      await userEvent.click(searchButton);
      await expect(searchButton).toHaveFocus();
      await userEvent.tab();
    }
    await expect(indicator).toHaveFocus();
    await expect(indicator).toBeVisible();
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      message.statusMessage,
    );
  },
});

export const ToolResultErrorOverridesWarning = meta.story({
  name: "(Test) Tool Result Error Overrides Warning",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "WARNING",
        statusMessage: "Search unavailable",
        isError: true,
      },
    ]),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const indicator = canvas.getByLabelText("Tool status: ERROR");
    await expect(indicator).toBeVisible();
    await expect(
      canvas.queryByLabelText("Tool status: WARNING"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText("Failed")).not.toBeInTheDocument();
    await userEvent.hover(indicator);
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("Search unavailable");
  },
});

export const LongToolStatus = meta.story({
  name: "(Test) Scrolls Long Tool Status",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "ERROR",
        statusMessage: `${"A detailed tool failure\n".repeat(100)}End of status`,
      },
    ]),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.hover(canvas.getByLabelText("Tool status: ERROR"));
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await waitFor(() => {
      const bounds = tooltip.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(
        canvasElement.ownerDocument.documentElement.clientHeight,
      );
      expect(tooltip.scrollHeight).toBeGreaterThan(tooltip.clientHeight);
    });
    tooltip.scrollTo({ top: tooltip.scrollHeight });
    await waitFor(() => expect(tooltip.scrollTop).toBeGreaterThan(0));
    const textNodes = canvasElement.ownerDocument.createTreeWalker(
      tooltip,
      NodeFilter.SHOW_TEXT,
    );
    const finalText = canvasElement.ownerDocument.createRange();
    let textNode = textNodes.nextNode();
    while (textNode) {
      const offset = textNode.textContent?.indexOf("End of status") ?? -1;
      if (offset >= 0) {
        finalText.setStart(textNode, offset);
        finalText.setEnd(textNode, offset + "End of status".length);
        break;
      }
      textNode = textNodes.nextNode();
    }
    await expect(textNode).not.toBeNull();
    await waitFor(() => {
      const visibleBounds = tooltip.getBoundingClientRect();
      const textBounds = finalText.getBoundingClientRect();
      expect(textBounds.height).toBeGreaterThan(0);
      expect(textBounds.top).toBeGreaterThanOrEqual(visibleBounds.top);
      expect(textBounds.bottom).toBeLessThanOrEqual(visibleBounds.bottom);
    });
  },
});

export const ToolWarningStatus = ToolErrorStatus.extend({
  name: "(Test) Tool Warning Status Message",
  args: {
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "WARNING",
        statusMessage: "Search returned partial results",
      },
    ]),
  },
});

export const ToolDefaultStatus = ToolErrorStatus.extend({
  name: "(Test) Tool Default Status Message",
  args: {
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "DEFAULT",
        statusMessage: "Search completed",
      },
    ]),
  },
});

export const ToolDebugStatus = ToolErrorStatus.extend({
  name: "(Test) Tool Debug Status Message",
  args: {
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "DEBUG",
        statusMessage: "Search used cached results",
      },
    ]),
  },
});

export const ToolDefaultWithoutMessage = meta.story({
  name: "(Test) Tool Default Status Without Message",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      { name: "search", input: null, output: null, level: "DEFAULT" },
    ]),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "search" })).toBeVisible();
    await expect(
      canvas.queryByLabelText("Tool status: DEFAULT"),
    ).not.toBeInTheDocument();
  },
});

export const GroupedToolStatuses = meta.story({
  name: "(Test) Grouped Tool Errors And Warnings",
  args: {
    ...commonArgs,
    state: toolPreviewState([
      {
        name: "search",
        input: null,
        output: null,
        level: "ERROR",
        statusMessage: "Search timed out",
        isError: true,
      },
      { name: "fetch", input: null, output: null, isError: true },
      {
        name: "list",
        input: null,
        output: null,
        level: "WARNING",
        statusMessage: "Results truncated",
      },
      { name: "validate", input: null, output: null, level: "WARNING" },
      {
        name: "cache",
        input: null,
        output: null,
        level: "DEFAULT",
        statusMessage: "Cache hit",
      },
      {
        name: "debug",
        input: null,
        output: null,
        level: "DEBUG",
        statusMessage: "Diagnostics enabled",
      },
    ]),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const overlays = within(canvasElement.ownerDocument.body);
    const errors = canvas.getByLabelText("Tool group: 2 errors");
    const warnings = canvas.getByLabelText("Tool group: 2 warnings");
    const groupToggle = canvas.getByRole("button", {
      name: (name) => name.startsWith("Show tools:"),
    });
    await expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    await expect(errors).toBeVisible();
    await expect(warnings).toBeVisible();
    await expect(
      canvas.queryByLabelText("Tool status: ERROR"),
    ).not.toBeInTheDocument();

    await userEvent.hover(errors);
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Search timed out",
    );
    await waitFor(async () => {
      const tooltip = within(overlays.getByRole("tooltip"));
      await expect(tooltip.getByText("Search timed out")).toBeVisible();
      await expect(tooltip.getByText("search")).toBeVisible();
      await expect(tooltip.getByText("fetch")).toBeVisible();
    });
    await expect(
      within(overlays.getByRole("tooltip")).queryByRole("heading", {
        name: "Errors",
      }),
    ).not.toBeInTheDocument();
    await expect(overlays.getByRole("tooltip")).not.toHaveTextContent(
      "Results truncated",
    );
    await expect(
      within(overlays.getByRole("tooltip")).queryByRole("heading", {
        name: "Tool calls",
      }),
    ).not.toBeInTheDocument();
    await userEvent.unhover(errors);
    await waitFor(() =>
      expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    await userEvent.hover(warnings);
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Results truncated",
    );
    await waitFor(() =>
      expect(
        within(overlays.getByRole("tooltip")).getByText("Results truncated"),
      ).toBeVisible(),
    );
    await expect(
      within(overlays.getByRole("tooltip")).queryByRole("heading", {
        name: "Warnings",
      }),
    ).not.toBeInTheDocument();
    await expect(overlays.getByRole("tooltip")).not.toHaveTextContent(
      "Search timed out",
    );
    await userEvent.unhover(warnings);
    await waitFor(() =>
      expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument(),
    );

    await userEvent.click(groupToggle);
    await expect(canvas.getAllByLabelText("Tool status: ERROR")).toHaveLength(
      2,
    );
    for (const indicator of canvas.getAllByLabelText("Tool status: ERROR")) {
      await expect(indicator).toBeVisible();
    }
    await expect(canvas.getAllByLabelText("Tool status: WARNING")).toHaveLength(
      2,
    );
    await expect(canvas.queryByLabelText("Failed")).not.toBeInTheDocument();
    await expect(errors).toHaveTextContent("2 errors");
    await expect(warnings).toHaveTextContent("2 warnings");
    await userEvent.tab();
    await userEvent.tab();
    await expect(errors).toHaveFocus();
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Search timed out",
    );
    await expect(
      canvas.getByRole("button", {
        name: (name) => name.startsWith("Hide tools:"),
      }),
    ).toHaveAttribute("aria-expanded", "true");
  },
});

export const HealthyToolGroup = meta.story({
  name: "(Test) Healthy Tool Group Has No Status Summary",
  args: {
    ...commonArgs,
    state: toolPreviewState(
      ["search", "fetch", "cache", "validate"].map((name) => ({
        name,
        input: null,
        output: null,
        level: "DEFAULT",
      })),
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", {
        name: "Show tools: search · fetch · cache · validate",
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText((label) => label.startsWith("Tool group:")),
    ).not.toBeInTheDocument();
  },
});

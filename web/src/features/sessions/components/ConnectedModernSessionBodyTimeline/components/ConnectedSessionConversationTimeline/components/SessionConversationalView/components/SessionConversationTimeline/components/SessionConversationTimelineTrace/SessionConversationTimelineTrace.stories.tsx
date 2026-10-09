import preview from "@/.storybook/preview";
import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";

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
    output: Extract<
      Thread["currentTurn"]["messages"][number]["parts"][number],
      { type: "tool-result" }
    >["output"];
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
              output,
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
      .getByText("What is the weather?")
      .closest("article")!;
    await userEvent.hover(message);
    await userEvent.click(
      within(message).getByText(/open observation/i, {
        selector: "button",
      }),
    );
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
    const [inputPreview, outputPreview] = canvasElement.querySelectorAll("pre");
    await expect(inputPreview).toHaveTextContent('"city": "Berlin"');
    await expect(outputPreview).toHaveTextContent('"temperature": 12');
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse weather" }),
    );
    await expect(outputPreview).not.toBeInTheDocument();
  },
});

export const ToolPreviewJsonHighlighting = meta.story({
  name: "(Test) Highlights JSON Tool Inputs and Outputs",
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
      const row = expand.closest("section")!;
      await userEvent.click(expand);
      const controls = within(row);
      await expect(
        controls.getByRole("combobox", { name: "Tool input language" }),
      ).toHaveTextContent("Auto (JSON)");
      await expect(
        controls.getByRole("combobox", { name: "Tool output language" }),
      ).toHaveTextContent("Auto (JSON)");
      const [inputPreview, outputPreview] = row.querySelectorAll("pre");
      await expect(
        inputPreview.querySelector(".token.property"),
      ).toHaveTextContent('"query"');
      await expect(
        outputPreview.querySelector(".token.property"),
      ).toHaveTextContent('"answer"');
    }
  },
});

const largeToolPreviewCases = [
  {
    name: "highlight-limit",
    input: { text: "x".repeat(9_984) },
    output: { text: "x".repeat(9_985) },
  },
  {
    name: "large-multiline",
    input: { text: "x".repeat(9_985) },
    output: `${"\n".repeat(10_000)}full value ends here`,
  },
];

export const LargeToolPreviews = meta.story({
  name: "(Test) Large Tool Previews Bypass Highlighting Without Truncation",
  args: {
    ...commonArgs,
    state: toolPreviewState(largeToolPreviewCases),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const { name, input, output } of largeToolPreviewCases) {
      const expand = canvas.getByRole("button", { name: `Expand ${name}` });
      const row = expand.closest("section")!;
      await userEvent.click(expand);
      const controls = within(row);
      const [inputPreview, outputPreview] = row.querySelectorAll("pre");
      const expectedInput = JSON.stringify(input, undefined, 2);
      const expectedOutput =
        typeof output === "string"
          ? output
          : JSON.stringify(output, undefined, 2);
      await expect(outputPreview.textContent).toBe(expectedOutput);
      await expect(outputPreview.childElementCount).toBe(0);
      await expect(
        controls.getByRole("combobox", { name: "Tool output language" }),
      ).toBeVisible();

      if (name === "highlight-limit") {
        await expect(expectedInput.length).toBe(10_000);
        await expect(expectedOutput.length).toBe(10_001);
        await expect(
          inputPreview.querySelector(".token.string")?.textContent,
        ).toBe(JSON.stringify(input.text));
        await expect(
          inputPreview.querySelector(".token.property"),
        ).toBeInTheDocument();
        await expect(
          controls.getByRole("combobox", { name: "Tool input language" }),
        ).toHaveTextContent("Auto (JSON)");
      } else {
        await expect(inputPreview.textContent).toBe(expectedInput);
        await expect(inputPreview.childElementCount).toBe(0);
      }
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
    const [inputContainer, outputContainer] = Array.from(
      canvasElement.querySelectorAll("pre"),
      (preview) => preview.parentElement!,
    );
    const body = within(document.body);

    await userEvent.click(inputSelect);
    await userEvent.click(body.getByRole("option", { name: "Plain text" }));
    await expect(inputSelect).toHaveTextContent("Plain text");
    await expect(inputContainer.querySelector(".token.property")).toBeNull();
    await expect(inputContainer.querySelector("pre")).toHaveTextContent(
      '"query": "example"',
    );
    await expect(outputSelect).toHaveTextContent("Auto (JSON)");
    await expect(
      outputContainer.querySelector(".token.property"),
    ).toBeInTheDocument();

    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Python" }));
    await expect(outputSelect).toHaveTextContent("Python");
    await expect(outputContainer.querySelector(".token.property")).toBeNull();
    await expect(inputSelect).toHaveTextContent("Plain text");

    await userEvent.click(inputSelect);
    await userEvent.click(body.getByRole("option", { name: "Auto (JSON)" }));
    await expect(
      inputContainer.querySelector(".token.property"),
    ).toBeInTheDocument();
    await expect(outputSelect).toHaveTextContent("Python");

    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Plain text" }));
    await expect(outputContainer.querySelector(".token.property")).toBeNull();
    await expect(outputContainer.querySelector("pre")).toHaveTextContent(
      '"answer": 42',
    );
    await userEvent.click(outputSelect);
    await userEvent.click(body.getByRole("option", { name: "Auto (JSON)" }));
    await expect(
      outputContainer.querySelector(".token.property"),
    ).toBeInTheDocument();
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
    for (const name of ["plain-text", "html", "input-only", "empty"]) {
      await userEvent.click(
        canvas.getByRole("button", { name: `Expand ${name}` }),
      );
    }
    const plainRow = canvas
      .getByRole("button", { name: "Collapse plain-text" })
      .closest("section")!;
    await expect(
      within(plainRow).getByRole("combobox", { name: "Tool output language" }),
    ).toHaveTextContent("Auto (Plain text)");
    await expect(
      within(plainRow).queryByRole("combobox", { name: "Tool input language" }),
    ).toBeNull();
    await expect(plainRow.querySelector("pre")).toHaveTextContent(
      "Hello world",
    );

    const htmlRow = canvas
      .getByRole("button", { name: "Collapse html" })
      .closest("section")!;
    await expect(htmlRow.querySelector("script")).toBeNull();
    await expect(htmlRow.querySelector("pre")).toHaveTextContent(
      '<script>alert("unsafe")</script>',
    );

    const inputRow = canvas
      .getByRole("button", { name: "Collapse input-only" })
      .closest("section")!;
    await expect(
      within(inputRow).getByRole("combobox", { name: "Tool input language" }),
    ).toHaveTextContent("Auto (JSON)");
    await expect(
      within(inputRow).queryByRole("combobox", {
        name: "Tool output language",
      }),
    ).toBeNull();

    const emptyRow = canvas
      .getByRole("button", { name: "Collapse empty" })
      .closest("section")!;
    await expect(within(emptyRow).queryByRole("combobox")).toBeNull();
    await expect(
      within(emptyRow).getByText("No input or output"),
    ).toBeInTheDocument();
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
    const toolRow = canvas
      .getByRole("button", { name: "Expand weather" })
      .closest("section")!;
    await userEvent.hover(toolRow);
    const openObservation = within(toolRow).getByText(/open observation/i, {
      selector: "button",
    });
    await userEvent.click(openObservation);
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
    await expect(canvas.getByText(/CUS-48291/)).toBeInTheDocument();
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
    await expect(canvas.getByText(/annual_pro/)).toBeInTheDocument();
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
      canvas.queryByRole("button", {
        name: /^Show tools:.*search_documentation.*get_customer_profile/,
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
  name: "(Test) System Prompt Navigation",
  args: {
    ...commonArgs,
    onOpenTrace: fn(),
    onOpenObservation: fn(),
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
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByText("Inspect representative failures."),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: /Weather assistant.*trace-1/ }),
    );
    await expect(args.onOpenTrace).toHaveBeenCalledTimes(1);
    const header = canvas.getByRole("button", {
      name: "System prompt",
    }).parentElement!;
    const timestamp = header.querySelector("time")!;
    const openObservation = within(header).getByText("Open observation", {
      selector: "button",
    });
    await expect(timestamp.dateTime).toBe(provenance.startTime.toISOString());
    await userEvent.hover(header);
    await userEvent.click(openObservation);
    await expect(args.onOpenObservation).toHaveBeenCalledTimes(1);
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
    await userEvent.unhover(header);
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
    await expect(indicator.querySelector("svg")).toBeInTheDocument();
    await expect(indicator.textContent).toBe("");
    await expect(
      canvas.getByRole("button", { name: "search" }).nextElementSibling,
    ).toBe(indicator);
    await expect(canvas.queryByLabelText("Failed")).not.toBeInTheDocument();
    await expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument();

    await userEvent.hover(canvas.getByRole("button", { name: "search" }));
    await expect(indicator).toBeVisible();
    await userEvent.hover(indicator);
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      message.statusMessage,
    );
    const tooltip = within(overlays.getByRole("tooltip"));
    await expect(tooltip.getByText("search")).toBeVisible();
    const statusMessage = tooltip.getByText(message.statusMessage);
    await expect(statusMessage).not.toHaveTextContent("search");
    await expect(statusMessage).toBeVisible();
    await userEvent.unhover(indicator);
    await waitFor(() =>
      expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    if (message.level === "DEFAULT" || message.level === "DEBUG") {
      await expect(indicator).not.toBeVisible();
    }

    await userEvent.click(canvas.getByRole("button", { name: "search" }));
    await expect(indicator).toBeVisible();
    await userEvent.tab();
    await expect(indicator).toHaveFocus();
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      message.statusMessage,
    );
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
    const groupToggle = canvas.getByRole("button", { name: /Show tools:/ });
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
    await expect(overlays.getByRole("tooltip")).toHaveTextContent(
      "Tool failed",
    );
    await expect(
      within(overlays.getByRole("tooltip")).getByText("Search timed out"),
    ).toBeVisible();
    await expect(
      within(overlays.getByRole("tooltip")).getByText("search"),
    ).toBeVisible();
    await expect(
      within(overlays.getByRole("tooltip")).getByText("fetch"),
    ).toBeVisible();
    await expect(
      within(overlays.getByRole("tooltip")).getByText("Search timed out"),
    ).not.toHaveTextContent("search");
    await expect(
      within(overlays.getByRole("tooltip")).getByText("Search timed out")
        .parentElement,
    ).not.toBe(
      within(overlays.getByRole("tooltip")).getByText("Tool failed")
        .parentElement,
    );
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
    await expect(overlays.getByRole("tooltip")).toHaveTextContent(
      "Tool reported a warning",
    );
    await expect(
      within(overlays.getByRole("tooltip")).getByText("Results truncated"),
    ).toBeVisible();
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
    await expect(canvas.getByLabelText("Tool status: ERROR")).toBeVisible();
    await expect(canvas.getAllByLabelText("Tool status: WARNING")).toHaveLength(
      2,
    );
    await expect(canvas.getByLabelText("Failed")).toBeVisible();
    await expect(errors).toHaveTextContent("2 errors");
    await expect(warnings).toHaveTextContent("2 warnings");
    await userEvent.tab();
    await userEvent.tab();
    await expect(errors).toHaveFocus();
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Search timed out",
    );
    await expect(
      canvas.getByRole("button", { name: /Hide tools:/ }),
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
      canvas.getByRole("button", { name: /Show tools:/ }),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText(/Tool group:/),
    ).not.toBeInTheDocument();
  },
});

// @vitest-environment node

import { describe, expect, it } from "vitest";

import { prepareSessionTimelineObservations } from "@/src/features/sessions/SessionConversationTimeline/fns/prepareSessionTimelineObservations";

const observation = (
  id: string,
  input: unknown,
  output: unknown,
  type = "GENERATION",
  startTime = new Date(0),
  traceId = "trace-1",
  parentObservationId: string | null = null,
  metadata: unknown = null,
  name = id,
) => ({
  id,
  name,
  traceId,
  parentObservationId,
  type,
  startTime,
  input,
  output,
  metadata,
  inputTruncated: false,
  outputTruncated: false,
  metadataTruncated: false,
});

describe("prepareSessionTimelineObservations", () => {
  it("reconciles cumulative generation history across session traces", () => {
    const prepared = prepareSessionTimelineObservations([
      observation(
        "generation-1",
        [
          { role: "system", content: "Instructions" },
          { role: "user", content: "User 1" },
        ],
        "Assistant 1",
      ),
      observation(
        "generation-2",
        [
          { role: "system", content: "Instructions" },
          { role: "user", content: "User 1" },
          { role: "assistant", content: "Assistant 1" },
          { role: "user", content: "User 2" },
        ],
        "Assistant 2",
      ),
    ]);

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "User 2" }],
      },
      {
        role: "assistant",
        source: "output",
        parts: [{ type: "text", text: "Assistant 2" }],
      },
    ]);
  });

  it("preserves skipped and failed observations in their original positions", () => {
    const invalidInput = Object.defineProperty({}, "messages", {
      get() {
        throw new Error("Cannot parse input");
      },
    });
    const observations = [
      observation("generation-1", [], null),
      observation("tool", null, null, "TOOL"),
      observation("invalid", invalidInput, null),
    ];

    const prepared = prepareSessionTimelineObservations(observations);

    expect(prepared).toHaveLength(observations.length);
    expect(prepared.map(({ observation: item }) => item.id)).toEqual([
      "generation-1",
      "tool",
      "invalid",
    ]);
    expect(prepared[1]?.parsed).toBeNull();
    expect(prepared[1]?.processedMessages).toEqual({
      messages: [],
    });
    expect(prepared[2]?.parsed).toEqual({ type: "error" });
    expect(prepared[2]?.processedMessages).toEqual({
      messages: [],
    });
  });

  it("reconciles overlapping traces by observation timestamp", () => {
    const prepared = prepareSessionTimelineObservations([
      observation(
        "generation-1",
        [{ role: "user", content: "User 1" }],
        "Assistant 1",
        "GENERATION",
        new Date(0),
      ),
      observation(
        "generation-3",
        [
          { role: "user", content: "User 1" },
          { role: "assistant", content: "Assistant 1" },
          { role: "user", content: "User 2" },
          { role: "assistant", content: "Assistant 2" },
          { role: "user", content: "User 3" },
        ],
        "Assistant 3",
        "GENERATION",
        new Date(20),
      ),
      observation(
        "generation-2",
        [
          { role: "user", content: "User 1" },
          { role: "assistant", content: "Assistant 1" },
          { role: "user", content: "User 2" },
        ],
        "Assistant 2",
        "GENERATION",
        new Date(10),
      ),
    ]);

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "User 3" }] },
      { role: "assistant", parts: [{ type: "text", text: "Assistant 3" }] },
    ]);
    expect(prepared[2]?.processedMessages.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "User 2" }] },
      { role: "assistant", parts: [{ type: "text", text: "Assistant 2" }] },
    ]);
  });

  it("renders a parent output after its nested observations", () => {
    const prepared = prepareSessionTimelineObservations([
      observation(
        "parent",
        [{ role: "user", content: "Start" }],
        [{ role: "assistant", content: "Finished" }],
        "GENERATION",
        new Date(0),
      ),
      observation(
        "child",
        "Tool input",
        "Tool output",
        "TOOL",
        new Date(1),
        "trace-1",
        "parent",
      ),
    ]);

    expect(
      prepared.map(({ observation: item, phase }) => [item.id, phase]),
    ).toEqual([
      ["parent", "start"],
      ["child", "complete"],
      ["parent", "end"],
    ]);
    expect(prepared[0]?.processedMessages.messages).toMatchObject([
      { source: "input", parts: [{ type: "text", text: "Start" }] },
    ]);
    expect(prepared[2]?.processedMessages.messages).toMatchObject([
      { source: "output", parts: [{ type: "text", text: "Finished" }] },
    ]);
  });

  it("renders input inherited by nested observations only once", () => {
    const inheritedInput = [{ role: "user", content: "Build the dashboard" }];
    const prepared = prepareSessionTimelineObservations([
      observation("agent", inheritedInput, "Agent finished", "AGENT"),
      observation(
        "user-event",
        inheritedInput,
        null,
        "EVENT",
        new Date(1),
        "trace-1",
        "agent",
      ),
      observation(
        "generation",
        [...inheritedInput, { role: "user", content: "Use compact density" }],
        "Generation finished",
        "GENERATION",
        new Date(2),
        "trace-1",
        "agent",
      ),
    ]);

    const visibleText = prepared.flatMap(({ processedMessages }) =>
      processedMessages.messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      ),
    );
    expect(visibleText).toEqual([
      "Build the dashboard",
      "Use compact density",
      "Generation finished",
      "Agent finished",
    ]);
  });

  it("keeps duplicate nested output on the parent observation", () => {
    const input = { role: "user", content: "Review this comment" };
    const output = { role: "assistant", content: "PASS" };
    const prepared = prepareSessionTimelineObservations([
      observation("parent", input, output, "SPAN"),
      observation(
        "generation",
        input,
        output,
        "GENERATION",
        new Date(1),
        "trace-1",
        "parent",
      ),
    ]);

    const visibleTextByObservation = prepared.map((item) => ({
      id: item.observation.id,
      phase: item.phase,
      text: item.processedMessages.messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      ),
    }));

    expect(visibleTextByObservation).toEqual([
      { id: "parent", phase: "start", text: ["Review this comment"] },
      { id: "generation", phase: "complete", text: [] },
      { id: "parent", phase: "end", text: ["PASS"] },
    ]);
  });

  it("preserves unique nested output", () => {
    const prepared = prepareSessionTimelineObservations([
      observation("parent", "Question", "Parent answer", "SPAN"),
      observation(
        "generation",
        "Question",
        "Generation answer",
        "GENERATION",
        new Date(1),
        "trace-1",
        "parent",
      ),
    ]);

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      {
        source: "output",
        parts: [{ type: "text", text: "Generation answer" }],
      },
    ]);
  });

  it("preserves nested output that only matches ancestor input", () => {
    const repeatedAssistantMessage = {
      role: "assistant",
      content: "Shared message",
    };
    const prepared = prepareSessionTimelineObservations([
      observation(
        "parent",
        [repeatedAssistantMessage],
        "Parent answer",
        "SPAN",
      ),
      observation(
        "generation",
        "Child question",
        repeatedAssistantMessage,
        "GENERATION",
        new Date(1),
        "trace-1",
        "parent",
      ),
    ]);

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      {
        source: "input",
        parts: [{ type: "text", text: "Child question" }],
      },
      {
        source: "output",
        parts: [{ type: "text", text: "Shared message" }],
      },
    ]);
  });

  it("deduplicates large inherited input throughout a deeply nested trace", () => {
    const inheritedText = "large inherited input ".repeat(600);
    const inheritedInput = [{ role: "user", content: inheritedText }];
    const observations = [
      observation("level-0", inheritedInput, null, "AGENT"),
    ];
    for (let level = 1; level < 25; level += 1) {
      observations.push(
        observation(
          `level-${level}`,
          inheritedInput,
          null,
          "AGENT",
          new Date(level),
          "trace-1",
          `level-${level - 1}`,
        ),
      );
    }

    const prepared = prepareSessionTimelineObservations(observations);
    const visibleText = prepared.flatMap(({ processedMessages }) =>
      processedMessages.messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      ),
    );

    expect(inheritedText.length).toBeGreaterThan(10_000);
    expect(visibleText).toEqual([inheritedText]);
  });

  it("emits rolled-up tool calls as nested items before generation output", () => {
    const prepared = prepareSessionTimelineObservations([
      observation("generation", "Question", [
        {
          role: "assistant",
          content: "I will search.",
          tool_calls: [
            {
              id: "call-search",
              type: "function",
              function: {
                name: "search",
                arguments: JSON.stringify({ query: "dashboard" }),
              },
            },
          ],
        },
      ]),
    ]);

    expect(prepared.map((item) => item.type)).toEqual([
      "observation",
      "tool",
      "observation",
    ]);
    expect(prepared[0]).toMatchObject({
      type: "observation",
      phase: "start",
      ancestorObservationIds: [],
      nestedObservationCounts: { TOOL: 1 },
      processedMessages: {
        messages: [{ source: "input" }],
      },
    });
    expect(prepared[1]).toMatchObject({
      type: "tool",
      observation: { id: "generation" },
      phase: "complete",
      ancestorObservationIds: ["generation"],
      toolCall: {
        toolCallId: "call-search",
        toolName: "search",
        input: { query: "dashboard" },
      },
    });
    expect(prepared[2]).toMatchObject({
      type: "observation",
      phase: "end",
      ancestorObservationIds: [],
      nestedObservationCounts: { TOOL: 1 },
      processedMessages: {
        messages: [{ source: "output" }],
      },
    });
  });

  it("deduplicates a direct child tool by its unique name and input", () => {
    const prepared = prepareSessionTimelineObservations([
      observation("generation", null, [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "generation-call-id",
              type: "function",
              function: {
                name: "search",
                arguments: JSON.stringify({
                  query: "dashboard",
                  limit: 5,
                }),
              },
            },
          ],
        },
      ]),
      observation(
        "tool-observation",
        JSON.stringify({ limit: 5, query: "dashboard" }),
        "Found dashboard",
        "TOOL",
        new Date(1),
        "trace-1",
        "generation",
        { callID: "different-call-id" },
        "search",
      ),
    ]);

    expect(
      prepared.filter(
        (item) => item.type === "tool" && item.observation.id === "generation",
      ),
    ).toEqual([]);
  });

  it("keeps a rolled-up tool call when semantic child matching is ambiguous", () => {
    const toolCall = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "generation-call-id",
          type: "function",
          function: {
            name: "search",
            arguments: JSON.stringify({ query: "dashboard" }),
          },
        },
      ],
    };
    const prepared = prepareSessionTimelineObservations([
      observation("generation", null, [toolCall]),
      ...["first-tool", "second-tool"].map((id, index) =>
        observation(
          id,
          JSON.stringify({ query: "dashboard" }),
          "Found dashboard",
          "TOOL",
          new Date(index + 1),
          "trace-1",
          "generation",
          { callID: `${id}-call-id` },
          "search",
        ),
      ),
    ]);

    expect(
      prepared.filter(
        (item) => item.type === "tool" && item.observation.id === "generation",
      ),
    ).toHaveLength(1);
  });

  it("flattens multiple nesting levels while preserving sibling chronology", () => {
    const prepared = prepareSessionTimelineObservations([
      observation("root", "root input", "root output"),
      observation(
        "second-child",
        null,
        null,
        "EVENT",
        new Date(3),
        "trace-1",
        "root",
      ),
      observation(
        "first-child",
        "child input",
        "child output",
        "GENERATION",
        new Date(1),
        "trace-1",
        "root",
      ),
      observation(
        "grandchild",
        null,
        null,
        "TOOL",
        new Date(2),
        "trace-1",
        "first-child",
      ),
    ]);

    expect(
      prepared.map(({ observation: item, phase }) => `${item.id}:${phase}`),
    ).toEqual([
      "root:start",
      "first-child:start",
      "grandchild:complete",
      "first-child:end",
      "second-child:complete",
      "root:end",
    ]);
    expect(prepared[0]).toMatchObject({
      ancestorObservationIds: [],
      nestedObservationCounts: {
        GENERATION: 1,
        EVENT: 1,
        TOOL: 1,
      },
    });
    expect(prepared[1]).toMatchObject({
      ancestorObservationIds: ["root"],
      nestedObservationCounts: { TOOL: 1 },
    });
    expect(prepared[2]).toMatchObject({
      ancestorObservationIds: ["root", "first-child"],
      nestedObservationCounts: {},
    });
  });

  it("renders observations with filtered or missing parents as roots", () => {
    const prepared = prepareSessionTimelineObservations([
      observation(
        "orphan",
        null,
        null,
        "EVENT",
        new Date(0),
        "trace-1",
        "filtered-parent",
      ),
    ]);

    expect(prepared).toMatchObject([
      { observation: { id: "orphan" }, phase: "complete" },
    ]);
  });
});

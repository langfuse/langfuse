import { beforeEach, expect, it, vi } from "vitest";
import { assembleTranscript } from "@langfuse/shared/src/server/transcript/transcript";
import { loadTraceTranscript } from "@/src/features/events/server/loadTraceTranscript";
import { groupTranscriptMessages } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/groupTranscriptMessages";

const mocks = vi.hoisted(() => ({
  assemble: vi.fn(),
  observations: vi.fn(),
  root: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", async () => {
  const { normalizeSpanIO } =
    await import("@langfuse/shared/src/utils/normalized-io");
  return {
    MAX_OBSERVATIONS_PER_TRACE: 10000,
    orderObservations: (observations: unknown[]) => observations,
    assembleTranscript: mocks.assemble,
    getObservationsForTraceFromEventsTable: mocks.observations,
    getObservationByIdFromEventsTable: mocks.root,
    normalizeIO: ({ io }: { io: Parameters<typeof normalizeSpanIO>[0] }) =>
      normalizeSpanIO(io),
  };
});
const traceSource = {
  projectId: "project",
  traceId: "trace",
  timestamp: new Date(0),
};
const trace = { ...traceSource, context: "other" as const };
const filteredToolSession = {
  ...traceSource,
  context: "session",
  filter: [{ column: "type", type: "string", operator: "=", value: "TOOL" }],
} satisfies Parameters<typeof loadTraceTranscript>[0];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assemble.mockReset();
  mocks.observations.mockReset();
  mocks.root.mockReset();
});

it.each(
  ["ERROR", "WARNING"].flatMap((level) =>
    [null, "", []].map((output) => ({ level, output })),
  ),
)(
  "retains tool status with empty output without metadata recovery: %j",
  async ({ level, output }) => {
    const generation = {
      id: "generation",
      traceId: "trace",
      type: "GENERATION" as const,
      name: "generation",
      parentObservationId: null,
      nestingLevel: 0,
      startTime: new Date(0),
      endTime: new Date(1),
      input: [{ role: "user", content: "Run a tool" }],
      output: {
        role: "assistant",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "search", arguments: "{}" },
          },
        ],
      },
      metadata: {},
    };
    const tool = {
      ...generation,
      id: "tool",
      type: "TOOL" as const,
      name: "search",
      parentObservationId: generation.id,
      startTime: new Date(2),
      input: {},
      output,
      level,
      statusMessage: "Search unavailable",
      metadata: { callID: "conflicting" },
    };
    const observations = [generation, tool];
    const snapshot = structuredClone(observations);
    mocks.observations.mockResolvedValue({ observations, totalCount: 2 });
    mocks.assemble.mockImplementation(assembleTranscript);
    const result = await loadTraceTranscript(trace);
    expect(
      result.transcript?.threads[0]?.currentTurn.messages.find(
        (message) => message.observationId === "tool",
      ),
    ).toMatchObject({
      role: "tool",
      level,
      statusMessage: tool.statusMessage,
      parts: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: { type: "json", value: null },
          isError: level === "ERROR",
        },
      ],
    });
    expect(observations).toEqual(snapshot);
  },
);

it("matches parallel same-name TOOL results by payload ID, not metadata", async () => {
  const generation = {
    id: "generation",
    traceId: "trace",
    type: "GENERATION" as const,
    name: "generation",
    parentObservationId: null,
    nestingLevel: 0,
    startTime: new Date(0),
    endTime: new Date(1),
    input: [{ role: "user", content: "Run tools" }],
    output: {
      role: "assistant",
      tool_calls: ["call-a", "call-b"].map((id) => ({
        id,
        type: "function",
        function: { name: "search", arguments: "{}" },
      })),
    },
    metadata: {},
  };
  const tools = ["call-b", "call-a"].map((id, index) => ({
    ...generation,
    id: `tool-${index}`,
    type: "TOOL" as const,
    name: "search",
    parentObservationId: generation.id,
    startTime: new Date(index + 2),
    input: {},
    output: { role: "tool", tool_call_id: id, content: `result-${id}` },
    metadata: { callID: "conflicting", toolCallId: "conflicting" },
  }));
  const observations = [generation, ...tools];
  const snapshot = structuredClone(observations);
  mocks.observations.mockResolvedValue({ observations, totalCount: 3 });
  mocks.assemble.mockImplementation(assembleTranscript);

  const result = await loadTraceTranscript(trace);
  const messages = result.transcript!.threads[0]!.currentTurn.messages;
  expect(messages.filter((message) => message.role === "tool")).toHaveLength(2);
  for (const tool of tools) {
    expect(
      messages.find((message) => message.observationId === tool.id),
    ).toMatchObject({
      parts: [
        {
          type: "tool-result",
          toolCallId: tool.output.tool_call_id,
          output: { type: "text", value: tool.output.content },
        },
      ],
    });
  }
  expect(observations).toEqual(snapshot);
});

it.each(["callID", "toolCallId"])(
  "does not synthesize generation calls from metadata.%s",
  async (metadataKey) => {
    const generation = {
      id: "generation",
      traceId: "trace",
      type: "GENERATION" as const,
      name: "generation",
      parentObservationId: null,
      nestingLevel: 0,
      startTime: new Date(0),
      endTime: new Date(1),
      input: "Question",
      output: { answer: 42 },
      metadata: {},
    };
    const observations = [
      generation,
      {
        ...generation,
        id: "tool",
        type: "TOOL" as const,
        name: "search",
        parentObservationId: generation.id,
        output: { result: 42 },
        metadata: { [metadataKey]: "call-1" },
      },
    ];
    mocks.observations.mockResolvedValue({ observations, totalCount: 2 });
    mocks.assemble.mockImplementation(assembleTranscript);

    const result = await loadTraceTranscript(trace);
    expect(result.transcript).toEqual(assembleTranscript([generation]));
  },
);

it.each([
  { structureCount: 10000, contentCount: 1000, cutoff: false },
  { structureCount: 10001, contentCount: 1000, cutoff: true },
  { structureCount: 10000, contentCount: 1001, cutoff: true },
])(
  "merges capped I/O with structure and reports cutoff: %j",
  async ({ structureCount, contentCount, cutoff }) => {
    const span = { id: "span", type: "SPAN" };
    const generation = { id: "generation", type: "GENERATION" };
    const tool = { id: "tool", type: "TOOL" };
    const generationWithContent = {
      ...generation,
      input: "question",
      output: "answer",
    };
    mocks.observations
      .mockResolvedValueOnce({
        observations: [span, generation, tool],
        totalCount: structureCount,
      })
      .mockResolvedValueOnce({
        observations: [generationWithContent],
        totalCount: contentCount,
      });

    const result = await loadTraceTranscript(trace);

    expect(mocks.assemble).toHaveBeenCalledWith([span, generationWithContent]);
    expect(result.cutoff).toBe(cutoff);
    expect(mocks.observations).toHaveBeenNthCalledWith(1, traceSource);
    expect(mocks.observations).toHaveBeenNthCalledWith(2, {
      ...traceSource,
      selectIOAndMetadata: true,
      types: ["GENERATION", "TOOL"],
      limit: 1000,
    });
  },
);

it.each([
  { parentObservationId: null, isRootObservation: true },
  { parentObservationId: "", isRootObservation: undefined },
  { parentObservationId: "external-parent", isRootObservation: true },
])(
  "falls back to normalized root input/output with root provenance: %j",
  async ({ parentObservationId, isRootObservation }) => {
    const root = {
      id: "root",
      traceId: "trace",
      parentObservationId,
      isRootObservation,
      type: "SPAN",
      name: "Root",
      startTime: new Date(0),
      endTime: new Date(1000),
      input: "Question",
      output: "Answer",
      metadata: {},
    };
    mocks.assemble.mockReturnValue(null);
    mocks.observations.mockResolvedValue({
      observations: [root],
      totalCount: 1,
    });
    mocks.root.mockResolvedValue(root);

    const result = await loadTraceTranscript({
      ...trace,
      fallbackToRootIO: true,
    });

    expect(mocks.root).toHaveBeenCalledWith({
      projectId: "project",
      traceId: "trace",
      id: "root",
      startTime: new Date(0),
      fetchWithInputOutput: true,
    });
    expect(result.cutoff).toBe(false);
    expect(result.transcript?.threads).toHaveLength(1);
    expect(result.transcript?.threads[0]?.currentTurn).toMatchObject({
      nestingLevel: 0,
      observations: [{ id: "root", traceId: "trace" }],
      messages: [
        {
          role: "user",
          source: "input",
          parts: [{ type: "text", text: "Question" }],
          observationId: "root",
          traceId: "trace",
          startTime: root.startTime,
          endTime: root.endTime,
        },
        {
          role: "assistant",
          source: "output",
          parts: [{ type: "text", text: "Answer" }],
          observationId: "root",
          traceId: "trace",
          startTime: root.startTime,
          endTime: root.endTime,
        },
      ],
    });
  },
);

it("falls back to seeded JSON chat messages with an empty-string root parent", async () => {
  const root = {
    id: "t-seed-media-image-only",
    traceId: "seed-media-image-only",
    parentObservationId: "",
    startTime: new Date(0),
    endTime: null,
    input: JSON.stringify([
      {
        role: "user",
        content: [
          { type: "text", text: "Please analyze the seeded image attachment." },
          {
            type: "image_url",
            image_url: {
              url: "@@@langfuseMedia:type=image/png|id=seed-image|source=base64_data_uri@@@",
            },
          },
        ],
      },
    ]),
    output: JSON.stringify([{ role: "assistant", content: "Image analysis" }]),
    metadata: "{}",
  };
  mocks.assemble.mockReturnValue(null);
  mocks.observations.mockResolvedValue({ observations: [root], totalCount: 1 });
  mocks.root.mockResolvedValue(root);

  const result = await loadTraceTranscript({
    ...trace,
    traceId: root.traceId,
    fallbackToRootIO: true,
  });
  expect(result.transcript?.threads[0]?.currentTurn.messages).toMatchObject([
    {
      observationId: root.id,
      role: "user",
      parts: expect.arrayContaining([
        { type: "text", text: "Please analyze the seeded image attachment." },
      ]),
    },
    {
      observationId: root.id,
      role: "assistant",
      parts: [{ type: "text", text: "Image analysis" }],
    },
  ]);
});

it("ignores session filters outside session context without fetching root I/O", async () => {
  const original = { threads: [] };
  mocks.assemble.mockReturnValue(original);
  mocks.observations.mockResolvedValue({ observations: [], totalCount: 0 });
  // Exercise the runtime boundary even though typed callers cannot pass this combination.
  // @ts-expect-error Filters are only accepted in session context.
  const result = await loadTraceTranscript({
    ...filteredToolSession,
    context: "other",
    fallbackToRootIO: true,
  });
  expect(result.transcript).toBe(original);
  expect(mocks.root).not.toHaveBeenCalled();
});

it("leaves an empty transcript unchanged unless fallback is enabled", async () => {
  mocks.assemble.mockReturnValue(null);
  mocks.observations.mockResolvedValue({
    observations: [{ id: "root", parentObservationId: null }],
    totalCount: 1,
  });
  expect((await loadTraceTranscript(trace)).transcript).toBeNull();
  expect(mocks.root).not.toHaveBeenCalled();
});

it("leaves the transcript empty when no root was found", async () => {
  mocks.assemble.mockReturnValue(null);
  mocks.observations.mockResolvedValue({ observations: [], totalCount: 0 });
  expect(
    (await loadTraceTranscript({ ...trace, fallbackToRootIO: true }))
      .transcript,
  ).toBeNull();
  expect(mocks.root).not.toHaveBeenCalled();
});

it("leaves the transcript empty when the root has no input/output", async () => {
  mocks.assemble.mockReturnValue(null);
  mocks.observations.mockResolvedValue({
    observations: [
      { id: "root", parentObservationId: null, startTime: new Date(0) },
    ],
    totalCount: 1,
  });
  mocks.root.mockResolvedValue({ input: null, output: null, metadata: {} });
  expect(
    (await loadTraceTranscript({ ...trace, fallbackToRootIO: true }))
      .transcript,
  ).toBeNull();
});

it("loads and normalizes matching span I/O without assembly or ancestors", async () => {
  const message = {
    role: "assistant" as const,
    source: "output" as const,
    parts: [{ type: "text" as const, text: "Response" }],
    observationId: "match",
    traceId: "trace",
    startTime: new Date(0),
    endTime: new Date(1),
  };
  mocks.observations.mockResolvedValue({
    observations: [
      {
        id: "match",
        type: "SPAN",
        startTime: new Date(0),
        endTime: new Date(1),
        input: null,
        output: "Response",
        metadata: {},
      },
    ],
    totalCount: 1,
  });
  const filter = [
    {
      column: "name",
      type: "string" as const,
      operator: "=" as const,
      value: "child",
    },
  ];
  const result = await loadTraceTranscript({
    ...trace,
    context: "session",
    filter,
  });
  expect(mocks.observations).toHaveBeenCalledExactlyOnceWith({
    ...traceSource,
    filter,
    selectIOAndMetadata: true,
    limit: 1000,
  });
  expect(mocks.assemble).not.toHaveBeenCalled();
  expect(result.transcript?.threads).toEqual([
    {
      conversationHistory: [],
      currentTurn: {
        nestingLevel: 0,
        observations: [{ id: "match", traceId: "trace" }],
        messages: [message],
      },
    },
  ]);
});

it.each([
  {
    input: [{ type: "text", text: "customer-1" }],
    output: "Order 123 is ready.",
    expectedOutput: { type: "text", value: "Order 123 is ready." },
  },
  {
    input: JSON.stringify([{ type: "text", text: "customer-1" }]),
    output: "Order 123 is ready.",
    expectedOutput: { type: "text", value: "Order 123 is ready." },
  },
  {
    input: { customerId: "customer-1" },
    output: { orders: ["Order 123 is ready."] },
    expectedOutput: {
      type: "json",
      value: { orders: ["Order 123 is ready."] },
    },
  },
  {
    input: { customerId: "customer-1" },
    output: {
      type: "tool-result",
      output: "Order 123 is ready.",
    },
    expectedOutput: { type: "text", value: "Order 123 is ready." },
  },
  ...["image/png", "application/pdf"].map((mediaType) => ({
    input: { customerId: "customer-1" },
    output: `@@@langfuseMedia:type=${mediaType}|id=tool-media|source=base64@@@`,
    expectedOutput: {
      type: "content",
      value: [expect.objectContaining({ type: "file", mediaType })],
    },
  })),
])(
  "renders tools-only observations as one paired tool row: %j",
  async ({ input, output, expectedOutput }) => {
    const tool = {
      id: "tool",
      type: "TOOL",
      name: "findUserOrders",
      startTime: new Date(0),
      endTime: new Date(1),
      input,
      output,
      metadata: {},
      level: "ERROR",
      statusMessage: "Tool failed",
    };
    const snapshot = structuredClone(tool);
    mocks.observations.mockResolvedValue({
      observations: [tool],
      totalCount: 1,
    });

    const result = await loadTraceTranscript(filteredToolSession);

    expect(mocks.assemble).not.toHaveBeenCalled();
    const messages = result.transcript!.threads[0]!.currentTurn.messages;
    expect(groupTranscriptMessages(messages)).toEqual([
      expect.objectContaining({
        type: "tool",
        message: expect.objectContaining({
          observationId: tool.id,
          traceId: trace.traceId,
          startTime: tool.startTime,
          endTime: tool.endTime,
          level: tool.level,
          statusMessage: tool.statusMessage,
        }),
        call: expect.objectContaining({
          toolCallId: tool.id,
          toolName: tool.name,
          input: typeof input === "string" ? JSON.parse(input) : input,
        }),
        result: expect.objectContaining({
          toolCallId: tool.id,
          toolName: tool.name,
          output: expectedOutput,
          isError: true,
        }),
      }),
    ]);
    expect(tool).toEqual(snapshot);
  },
);

it("preserves provider IDs and pairs nested tool results", async () => {
  const ids = ["call-1", "call-2"];
  const output = [
    {
      role: "assistant",
      tool_calls: ids.map((id) => ({
        id,
        type: "function",
        function: { name: "search", arguments: "{}" },
      })),
    },
    ...ids.map((id) => ({
      role: "tool",
      tool_call_id: id,
      content: `Result ${id}`,
    })),
  ];
  mocks.observations.mockResolvedValue({
    observations: [
      {
        id: "outer",
        type: "TOOL",
        name: "agent",
        input: {},
        output,
        level: "ERROR",
        startTime: new Date(0),
        endTime: new Date(1),
        metadata: {},
      },
    ],
    totalCount: 1,
  });

  const result = await loadTraceTranscript(filteredToolSession);
  const messages = result.transcript!.threads[0]!.currentTurn.messages;
  expect(groupTranscriptMessages(messages)).toEqual([
    expect.objectContaining({
      type: "tool",
      call: expect.objectContaining({
        toolCallId: "outer",
        toolName: "agent",
      }),
      result: null,
    }),
    ...ids.map((id) =>
      expect.objectContaining({
        type: "tool",
        call: expect.objectContaining({ toolCallId: id, toolName: "search" }),
        result: expect.objectContaining({
          toolCallId: id,
          output: { type: "text", value: `Result ${id}` },
        }),
      }),
    ),
  ]);
});

it.each([null, ""])(
  "preserves input for an unnamed filtered tool: %j",
  async (name) => {
    const input = { customerId: "customer-1" };
    mocks.observations.mockResolvedValue({
      observations: [
        {
          id: "tool",
          type: "TOOL",
          name,
          input,
          output: "Done",
          startTime: new Date(0),
          endTime: new Date(1),
          metadata: {},
        },
      ],
      totalCount: 1,
    });
    const result = await loadTraceTranscript(filteredToolSession);
    expect(result.transcript?.threads[0]?.currentTurn.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "input",
          parts: [{ type: "data", value: input }],
        }),
        expect.objectContaining({
          source: "output",
          parts: [
            expect.objectContaining({
              type: "tool-result",
              output: { type: "text", value: "Done" },
            }),
          ],
        }),
      ]),
    );
  },
);

it("does not restore unmatched root I/O when no observations match", async () => {
  mocks.assemble.mockReturnValue(null);
  mocks.observations.mockResolvedValue({ observations: [], totalCount: 0 });
  const result = await loadTraceTranscript({
    ...trace,
    fallbackToRootIO: true,
    context: "session",
    filter: [
      { column: "level", type: "string", operator: "=", value: "ERROR" },
    ],
  });
  expect(result.transcript).toBeNull();
  expect(mocks.root).not.toHaveBeenCalled();
});

it("bypasses assembly for trace-only filters and keeps each observation's full I/O in chronological order", async () => {
  const observations = [2, 1].map((index) => ({
    id: `span-${index}`,
    type: "SPAN",
    startTime: new Date(index),
    endTime: new Date(index + 1),
    input: [{ role: "user", content: "Repeated history" }],
    output: `Answer ${index}`,
    metadata: {},
  }));
  mocks.observations.mockResolvedValue({ observations, totalCount: 1001 });
  const result = await loadTraceTranscript({
    ...trace,
    fallbackToRootIO: true,
    context: "session",
    filter: [
      { column: "traceName", type: "string", operator: "=", value: "chat" },
    ],
  });
  expect(mocks.observations).toHaveBeenCalledExactlyOnceWith({
    ...traceSource,
    fallbackToRootIO: true,
    filter: [],
    selectIOAndMetadata: true,
    limit: 1000,
  });
  expect(mocks.assemble).not.toHaveBeenCalled();
  expect(mocks.root).not.toHaveBeenCalled();
  expect(result.cutoff).toBe(true);
  expect(
    result.transcript?.threads.map((thread) => ({
      history: thread.conversationHistory,
      id: thread.currentTurn.observations[0]?.id,
      messages: thread.currentTurn.messages.map((message) => message.parts),
    })),
  ).toEqual(
    [1, 2].map((index) => ({
      history: [],
      id: `span-${index}`,
      messages: [
        [{ type: "text", text: "Repeated history" }],
        [{ type: "text", text: `Answer ${index}` }],
      ],
    })),
  );
});

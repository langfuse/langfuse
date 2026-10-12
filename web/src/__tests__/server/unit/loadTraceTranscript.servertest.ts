import { beforeEach, expect, it, vi } from "vitest";
import { assembleTranscript } from "@langfuse/shared/src/server/transcript/transcript";
import { loadTraceTranscript } from "@/src/features/events/server/loadTraceTranscript";

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
const trace = {
  projectId: "project",
  traceId: "trace",
  timestamp: new Date(0),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assemble.mockReset();
  mocks.observations.mockReset();
  mocks.root.mockReset();
});

it.each(["ERROR", "WARNING"] as const)(
  "retains %s tool status with null output without metadata recovery",
  async (level) => {
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
      output: null,
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
          output: null,
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
          output: tool.output.content,
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
    expect(mocks.observations).toHaveBeenNthCalledWith(1, trace);
    expect(mocks.observations).toHaveBeenNthCalledWith(2, {
      ...trace,
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

it("returns the shared transcript unchanged without fetching root I/O", async () => {
  const original = { threads: [] };
  mocks.assemble.mockReturnValue(original);
  mocks.observations.mockResolvedValue({ observations: [], totalCount: 0 });
  const result = await loadTraceTranscript({
    ...trace,
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

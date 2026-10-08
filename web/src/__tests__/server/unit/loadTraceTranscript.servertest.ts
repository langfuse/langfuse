import { beforeEach, expect, it, vi } from "vitest";
import type { Transcript } from "@langfuse/shared/src/server";
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
function fixture(
  names = ["search", "weather"],
  responses = ["weather", "search"],
) {
  const provenance = {
    traceId: "trace",
    startTime: new Date(0),
    endTime: null,
  };
  const transcript: Transcript = {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [],
          messages: [
            {
              ...provenance,
              observationId: "generation",
              role: "assistant",
              source: "output",
              parts: names.map((toolName, index) => ({
                type: "tool-call",
                toolName,
                toolCallId: `call-${index}`,
                input: {},
              })),
            },
            ...responses.map((name, index) => ({
              ...provenance,
              observationId: `tool-${index}`,
              role: "tool" as const,
              source: "output" as const,
              parts: [{ type: "text" as const, text: name }],
            })),
          ],
        },
      },
    ],
  };
  mocks.assemble.mockReturnValue(transcript);
  mocks.observations.mockResolvedValue({
    observations: responses.map((name, index) => ({
      ...provenance,
      id: `tool-${index}`,
      type: "TOOL",
      name,
      parentObservationId: null,
      input: null,
      output: name,
      metadata: {},
    })),
    totalCount: responses.length,
  });
  return transcript;
}
beforeEach(() => vi.resetAllMocks());

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

it.each([
  { structureCount: 10000, contentCount: 1000, cutoff: false },
  { structureCount: 10001, contentCount: 1000, cutoff: true },
  { structureCount: 10000, contentCount: 1001, cutoff: true },
])(
  "merges capped I/O with structure and reports cutoff: %j",
  async ({ structureCount, contentCount, cutoff }) => {
    fixture();
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

it("does not fetch root I/O when an existing transcript is available", async () => {
  const original = fixture();
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
it("leaves mixed text/data responses unchanged", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.currentTurn.messages[1]!.parts = [
    { type: "text", text: "result" },
    { type: "data", value: { answer: 42 } },
  ];
  const snapshot = structuredClone(original);

  expect(
    (await loadTraceTranscript({ ...trace, recoverToolResponses: true }))
      .transcript,
  ).toEqual(snapshot);
  expect(original).toEqual(snapshot);
});

it("preserves explicit results that conflict with TOOL metadata", async () => {
  const observations = [
    {
      id: "generation",
      traceId: "trace",
      type: "GENERATION",
      name: "generation",
      parentObservationId: null,
      startTime: new Date(0),
      endTime: new Date(1),
      input: null,
      output: [
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "explicit",
              toolName: "search",
              input: {},
            },
          ],
        },
      ],
      metadata: {},
    },
    {
      id: "tool",
      traceId: "trace",
      type: "TOOL",
      name: "search",
      parentObservationId: "generation",
      startTime: new Date(2),
      endTime: new Date(3),
      input: {},
      output: { role: "tool", tool_call_id: "explicit", content: "result" },
      metadata: { callID: "conflicting" },
    },
  ];
  const snapshot = structuredClone(observations);
  mocks.observations.mockResolvedValue({ observations, totalCount: 2 });
  mocks.assemble.mockImplementation(assembleTranscript);

  const result = await loadTraceTranscript({
    ...trace,
    recoverToolResponses: true,
  });

  expect(mocks.assemble).toHaveBeenCalledWith(observations);
  const parts = result.transcript!.threads[0]!.currentTurn.messages.flatMap(
    (message) => message.parts,
  );
  expect(parts.filter((part) => part.type === "tool-result")).toMatchObject([
    { toolCallId: "explicit", output: "result" },
  ]);
  expect(
    parts.some(
      (part) => part.type === "tool-call" && part.toolCallId === "conflicting",
    ),
  ).toBe(false);
  expect(observations).toEqual(snapshot);
});

it.each([
  "missing-generation-call",
  "existing-generation-call",
  "existing-tool-result",
])(
  "pairs TOOL metadata call IDs through real assembly: %s",
  async (scenario) => {
    const input = { code: "return 42" };
    const output = { title: "Result", output: "42" };
    const observations = [
      {
        id: "generation",
        traceId: "trace",
        type: "GENERATION" as const,
        name: "generation",
        parentObservationId: null,
        startTime: new Date(0),
        endTime: new Date(1),
        input: [{ role: "user", content: "Run a tool" }],
        output:
          scenario === "existing-generation-call"
            ? [
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "call-1",
                      toolName: "execute",
                      input,
                    },
                  ],
                },
              ]
            : [{ role: "assistant", content: "" }],
        metadata: {},
      },
      {
        id: "tool",
        traceId: "trace",
        type: "TOOL" as const,
        name: "execute",
        parentObservationId: "generation",
        startTime: new Date(2),
        endTime: new Date(3),
        input,
        output:
          scenario === "existing-tool-result"
            ? {
                role: "tool",
                name: "execute",
                tool_call_id: "call-1",
                content: output,
              }
            : output,
        metadata: { callID: "call-1" },
      },
    ];
    const snapshot = structuredClone(observations);
    mocks.assemble.mockImplementation(assembleTranscript);
    mocks.observations.mockResolvedValue({
      observations,
      totalCount: observations.length,
    });
    const result = await loadTraceTranscript({
      ...trace,
      recoverToolResponses: true,
    });
    const messages = result.transcript!.threads[0]!.currentTurn.messages;
    expect(
      messages
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "tool-call"),
    ).toMatchObject([
      { type: "tool-call", toolCallId: "call-1", toolName: "execute", input },
    ]);
    expect(
      messages.find((message) => message.observationId === "tool"),
    ).toMatchObject({
      role: "tool",
      source: "output",
      observationId: "tool",
      startTime: new Date(2),
      endTime: new Date(3),
      parts: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "execute",
          output,
        },
      ],
    });
    expect(observations).toEqual(snapshot);
    expect((await loadTraceTranscript(trace)).transcript).toEqual(
      assembleTranscript(
        observations.map((observation) => ({
          ...observation,
          nestingLevel: 0,
        })),
      ),
    );
  },
);

it.each(["duplicate-call-id", "different-trace", "non-generation-parent"])(
  "does not reconstruct ambiguous TOOL metadata: %s",
  async (scenario) => {
    const original = fixture(["execute"], ["execute"]);
    const generation = {
      id: "generation",
      traceId: "trace",
      type: "GENERATION",
      name: "generation",
      parentObservationId: null,
      startTime: new Date(0),
      endTime: null,
      input: null,
      output: null,
      metadata: {},
    };
    const tool = {
      ...generation,
      id: "tool",
      type: "TOOL",
      name: "execute",
      parentObservationId: "generation",
      metadata: { callID: "call-1" },
      input: { code: "return 42" },
      output: { answer: 42 },
    };
    if (scenario === "different-trace") generation.traceId = "other-trace";
    if (scenario === "non-generation-parent") generation.type = "SPAN";
    const observations =
      scenario === "duplicate-call-id"
        ? [generation, tool, { ...tool, id: "tool-duplicate" }]
        : [generation, tool];
    mocks.observations.mockResolvedValue({
      observations,
      totalCount: observations.length,
    });
    await loadTraceTranscript({ ...trace, recoverToolResponses: true });
    expect(mocks.assemble).toHaveBeenCalledWith(observations);
    expect(original.threads[0]!.currentTurn.messages[1]!.parts[0]?.type).toBe(
      "text",
    );
  },
);
it("opts into provenance-based reverse multi-call responses without mutating assembly", async () => {
  const original = fixture();
  const snapshot = structuredClone(original);
  const result = await loadTraceTranscript({
    ...trace,
    recoverToolResponses: true,
  });
  expect(
    result.transcript?.threads[0]?.currentTurn.messages
      .slice(1)
      .map((m) => m.parts),
  ).toEqual([
    [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "weather",
        output: "weather",
      },
    ],
    [
      {
        type: "tool-result",
        toolCallId: "call-0",
        toolName: "search",
        output: "search",
      },
    ],
  ]);
  expect(original).toEqual(snapshot);
  expect(result.transcript?.threads[0]?.currentTurn.messages[1]).toMatchObject({
    observationId: "tool-0",
    traceId: "trace",
    source: "output",
    startTime: new Date(0),
    endTime: null,
  });
  expect(mocks.observations).toHaveBeenCalledTimes(2);
});
it("leaves the default transcript unchanged", async () => {
  const original = fixture();
  expect((await loadTraceTranscript(trace)).transcript).toBe(original);
});
it.each([
  { output: { answer: 42 } },
  { output: [{ answer: 42 }] },
  { output: null },
])(
  "pairs JSON-only TOOL output using observation provenance: %j",
  async ({ output }) => {
    const original = fixture(["search"], ["search"]);
    original.threads[0]!.currentTurn.messages[1]!.parts = [
      { type: "data", value: output },
    ];
    const snapshot = structuredClone(original);
    const result = await loadTraceTranscript({
      ...trace,
      recoverToolResponses: true,
    });
    expect(
      result.transcript?.threads[0]?.currentTurn.messages[1]?.parts,
    ).toEqual([
      { type: "tool-result", toolCallId: "call-0", toolName: "search", output },
    ]);
    expect(original).toEqual(snapshot);
    expect((await loadTraceTranscript(trace)).transcript).toBe(original);
  },
);

it("preserves multiple JSON parts as an output array", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.currentTurn.messages[1]!.parts = [
    { type: "data", value: { answer: 42 } },
    { type: "data", value: { confidence: 0.9 } },
  ];
  const result = await loadTraceTranscript({
    ...trace,
    recoverToolResponses: true,
  });
  expect(result.transcript?.threads[0]?.currentTurn.messages[1]?.parts).toEqual(
    [
      {
        type: "tool-result",
        toolCallId: "call-0",
        toolName: "search",
        output: [{ answer: 42 }, { confidence: 0.9 }],
      },
    ],
  );
});

it.each([
  "input",
  "wrong-observation-type",
  "ambiguous-call",
  "explicit-result",
])("does not infer JSON tool results for %s", async (scenario) => {
  const original = fixture(["search"], ["search"]);
  const messages = original.threads[0]!.currentTurn.messages;
  messages[1]!.parts = [{ type: "data", value: { answer: 42 } }];
  if (scenario === "input") messages[1]!.source = "input";
  if (scenario === "wrong-observation-type") {
    mocks.observations.mockResolvedValue({
      observations: [
        { id: "tool-0", traceId: "trace", type: "GENERATION", name: "search" },
      ],
      totalCount: 1,
    });
  }
  if (scenario === "ambiguous-call") {
    messages[0]!.parts.push({
      type: "tool-call",
      toolCallId: "other",
      toolName: "search",
      input: {},
    });
  }
  if (scenario === "explicit-result") {
    messages.push({
      ...messages[1]!,
      parts: [
        { type: "tool-result", toolCallId: "call-0", output: "explicit" },
      ],
    });
  }
  const snapshot = structuredClone(original);
  const result = await loadTraceTranscript({
    ...trace,
    recoverToolResponses: true,
  });
  expect(result.transcript).toEqual(snapshot);
  expect(original).toEqual(snapshot);
});
it.each([
  { names: ["search", "search"], responses: ["search"] },
  { names: ["search"], responses: ["search", "search"] },
])(
  "leaves ambiguous names and duplicate responses separate: %j",
  async ({ names, responses }) => {
    const original = fixture(names, responses);
    expect(
      (await loadTraceTranscript({ ...trace, recoverToolResponses: true }))
        .transcript,
    ).toEqual(original);
  },
);
it("preserves explicit result precedence", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.currentTurn.messages.push({
    ...original.threads[0]!.currentTurn.messages[1]!,
    parts: [{ type: "tool-result", toolCallId: "call-0", output: "explicit" }],
  });
  expect(
    (await loadTraceTranscript({ ...trace, recoverToolResponses: true }))
      .transcript,
  ).toEqual(original);
});
it("requires exact response trace provenance even for adjacent single calls", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.currentTurn.messages[1]!.traceId = "other-trace";
  expect(
    (await loadTraceTranscript({ ...trace, recoverToolResponses: true }))
      .transcript,
  ).toEqual(original);
});
it.each(["missing-observation", "conflicting-name", "reused-id"])(
  "does not infer %s",
  async (scenario) => {
    const original = fixture(["search"], ["search"]);
    const messages = original.threads[0]!.currentTurn.messages;
    if (scenario === "missing-observation")
      messages[1]!.observationId = "missing";
    if (scenario === "conflicting-name") {
      const part = messages[0]!.parts[0]!;
      if (part.type === "tool-call") part.toolName = "weather";
    }
    if (scenario === "reused-id")
      messages[0]!.parts.push({ ...messages[0]!.parts[0]! });
    expect(
      (await loadTraceTranscript({ ...trace, recoverToolResponses: true }))
        .transcript,
    ).toEqual(original);
  },
);
it("leaves history untouched when it shares current-turn message references", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.conversationHistory =
    original.threads[0]!.currentTurn.messages;
  const result = await loadTraceTranscript({
    ...trace,
    recoverToolResponses: true,
  });
  expect(
    result.transcript?.threads[0]?.conversationHistory[1]?.parts[0]?.type,
  ).toBe("text");
  expect(
    result.transcript?.threads[0]?.currentTurn.messages[1]?.parts[0]?.type,
  ).toBe("tool-result");
});

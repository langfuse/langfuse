import { beforeEach, expect, it, vi } from "vitest";
import type { Transcript } from "@langfuse/shared/src/server";
import { loadTraceTranscript } from "@/src/features/events/server/loadTraceTranscript";

const mocks = vi.hoisted(() => ({ assemble: vi.fn(), observations: vi.fn() }));
vi.mock("@langfuse/shared/src/server", () => ({
  MAX_OBSERVATIONS_PER_TRACE: 10000,
  orderObservations: (observations: unknown[]) => observations,
  assembleTranscript: mocks.assemble,
  getObservationsForTraceFromEventsTable: mocks.observations,
}));
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
beforeEach(() => vi.clearAllMocks());
it("opts into provenance-based reverse multi-call responses without mutating assembly", async () => {
  const original = fixture();
  const snapshot = structuredClone(original);
  const result = await loadTraceTranscript({
    ...trace,
    pairTextToolResponses: true,
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
  { names: ["search", "search"], responses: ["search"] },
  { names: ["search"], responses: ["search", "search"] },
])(
  "leaves ambiguous names and duplicate responses separate: %j",
  async ({ names, responses }) => {
    const original = fixture(names, responses);
    expect(
      (await loadTraceTranscript({ ...trace, pairTextToolResponses: true }))
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
    (await loadTraceTranscript({ ...trace, pairTextToolResponses: true }))
      .transcript,
  ).toEqual(original);
});
it("requires exact response trace provenance even for adjacent single calls", async () => {
  const original = fixture(["search"], ["search"]);
  original.threads[0]!.currentTurn.messages[1]!.traceId = "other-trace";
  expect(
    (await loadTraceTranscript({ ...trace, pairTextToolResponses: true }))
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
      (await loadTraceTranscript({ ...trace, pairTextToolResponses: true }))
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
    pairTextToolResponses: true,
  });
  expect(
    result.transcript?.threads[0]?.conversationHistory[1]?.parts[0]?.type,
  ).toBe("text");
  expect(
    result.transcript?.threads[0]?.currentTurn.messages[1]?.parts[0]?.type,
  ).toBe("tool-result");
});

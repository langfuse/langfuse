import type { TranscriptFixture } from "../fixture-types";

// Tool execution is recorded only as a TOOL observation, not a model tool call.
export const standaloneToolObservationFixture = {
  name: "Standalone tool execution without a generation tool call",
  description:
    "The generation contains only text. A subsequent TOOL observation has input and output but no matching generation tool call, so its result is omitted from the transcript.",
  observations: [
    {
      project_id: "transcript-fixture-project",
      trace_id: "standalone-tool-trace",
      id: "standalone-generation",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Order assistant",
      start_time: "2026-01-01T12:00:00.000Z",
      end_time: "2026-01-01T12:00:01.000Z",
      input: JSON.stringify([{ role: "user", content: "Find my orders." }]),
      output: JSON.stringify({
        role: "assistant",
        content: "I'll look up your orders.",
      }),
    },
    {
      project_id: "transcript-fixture-project",
      trace_id: "standalone-tool-trace",
      id: "standalone-tool",
      parent_observation_id: "standalone-generation",
      type: "TOOL",
      name: "findUserOrders",
      start_time: "2026-01-01T12:00:02.000Z",
      end_time: "2026-01-01T12:00:03.000Z",
      input: JSON.stringify({ customerId: "customer-1" }),
      output: JSON.stringify({
        content: [{ type: "text", text: "Order 123 is ready." }],
        isError: false,
      }),
    },
  ],
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Find my orders." }],
              source: "input",
              observationId: "standalone-generation",
              startTime: new Date("2026-01-01T12:00:00.000Z"),
              endTime: new Date("2026-01-01T12:00:01.000Z"),
              traceId: "standalone-tool-trace",
            },
            {
              role: "assistant",
              parts: [{ type: "text", text: "I'll look up your orders." }],
              source: "output",
              observationId: "standalone-generation",
              startTime: new Date("2026-01-01T12:00:00.000Z"),
              endTime: new Date("2026-01-01T12:00:01.000Z"),
              traceId: "standalone-tool-trace",
            },
          ],
          observations: [
            { id: "standalone-generation", traceId: "standalone-tool-trace" },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;

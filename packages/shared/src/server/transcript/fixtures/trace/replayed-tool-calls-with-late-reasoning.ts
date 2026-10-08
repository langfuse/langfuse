import type { TranscriptFixture } from "../fixture-types";
import type { JsonValue } from "../../../../utils/normalized-io/types";

// Entirely invented data: only the observation and message shapes represent
// the regression. No text, identifiers, dates, or metadata come from a trace.
const traceId = "synthetic-block-trace";
const base = { trace_id: traceId, project_id: "synthetic-block-project" };
const systems = [
  "Arrange colored blocks.",
  "Use the available inspection tools.",
  "Keep the arrangement within the tray.",
];
const request = "Place the blue block next to the yellow block.";
const context = "The tray has three empty slots.";
const reasoning = "I will inspect the blocks and tray before placing anything.";
const initial = [
  ...systems.map((content) => ({ role: "system", content })),
  { role: "user", content: request },
];
const injectedContext = { role: "user", content: context };
const calls: { id: string; name: string; input: JsonValue }[] = [
  {
    id: "synthetic-block-call",
    name: "inspect_blocks",
    input: { color: "blue" },
  },
  { id: "synthetic-tray-call", name: "inspect_tray", input: { row: 1 } },
];
const results: JsonValue[] = [
  { colors: ["blue", "yellow"] },
  { emptySlots: 3 },
];
const replay = [
  ...initial,
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: reasoning },
      ...calls.map((call) => ({
        type: "tool-call",
        toolCallId: call.id,
        toolName: call.name,
        input: call.input,
        providerOptions: { synthetic: { replayMarker: "replayed" } },
      })),
    ],
  },
  {
    role: "tool",
    content: calls.map((call, index) => ({
      type: "tool-result",
      toolCallId: call.id,
      toolName: call.name,
      output: { type: "json", value: results[index] },
    })),
  },
  injectedContext,
];
const time = (second: number) =>
  `2030-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;
const provenance = (id: string, start: number, end: number) => ({
  observationId: id,
  traceId,
  startTime: new Date(time(start)),
  endTime: new Date(time(end)),
});

export const replayedToolCallsWithLateReasoningFixture = {
  name: "Replayed tool calls with late reasoning and relocated context",
  description:
    "A second generation replays two calls with added reasoning and provider metadata, then moves the injected user context to the end. One depth-two thread preserves the reasoning at its recorded source without repeating calls or results.",
  observations: [
    {
      ...base,
      id: "synthetic-block-root",
      parent_observation_id: null,
      type: "SPAN",
      name: "Block arrangement",
      start_time: time(0),
      end_time: time(9),
      input: null,
      output: null,
    },
    {
      ...base,
      id: "synthetic-block-agent",
      parent_observation_id: "synthetic-block-root",
      type: "AGENT",
      name: "Block arranger",
      start_time: time(1),
      end_time: time(8),
      input: JSON.stringify([...initial, injectedContext]),
      output: JSON.stringify(replay),
    },
    {
      ...base,
      id: "synthetic-block-generation-one",
      parent_observation_id: "synthetic-block-agent",
      type: "GENERATION",
      name: "Inspect arrangement",
      start_time: time(2),
      end_time: time(3),
      input: JSON.stringify({ messages: [...initial, injectedContext] }),
      output: JSON.stringify({
        role: "assistant",
        content: null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      }),
    },
    ...calls.map((call, index) => ({
      ...base,
      id: `synthetic-block-tool-${index + 1}`,
      parent_observation_id: "synthetic-block-generation-one",
      type: "TOOL" as const,
      name: call.name,
      start_time: time(4 + index),
      end_time: time(5 + index),
      input: JSON.stringify(call.input),
      output: JSON.stringify(results[index]),
    })),
    {
      ...base,
      id: "synthetic-block-generation-two",
      parent_observation_id: "synthetic-block-agent",
      type: "GENERATION",
      name: "Continue arrangement",
      start_time: time(7),
      end_time: time(8),
      input: JSON.stringify({ messages: replay }),
      output: null,
    },
  ],
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 2,
          messages: [
            ...systems.map((text) => ({
              role: "system" as const,
              parts: [{ type: "text" as const, text }],
              source: "input" as const,
              ...provenance("synthetic-block-generation-one", 2, 3),
            })),
            ...[request, context].map((text) => ({
              role: "user" as const,
              parts: [{ type: "text" as const, text }],
              source: "input" as const,
              ...provenance("synthetic-block-generation-one", 2, 3),
            })),
            {
              role: "assistant",
              parts: calls.map((call) => ({
                type: "tool-call" as const,
                toolCallId: call.id,
                toolName: call.name,
                input: call.input,
                toolType: "function",
              })),
              source: "output",
              ...provenance("synthetic-block-generation-one", 2, 3),
            },
            ...results.map((value, index) => ({
              role: "tool" as const,
              parts: [{ type: "data" as const, value }],
              source: "output" as const,
              ...provenance(
                `synthetic-block-tool-${index + 1}`,
                4 + index,
                5 + index,
              ),
            })),
            {
              role: "assistant",
              parts: [
                {
                  type: "reasoning",
                  content: { kind: "text", text: reasoning },
                },
              ],
              source: "input",
              ...provenance("synthetic-block-generation-two", 7, 8),
            },
          ],
          observations: [
            "synthetic-block-generation-one",
            "synthetic-block-tool-1",
            "synthetic-block-tool-2",
            "synthetic-block-generation-two",
          ].map((id) => ({ id, traceId })),
        },
      },
    ],
  },
} satisfies TranscriptFixture;

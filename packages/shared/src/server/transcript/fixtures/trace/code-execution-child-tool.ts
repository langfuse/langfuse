import type { TranscriptFixture } from "../fixture-types";
import type { ThreadMessage } from "../../types";

const traceId = "code-execution";
const startTime = new Date("2026-01-01T12:00:00.000Z");
const endTime = new Date("2026-01-01T12:00:01.000Z");
const request = { role: "user", content: "Search the docs." };
const executeCall = {
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId: "execute-1",
      toolName: "execute",
      input: { code: "search('docs')" },
    },
  ],
};
const executeResult = {
  role: "tool",
  content: [
    {
      type: "tool-result",
      toolCallId: "execute-1",
      toolName: "execute",
      output: "done",
    },
  ],
};
const message = (
  observationId: string,
  role: ThreadMessage["role"],
  source: ThreadMessage["source"],
  parts: ThreadMessage["parts"],
): ThreadMessage => ({
  observationId,
  traceId,
  startTime,
  endTime,
  role,
  source,
  parts,
});

export const codeExecutionChildToolFixture = {
  name: "Code execution exposes a child tool omitted from model history",
  description:
    "execute matches the model call; its search child contributes flat call/result messages without breaking the next generation's continuity.",
  observations: [
    {
      id: "generation-1",
      type: "GENERATION",
      input: JSON.stringify([request]),
      output: JSON.stringify(executeCall),
    },
    {
      id: "execute",
      type: "TOOL",
      name: "execute",
      input: JSON.stringify({ code: "search('docs')" }),
      output: JSON.stringify(executeResult),
    },
    {
      id: "search",
      parent_observation_id: "execute",
      type: "TOOL",
      name: "search",
      input: JSON.stringify({ query: "docs" }),
      output: JSON.stringify("Found docs"),
    },
    {
      id: "generation-2",
      type: "GENERATION",
      input: JSON.stringify([request, executeCall, executeResult]),
      output: JSON.stringify({
        role: "assistant",
        content: "Here are the docs.",
      }),
    },
  ].map((observation, index) => ({
    ...observation,
    type: observation.type as "GENERATION" | "TOOL",
    project_id: "transcript-fixture-project",
    trace_id: traceId,
    parent_observation_id: observation.parent_observation_id ?? null,
    // Separate roots in traversal order; execution children remain under execute.
    start_time: new Date(startTime.getTime() + index * 1000).toISOString(),
    end_time: new Date(endTime.getTime() + index * 1000).toISOString(),
  })),
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [
            "generation-1",
            "execute",
            "search",
            "generation-2",
          ].map((id) => ({ id, traceId })),
          messages: [
            message("generation-1", "user", "input", [
              { type: "text", text: "Search the docs." },
            ]),
            message("generation-1", "assistant", "output", [
              {
                type: "tool-call",
                toolCallId: "execute-1",
                toolName: "execute",
                toolType: "tool-call",
                input: { code: "search('docs')" },
              },
            ]),
            message("execute", "tool", "output", [
              {
                type: "tool-result",
                toolCallId: "execute-1",
                toolName: "execute",
                output: "done",
              },
            ]),
            message("search", "assistant", "output", [
              {
                type: "tool-call",
                toolCallId: null,
                toolName: "search",
                input: { query: "docs" },
              },
            ]),
            message("search", "tool", "output", [
              {
                type: "tool-result",
                toolCallId: null,
                toolName: "search",
                output: "Found docs",
              },
            ]),
            message("generation-2", "assistant", "output", [
              { type: "text", text: "Here are the docs." },
            ]),
          ].map((entry) => {
            const index = [
              "generation-1",
              "execute",
              "search",
              "generation-2",
            ].indexOf(entry.observationId);
            return {
              ...entry,
              startTime: new Date(startTime.getTime() + index * 1000),
              endTime: new Date(endTime.getTime() + index * 1000),
            };
          }),
        },
      },
    ],
  },
} satisfies TranscriptFixture;

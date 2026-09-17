import type { TranscriptFixture } from "../fixture-types";

/**
 * Two root generations in separate traces of one synthetic session.
 * Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const reorderedHistoryFixture = {
  name: "Reordered history across two session traces",
  scope: "session",
  description:
    "Built one trace at a time, so the second trace keeps its input order B, C, A, New, Answer. Replayed user messages without an assistant or tool message cannot be told apart from new input, so nothing moves into the conversation history.",
  observations: [
    {
      id: "reordered-history-generation-1",
      trace_id: "reordered-history-trace-1",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 1",
      start_time: "2026-01-01T12:00:00.000Z",
      end_time: "2026-01-01T12:00:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "A",
        },
        {
          role: "user",
          content: "B",
        },
        {
          role: "user",
          content: "C",
        },
      ]),
      output: null,
    },
    {
      id: "reordered-history-generation-2",
      trace_id: "reordered-history-trace-2",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 2",
      start_time: "2026-01-01T12:01:00.000Z",
      end_time: "2026-01-01T12:01:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "B",
        },
        {
          role: "user",
          content: "C",
        },
        {
          role: "user",
          content: "A",
        },
        {
          role: "user",
          content: "New",
        },
      ]),
      output: JSON.stringify({
        role: "assistant",
        content: "Answer",
      }),
    },
  ],
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          messages: ["A", "B", "C"].map((text) => ({
            role: "user" as const,
            parts: [{ type: "text" as const, text }],
            source: "input" as const,
            observationId: "reordered-history-generation-1",
            traceId: "reordered-history-trace-1",
          })),
          observations: [
            {
              id: "reordered-history-generation-1",
              traceId: "reordered-history-trace-1",
            },
          ],
        },
      },
      {
        conversationHistory: [],
        currentTurn: {
          messages: [
            ...["B", "C", "A", "New"].map((text) => ({
              role: "user" as const,
              parts: [{ type: "text" as const, text }],
              source: "input" as const,
              observationId: "reordered-history-generation-2",
              traceId: "reordered-history-trace-2",
            })),
            {
              role: "assistant",
              parts: [{ type: "text", text: "Answer" }],
              source: "output",
              observationId: "reordered-history-generation-2",
              traceId: "reordered-history-trace-2",
            },
          ],
          observations: [
            {
              id: "reordered-history-generation-2",
              traceId: "reordered-history-trace-2",
            },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;

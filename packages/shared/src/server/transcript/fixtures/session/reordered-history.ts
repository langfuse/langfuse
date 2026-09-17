import type { TranscriptFixture } from "../fixture-types";

/**
 * Two root generations in separate traces of one synthetic session.
 * Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const reorderedHistoryFixture = {
  name: "Reordered history across two session traces",
  scope: "session",
  description:
    "Desired result is one thread with A, B, C, New, Answer; this deliberately exercises order-insensitive reconciliation beyond prefix matching.",
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
  expected: undefined,
} satisfies TranscriptFixture;

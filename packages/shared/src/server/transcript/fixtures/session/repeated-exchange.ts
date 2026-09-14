import type { TranscriptFixture } from "../fixture-types";

/**
 * Two root generations in separate traces of one synthetic session.
 * Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const repeatedExchangeFixture = {
  name: "Repeated exchange across two session traces",
  scope: "session",
  description:
    "Expect both Retry/Done exchanges to remain when only replayed history is removed; outputs are always retained.",
  observations: [
    {
      id: "repeated-exchange-generation-1",
      trace_id: "repeated-exchange-trace-1",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 1",
      start_time: "2026-01-01T12:00:00.000Z",
      end_time: "2026-01-01T12:00:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "Retry",
        },
      ]),
      output: JSON.stringify({
        role: "assistant",
        content: "Done",
      }),
    },
    {
      id: "repeated-exchange-generation-2",
      trace_id: "repeated-exchange-trace-2",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 2",
      start_time: "2026-01-01T12:01:00.000Z",
      end_time: "2026-01-01T12:01:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "Retry",
        },
        {
          role: "assistant",
          content: "Done",
        },
        {
          role: "user",
          content: "Retry",
        },
      ]),
      output: JSON.stringify({
        role: "assistant",
        content: "Done",
      }),
    },
  ],
  expected: undefined,
} satisfies TranscriptFixture;

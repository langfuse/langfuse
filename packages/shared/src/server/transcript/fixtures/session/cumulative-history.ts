import type { TranscriptFixture } from "../fixture-types";

/**
 * Two root generations in separate traces of one synthetic session.
 * Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const cumulativeHistoryFixture = {
  name: "Cumulative history across two session traces",
  scope: "session",
  description:
    "Adapted from Ben's cumulative-history test. Expect one thread with the initial exchange and follow-up once each; replayed messages retain the first trace and generation IDs.",
  observations: [
    {
      id: "cumulative-history-generation-1",
      trace_id: "cumulative-history-trace-1",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 1",
      start_time: "2026-01-01T12:00:00.000Z",
      end_time: "2026-01-01T12:00:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "Initial request",
        },
      ]),
      output: JSON.stringify({
        role: "assistant",
        content: "First response",
      }),
    },
    {
      id: "cumulative-history-generation-2",
      trace_id: "cumulative-history-trace-2",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 2",
      start_time: "2026-01-01T12:01:00.000Z",
      end_time: "2026-01-01T12:01:01.000Z",
      input: JSON.stringify([
        {
          role: "user",
          content: "Initial request",
        },
        {
          role: "assistant",
          content: "First response",
        },
        {
          role: "user",
          content: "Follow-up request",
        },
      ]),
      output: JSON.stringify({
        role: "assistant",
        content: "Second response",
      }),
    },
  ],
  expected: undefined,
} satisfies TranscriptFixture;

import type { TranscriptFixture } from "../fixture-types";

/**
 * Two root generations in separate traces of one synthetic session.
 * Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const cumulativeHistoryFixture = {
  name: "Cumulative history across two session traces",
  scope: "session",
  description:
    "Adapted from Ben's cumulative-history test. Each trace is built on its own: the second generation replays the first exchange, which becomes the conversation history up to the assistant's reply, and only the follow-up exchange is the current turn.",
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
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Initial request" }],
              source: "input",
              observationId: "cumulative-history-generation-1",
              traceId: "cumulative-history-trace-1",
            },
            {
              role: "assistant",
              parts: [{ type: "text", text: "First response" }],
              source: "output",
              observationId: "cumulative-history-generation-1",
              traceId: "cumulative-history-trace-1",
            },
          ],
          observations: [
            {
              id: "cumulative-history-generation-1",
              traceId: "cumulative-history-trace-1",
            },
          ],
        },
      },
      {
        conversationHistory: [
          {
            role: "user",
            parts: [{ type: "text", text: "Initial request" }],
            source: "input",
          },
          {
            role: "assistant",
            parts: [{ type: "text", text: "First response" }],
            source: "input",
          },
        ],
        currentTurn: {
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Follow-up request" }],
              source: "input",
              observationId: "cumulative-history-generation-2",
              traceId: "cumulative-history-trace-2",
            },
            {
              role: "assistant",
              parts: [{ type: "text", text: "Second response" }],
              source: "output",
              observationId: "cumulative-history-generation-2",
              traceId: "cumulative-history-trace-2",
            },
          ],
          observations: [
            {
              id: "cumulative-history-generation-2",
              traceId: "cumulative-history-trace-2",
            },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;

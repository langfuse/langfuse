import type { TranscriptFixture } from "../fixture-types";

/**
 * One root generation whose input replays an earlier exchange before the new
 * user message. Based on SessionConversationTimeline/fns/processTimelineMessages.clienttest.ts.
 */
export const inheritedConversationHistoryFixture = {
  name: "Inherited conversation history before a follow-up request",
  description:
    "The generation receives the first exchange and then a new request. The replay up to the assistant's reply becomes the conversation history; the new exchange is the current turn.",
  observations: [
    {
      id: "inherited-history-generation",
      trace_id: "inherited-history-trace",
      project_id: "transcript-fixture-project",
      parent_observation_id: null,
      type: "GENERATION",
      name: "Session turn 2",
      start_time: "2026-01-01T12:01:00.000Z",
      end_time: "2026-01-01T12:01:01.000Z",
      input: JSON.stringify([
        { role: "user", content: "Initial request" },
        { role: "assistant", content: "First response" },
        { role: "user", content: "Follow-up request" },
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
              observationId: "inherited-history-generation",
              startTime: new Date("2026-01-01T12:01:00.000Z"),
              endTime: new Date("2026-01-01T12:01:01.000Z"),
              traceId: "inherited-history-trace",
            },
            {
              role: "assistant",
              parts: [{ type: "text", text: "Second response" }],
              source: "output",
              observationId: "inherited-history-generation",
              startTime: new Date("2026-01-01T12:01:00.000Z"),
              endTime: new Date("2026-01-01T12:01:01.000Z"),
              traceId: "inherited-history-trace",
            },
          ],
          observations: [
            {
              id: "inherited-history-generation",
              traceId: "inherited-history-trace",
            },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;

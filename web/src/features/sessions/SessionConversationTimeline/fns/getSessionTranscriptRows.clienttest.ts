// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type RouterOutputs } from "@/src/utils/api";
import { getSessionTranscriptRows } from "./getSessionTranscriptRows";

const transcript = {
  threads: [
    {
      conversationHistory: [],
      currentTurn: {
        nestingLevel: 0,
        observations: [],
        messages: [
          {
            observationId: "generation",
            traceId: "trace",
            startTime: new Date(0),
            endTime: new Date(1000),
            role: "assistant",
            source: "output",
            parts: [
              { type: "text", text: "Before" },
              {
                type: "tool-call",
                toolName: "search",
                toolCallId: "call",
                input: {},
              },
              { type: "text", text: "After" },
            ],
          },
          {
            observationId: "tool",
            traceId: "trace",
            startTime: new Date(1000),
            endTime: new Date(2000),
            role: "tool",
            source: "output",
            parts: [
              { type: "tool-result", toolCallId: "call", output: "Found" },
            ],
          },
        ],
      },
    },
  ],
} satisfies NonNullable<
  RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
>;

describe("getSessionTranscriptRows", () => {
  it("gives messages and paired tools distinct IDs within one observation", () => {
    const rows = getSessionTranscriptRows(transcript);
    expect(
      rows.map(({ id, row }) => [id, row.type, row.message.observationId]),
    ).toEqual([
      ["0:0", "message", "generation"],
      ["0:1", "tool", "generation"],
      ["0:2", "message", "generation"],
    ]);
    expect(rows[1]?.row).toMatchObject({
      call: { toolName: "search" },
      result: { output: "Found" },
    });
  });

  it("returns no rows for an absent transcript", () => {
    expect(getSessionTranscriptRows(null)).toEqual([]);
  });
});

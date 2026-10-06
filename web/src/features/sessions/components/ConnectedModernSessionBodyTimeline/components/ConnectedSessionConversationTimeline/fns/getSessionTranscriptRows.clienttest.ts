// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type RouterOutputs } from "@/src/utils/api";
import { getSessionTranscriptRows } from "./getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "./getSessionTranscriptThreads";

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

  it("only projects the shallowest threads and preserves original row IDs", () => {
    const baseThread = transcript.threads[0]!;
    const nestedTranscript = {
      threads: [3, 2, 4, 2].map((nestingLevel) => ({
        ...baseThread,
        currentTurn: { ...baseThread.currentTurn, nestingLevel },
      })),
    };

    expect(
      getSessionTranscriptRows(nestedTranscript).map(({ id }) => id),
    ).toEqual(["1:0", "1:1", "1:2", "3:0", "3:1", "3:2"]);
    expect(getSessionTranscriptThreads(nestedTranscript)).toMatchObject({
      hiddenThreadCount: 2,
      visibleThreads: [{ threadIndex: 1 }, { threadIndex: 3 }],
    });
  });

  it("does not project nested-only search content or hide equal-depth threads", () => {
    const baseThread = transcript.threads[0]!;
    const nestedTranscript = {
      threads: [
        baseThread,
        {
          ...baseThread,
          currentTurn: {
            ...baseThread.currentTurn,
            nestingLevel: 1,
            messages: [
              {
                ...baseThread.currentTurn.messages[0]!,
                parts: [
                  { type: "text" as const, text: "Nested-only search match" },
                ],
              },
            ],
          },
        },
        baseThread,
      ],
    };
    const rows = getSessionTranscriptRows(nestedTranscript);
    expect(rows.map(({ threadIndex }) => threadIndex)).toEqual([
      0, 0, 0, 2, 2, 2,
    ]);
    expect(JSON.stringify(rows)).not.toContain("Nested-only search match");
  });

  it("reports no hidden threads for absent or empty transcripts", () => {
    expect(getSessionTranscriptThreads(null)).toEqual({
      visibleThreads: [],
      hiddenThreadCount: 0,
    });
    expect(getSessionTranscriptThreads({ threads: [] })).toEqual({
      visibleThreads: [],
      hiddenThreadCount: 0,
    });
  });
});

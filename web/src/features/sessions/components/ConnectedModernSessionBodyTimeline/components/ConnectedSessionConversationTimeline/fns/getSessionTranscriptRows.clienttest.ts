// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type RouterOutputs } from "@/src/utils/api";
import { getSessionTranscriptRows } from "./getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "./getSessionTranscriptThreads";
import { getSessionConversationEntries } from "./getSessionConversationEntries";

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
  it("hides encrypted custom parts without changing remaining row IDs", () => {
    const thread = transcript.threads[0]!;
    const message = thread.currentTurn.messages[0]!;
    const encryptedTranscript = {
      threads: [
        {
          ...thread,
          currentTurn: {
            ...thread.currentTurn,
            messages: [
              {
                ...message,
                parts: [
                  {
                    type: "custom",
                    kind: "encrypted_content",
                    value: {
                      type: "encrypted_content",
                      encrypted_content: "opaque-payload",
                    },
                  },
                ],
              },
              ...thread.currentTurn.messages,
            ],
          },
        },
      ],
    } satisfies NonNullable<
      RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
    >;
    const rows = getSessionTranscriptRows(encryptedTranscript);
    expect(rows.map(({ id }) => id)).toEqual(["0:1", "0:2", "0:3"]);
    expect(JSON.stringify(rows)).not.toContain("opaque-payload");
  });

  it("preserves readable parts and other custom content in mixed messages", () => {
    const thread = transcript.threads[0]!;
    const mixedTranscript: NonNullable<
      RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
    > = {
      threads: [
        {
          ...thread,
          currentTurn: {
            ...thread.currentTurn,
            messages: [
              {
                ...thread.currentTurn.messages[0]!,
                parts: [
                  { type: "text", text: "Visible answer" },
                  {
                    type: "custom",
                    kind: "encrypted_content",
                    value: { encrypted_content: "opaque-payload" },
                  },
                  {
                    type: "custom",
                    kind: "metadata",
                    value: { confidence: 1 },
                  },
                  {
                    type: "reasoning",
                    content: { kind: "encrypted", data: "reasoning-payload" },
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(
      getSessionTranscriptRows(mixedTranscript)[0]?.row.message.parts,
    ).toEqual([
      { type: "text", text: "Visible answer" },
      { type: "custom", kind: "metadata", value: { confidence: 1 } },
      {
        type: "reasoning",
        content: { kind: "encrypted", data: "reasoning-payload" },
      },
    ]);
  });

  it("flattens visible threads with contiguous labels but original identities", () => {
    const base = transcript.threads[0]!;
    const entries = getSessionConversationEntries([
      { trace: { id: "single" }, transcript },
      {
        trace: { id: "multi" },
        transcript: {
          threads: [
            base,
            { ...base, currentTurn: { ...base.currentTurn, nestingLevel: 1 } },
            base,
          ],
        },
      },
      { trace: { id: "loading" }, transcript: undefined },
    ]);
    expect(entries).toMatchObject([
      {
        itemId: "single:0",
        traceIndex: 0,
        threadIndex: 0,
        threadNumber: 1,
        displayNumber: "1.1",
        threadCount: 1,
      },
      {
        itemId: "multi:0",
        traceIndex: 1,
        threadIndex: 0,
        threadNumber: 1,
        displayNumber: "2.1",
        threadCount: 2,
      },
      {
        itemId: "multi:2",
        traceIndex: 1,
        threadIndex: 2,
        threadNumber: 2,
        displayNumber: "2.2",
        threadCount: 2,
      },
      {
        itemId: "loading",
        traceIndex: 2,
        displayNumber: "3",
        threadNumber: undefined,
      },
    ]);
    expect(
      getSessionConversationEntries([
        { trace: { id: "single" }, transcript },
      ])[0],
    ).toMatchObject({ displayNumber: "1", threadNumber: undefined });
  });
  it("keeps empty visible threads and does not count hidden threads for decimal mode", () => {
    const base = transcript.threads[0]!;
    expect(
      getSessionConversationEntries([
        {
          trace: { id: "empty-thread" },
          transcript: {
            threads: [
              { ...base, currentTurn: { ...base.currentTurn, messages: [] } },
              {
                ...base,
                currentTurn: { ...base.currentTurn, nestingLevel: 1 },
              },
            ],
          },
        },
        { trace: { id: "no-transcript" }, transcript: null },
      ]),
    ).toMatchObject([
      {
        itemId: "empty-thread:0",
        displayNumber: "1",
        threadCount: 1,
        threadNumber: undefined,
      },
      {
        itemId: "no-transcript",
        displayNumber: "2",
        threadIndex: undefined,
        threadCount: 0,
      },
    ]);
  });

  it("gives messages and paired tools distinct IDs while preserving result provenance", () => {
    const rows = getSessionTranscriptRows(transcript);
    expect(
      rows.map(({ id, row }) => [id, row.type, row.message.observationId]),
    ).toEqual([
      ["0:0", "message", "generation"],
      ["0:1", "tool", "tool"],
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

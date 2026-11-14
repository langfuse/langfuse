// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type RouterOutputs } from "@/src/utils/api";
import { getSessionTranscriptRows } from "./getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "./getSessionTranscriptThreads";
import { getSessionConversationEntries } from "./getSessionConversationEntries";

// NOTE: this fixture has no user message, so it is not conversational; the
// legacy tests below only exercise the fallback path.
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
              {
                type: "tool-result",
                toolCallId: "call",
                output: { type: "text", value: "Found" },
              },
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
  it("hides protected Microsoft reasoning while preserving unprotected content", () => {
    const thread = transcript.threads[0]!;
    const protectedTranscript: NonNullable<
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
                    kind: "Microsoft.Extensions.AI.TextReasoningContent",
                    value: {
                      content: {
                        text: "",
                        protectedData: "opaque-microsoft-payload",
                      },
                    },
                  },
                  {
                    type: "custom",
                    kind: "Microsoft.Extensions.AI.TextReasoningContent",
                    value: { content: { text: "Readable reasoning" } },
                  },
                  {
                    type: "custom",
                    kind: "metadata",
                    value: { content: { protectedData: "unrelated-field" } },
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    const rows = getSessionTranscriptRows(protectedTranscript);
    expect(rows[0]?.row.message.parts).toEqual([
      { type: "text", text: "Visible answer" },
      {
        type: "custom",
        kind: "Microsoft.Extensions.AI.TextReasoningContent",
        value: { content: { text: "Readable reasoning" } },
      },
      {
        type: "custom",
        kind: "metadata",
        value: { content: { protectedData: "unrelated-field" } },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("opaque-microsoft-payload");
    protectedTranscript.threads[0]!.currentTurn.messages[0]!.parts = [
      {
        type: "custom",
        kind: "Microsoft.Extensions.AI.TextReasoningContent",
        value: { content: { protectedData: "opaque-microsoft-payload" } },
      },
    ];
    expect(getSessionTranscriptRows(protectedTranscript)).toEqual([]);
  });

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
      result: { output: { type: "text", value: "Found" } },
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

    const expandedRows = getSessionTranscriptRows(nestedTranscript, true);
    expect(expandedRows.map(({ threadIndex }) => threadIndex)).toEqual([
      0, 0, 0, 1, 2, 2, 2,
    ]);
    expect(JSON.stringify(expandedRows)).toContain("Nested-only search match");
    expect(getSessionTranscriptThreads(nestedTranscript, true)).toMatchObject({
      hiddenThreadCount: 0,
      visibleThreads: [
        { threadIndex: 0 },
        { threadIndex: 1 },
        { threadIndex: 2 },
      ],
    });
    expect(
      getSessionConversationEntries(
        [{ trace: { id: "trace" }, transcript: nestedTranscript }],
        true,
      ),
    ).toMatchObject([
      {
        itemId: "trace:0",
        threadIndex: 0,
        threadCount: 3,
        displayNumber: "1.1",
      },
      {
        itemId: "trace:1",
        threadIndex: 1,
        threadCount: 3,
        displayNumber: "1.2",
      },
      {
        itemId: "trace:2",
        threadIndex: 2,
        threadCount: 3,
        displayNumber: "1.3",
      },
    ]);
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

describe("getSessionTranscriptThreads", () => {
  type Transcript = NonNullable<
    RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
  >;
  type ThreadMessage =
    Transcript["threads"][number]["currentTurn"]["messages"][number];

  const message = (
    role: ThreadMessage["role"],
    source: ThreadMessage["source"],
    parts: ThreadMessage["parts"],
  ): ThreadMessage => ({
    observationId: "generation",
    traceId: "trace",
    startTime: new Date(0),
    endTime: new Date(1000),
    role,
    source,
    parts,
  });

  const thread = (
    nestingLevel: number,
    messages: ThreadMessage[],
  ): Transcript["threads"][number] => ({
    conversationHistory: [],
    currentTurn: { nestingLevel, observations: [], messages },
  });

  const guardrailThread = thread(1, [
    message("user", "input", [
      { type: "text", text: "What is the capital of France?" },
    ]),
    message("assistant", "output", [
      { type: "data", value: { intent: "general", confidence: 0.95 } },
    ]),
  ]);

  const chatThread = thread(3, [
    message("user", "input", [
      { type: "text", text: "What is the capital of France?" },
    ]),
    message("assistant", "output", [
      { type: "text", text: "Paris is the capital of France." },
    ]),
  ]);

  it("prefers conversational threads over shallower JSON-only threads", () => {
    expect(
      getSessionTranscriptThreads({
        threads: [guardrailThread, chatThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });

  it("does not treat a tool-call-only assistant reply as conversational", () => {
    const routingThread = thread(1, [
      message("user", "input", [{ type: "text", text: "Route this" }]),
      message("assistant", "output", [
        {
          type: "tool-call",
          toolName: "route_to_x",
          toolCallId: "call",
          input: {},
        },
      ]),
    ]);
    expect(
      getSessionTranscriptThreads({
        threads: [routingThread, chatThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });

  it("demotes a JSON-mode chat thread when a text chat thread competes", () => {
    const jsonChatThread = thread(1, [
      message("user", "input", [{ type: "text", text: "Reply as JSON." }]),
      message("assistant", "output", [
        { type: "data", value: { answer: "Paris" } },
      ]),
    ]);
    expect(
      getSessionTranscriptThreads({
        threads: [jsonChatThread, chatThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });

  it("shows only the shallowest thread when several threads are conversational", () => {
    const shallowChatThread = thread(2, [
      message("user", "input", [
        { type: "text", text: "What is the capital of France?" },
      ]),
      message("assistant", "output", [
        { type: "text", text: "Paris is the capital of France." },
      ]),
    ]);
    expect(
      getSessionTranscriptThreads({
        threads: [guardrailThread, chatThread, shallowChatThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 2,
      visibleThreads: [{ threadIndex: 2 }],
    });
  });

  it("falls back to the shallowest thread when no thread is conversational", () => {
    // Pins the fallback branch: with no conversational thread, selection is
    // exactly today's behavior (shallowest of all threads). It passes with or
    // without the fix by design — it guards the new branch, not the fix.
    const routingThread = thread(2, [
      message("user", "input", [{ type: "text", text: "Route this" }]),
      message("assistant", "output", [
        {
          type: "tool-call",
          toolName: "route_to_x",
          toolCallId: "call",
          input: {},
        },
      ]),
    ]);
    expect(
      getSessionTranscriptThreads({
        threads: [guardrailThread, routingThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 0 }],
    });
  });

  it("counts replayed conversation history when the current turn has no user message", () => {
    const historyThread = {
      ...thread(3, [
        message("assistant", "output", [
          { type: "text", text: "Second response." },
        ]),
      ]),
      conversationHistory: [
        message("user", "input", [{ type: "text", text: "Initial request" }]),
        message("assistant", "output", [
          { type: "text", text: "First response" },
        ]),
      ],
    };
    expect(
      getSessionTranscriptThreads({
        threads: [guardrailThread, historyThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });

  it("does not let a guardrail win by replaying the same earlier exchange", () => {
    const sharedHistory = [
      message("user", "input", [{ type: "text", text: "Initial request" }]),
      message("assistant", "output", [
        { type: "text", text: "First response" },
      ]),
    ];
    const guardrailWithHistory = {
      ...guardrailThread,
      conversationHistory: sharedHistory,
    };
    const chatWithHistory = {
      ...chatThread,
      conversationHistory: sharedHistory,
    };
    expect(
      getSessionTranscriptThreads({
        threads: [guardrailWithHistory, chatWithHistory],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });

  it("does not treat a stringified JSON verdict as a readable reply", () => {
    const jsonTextThread = thread(1, [
      message("user", "input", [
        { type: "text", text: "What is the capital of France?" },
      ]),
      message("assistant", "output", [
        { type: "text", text: '{"intent": "general", "confidence": 0.95}' },
      ]),
    ]);
    expect(
      getSessionTranscriptThreads({
        threads: [jsonTextThread, chatThread],
      }),
    ).toMatchObject({
      hiddenThreadCount: 1,
      visibleThreads: [{ threadIndex: 1 }],
    });
  });
});

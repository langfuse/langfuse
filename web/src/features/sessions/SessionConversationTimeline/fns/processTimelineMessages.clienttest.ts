// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import { processTimelineMessages } from "@/src/features/sessions/SessionConversationTimeline/fns/processTimelineMessages";

const messages = [
  {
    role: "system",
    source: "input",
    parts: [{ type: "text", text: "First instruction" }],
  },
  {
    role: "system",
    source: "input",
    parts: [{ type: "text", text: "Second instruction" }],
  },
  {
    role: "assistant",
    source: "input",
    parts: [
      {
        type: "tool-call",
        toolCallId: "historical-call",
        toolName: "historical_tool",
        input: { query: "old" },
      },
    ],
  },
  {
    role: "assistant",
    source: "output",
    parts: [
      { type: "text", text: "Calling tools" },
      {
        type: "tool-call",
        toolCallId: "standalone-call",
        toolName: "existing_tool",
        input: { query: "existing" },
      },
      {
        type: "tool-call",
        toolCallId: null,
        toolName: "rolled_up_tool",
        input: { query: "new" },
      },
    ],
  },
  {
    role: "tool",
    source: "input",
    parts: [
      {
        type: "tool-result",
        toolCallId: "historical-call",
        toolName: "historical_tool",
        output: { result: "old" },
      },
    ],
  },
] satisfies NormalizedMessage[];

describe("processTimelineMessages", () => {
  it("keeps tool parts out of messages and emits unmatched output calls", () => {
    const [result] = processTimelineMessages({
      messageGroups: [messages],
      reconcileHistory: [true],
      standaloneToolCallIdsByGroup: [new Set(["standalone-call"])],
    });

    expect(result?.messages).toEqual([
      {
        role: "system",
        source: "input",
        parts: [
          { type: "text", text: "First instruction" },
          { type: "text", text: "Second instruction" },
        ],
      },
      {
        role: "assistant",
        source: "output",
        parts: [{ type: "text", text: "Calling tools" }],
      },
    ]);
    expect(result?.rolledUpToolCalls).toEqual([
      {
        type: "tool-call",
        toolCallId: null,
        toolName: "rolled_up_tool",
        input: { query: "new" },
      },
    ]);
  });

  it("does not deduplicate calls without an id", () => {
    const [result] = processTimelineMessages({
      messageGroups: [messages],
      reconcileHistory: [true],
      standaloneToolCallIdsByGroup: [new Set()],
    });

    expect(result?.rolledUpToolCalls.map((part) => part.toolName)).toEqual([
      "existing_tool",
      "rolled_up_tool",
    ]);
  });

  it("deduplicates standalone tool calls only within their trace", () => {
    const toolCallMessage = {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "tool-call",
          toolCallId: "reused-call-id",
          toolName: "lookup",
          input: {},
        },
      ],
    } satisfies NormalizedMessage;
    const result = processTimelineMessages({
      messageGroups: [[toolCallMessage], [toolCallMessage]],
      reconcileHistory: [true, true],
      standaloneToolCallIdsByGroup: [new Set(["reused-call-id"]), new Set()],
    });

    expect(result[0]?.rolledUpToolCalls).toEqual([]);
    expect(result[1]?.rolledUpToolCalls).toHaveLength(1);
  });

  it("shows only the suffix added to cumulative conversation history", () => {
    const result = processTimelineMessages({
      messageGroups: [
        [
          {
            role: "system",
            source: "input",
            parts: [{ type: "text", text: "Instructions" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Initial request" }],
          },
          {
            id: "first-response-output",
            role: "assistant",
            source: "output",
            parts: [{ type: "text", text: "First response" }],
          },
        ],
        [
          {
            role: "system",
            source: "input",
            parts: [{ type: "text", text: "Instructions" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Initial request" }],
          },
          {
            id: "first-response-replayed",
            role: "assistant",
            source: "input",
            parts: [{ type: "text", text: "First response" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Follow-up request" }],
          },
          {
            role: "assistant",
            source: "output",
            parts: [{ type: "text", text: "Second response" }],
          },
        ],
      ] satisfies NormalizedMessage[][],
      reconcileHistory: [true, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set()],
    });

    expect(result[1]?.messages).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "Follow-up request" }],
      },
      {
        role: "assistant",
        source: "output",
        parts: [{ type: "text", text: "Second response" }],
      },
    ]);
  });

  it("preserves repeated new messages and identical new outputs", () => {
    const result = processTimelineMessages({
      messageGroups: [
        [
          {
            id: "request-1",
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Retry" }],
          },
          {
            id: "response-1",
            role: "assistant",
            source: "output",
            parts: [{ type: "text", text: "Done" }],
          },
        ],
        [
          {
            id: "request-1",
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Retry" }],
          },
          {
            id: "response-1",
            role: "assistant",
            source: "input",
            parts: [{ type: "text", text: "Done" }],
          },
          {
            id: "request-2",
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Retry" }],
          },
          {
            id: "response-2",
            role: "assistant",
            source: "output",
            parts: [{ type: "text", text: "Done" }],
          },
        ],
      ] satisfies NormalizedMessage[][],
      reconcileHistory: [true, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set()],
    });

    expect(result[1]?.messages.map((message) => message.id)).toEqual([
      "request-2",
      "response-2",
    ]);
  });

  it("matches repeated history around newly inserted context", () => {
    const result = processTimelineMessages({
      messageGroups: [
        [
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Initial request" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Screen context" }],
          },
        ],
        [
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Initial request" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "New instruction" }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Screen context" }],
          },
        ],
      ] satisfies NormalizedMessage[][],
      reconcileHistory: [true, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set()],
    });

    expect(result[1]?.messages).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "New instruction" }],
      },
    ]);
  });

  it("matches historical parts when injected context changes their order", () => {
    const message = (text: string, source: "input" | "output") => ({
      role: "user" as const,
      source,
      parts: [{ type: "text" as const, text }],
    });
    const result = processTimelineMessages({
      messageGroups: [
        [message("A", "input"), message("B", "input"), message("C", "input")],
        [
          message("B", "input"),
          message("C", "input"),
          message("A", "input"),
          message("New", "input"),
        ],
      ],
      reconcileHistory: [true, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set()],
    });

    expect(result[1]?.messages).toEqual([message("New", "input")]);
  });

  it("preserves history across groups that could not be parsed", () => {
    const repeatedMessage = {
      role: "user",
      source: "input",
      parts: [{ type: "text", text: "Initial request" }],
    } satisfies NormalizedMessage;
    const result = processTimelineMessages({
      messageGroups: [[repeatedMessage], null, [repeatedMessage]],
      reconcileHistory: [true, false, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set(), new Set()],
    });

    expect(result[2]?.messages).toEqual([]);
  });

  it("renders non-history groups without replacing generation history", () => {
    const repeatedMessage = {
      role: "user",
      source: "input",
      parts: [{ type: "text", text: "Initial request" }],
    } satisfies NormalizedMessage;
    const eventMessage = {
      role: "user",
      source: "input",
      parts: [{ type: "text", text: "Event payload" }],
    } satisfies NormalizedMessage;
    const result = processTimelineMessages({
      messageGroups: [[repeatedMessage], [eventMessage], [repeatedMessage]],
      reconcileHistory: [true, false, true],
      standaloneToolCallIdsByGroup: [new Set(), new Set(), new Set()],
    });

    expect(result[1]?.messages).toEqual([eventMessage]);
    expect(result[2]?.messages).toEqual([]);
  });
});

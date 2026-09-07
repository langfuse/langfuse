// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import {
  getStandaloneToolCallIds,
  processTimelineMessages,
} from "@/src/components/session/SessionConversationTimeline/fns/processTimelineMessages";

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
    const result = processTimelineMessages({
      messages,
      showSystemPrompt: true,
      standaloneToolCallIds: new Set(["standalone-call"]),
    });

    expect(result.messages).toEqual([
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
    expect(result.rolledUpToolCalls).toEqual([
      {
        type: "tool-call",
        toolCallId: null,
        toolName: "rolled_up_tool",
        input: { query: "new" },
      },
    ]);
  });

  it("hides merged system prompts when disabled", () => {
    const result = processTimelineMessages({
      messages,
      showSystemPrompt: false,
      standaloneToolCallIds: new Set(),
    });

    expect(result.messages.every((message) => message.role !== "system")).toBe(
      true,
    );
  });

  it("does not deduplicate calls without an id", () => {
    const result = processTimelineMessages({
      messages,
      showSystemPrompt: true,
      standaloneToolCallIds: new Set(),
    });

    expect(result.rolledUpToolCalls.map((part) => part.toolName)).toEqual([
      "existing_tool",
      "rolled_up_tool",
    ]);
  });
});

describe("getStandaloneToolCallIds", () => {
  it("reads supported ids from non-truncated tool metadata", () => {
    expect(
      getStandaloneToolCallIds([
        {
          type: "TOOL",
          metadata: { toolCallId: "tool-call-id" },
          metadataTruncated: false,
        },
        {
          type: "TOOL",
          metadata: JSON.stringify({ callID: "call-id" }),
          metadataTruncated: false,
        },
        {
          type: "GENERATION",
          metadata: { toolCallId: "generation-id" },
          metadataTruncated: false,
        },
        {
          type: "TOOL",
          metadata: { toolCallId: "truncated-id" },
          metadataTruncated: true,
        },
        {
          type: "TOOL",
          metadata: "invalid JSON",
          metadataTruncated: false,
        },
      ]),
    ).toEqual(new Set(["tool-call-id", "call-id"]));
  });
});

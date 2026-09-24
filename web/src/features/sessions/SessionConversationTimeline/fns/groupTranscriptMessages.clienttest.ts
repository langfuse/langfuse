// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ToolCallPart,
  type ToolResultPart,
} from "@langfuse/shared/src/utils/normalized-io";
import { groupTranscriptMessages } from "./groupTranscriptMessages";

const call = (id: string | null): ToolCallPart => ({
  type: "tool-call",
  toolCallId: id,
  toolName: "search",
  input: { query: "hello" },
});
const result = (id: string | null): ToolResultPart => ({
  type: "tool-result",
  toolCallId: id,
  output: "found",
});
const text = (value: string): NormalizedMessagePart => ({
  type: "text",
  text: value,
});
const message = (parts: NormalizedMessagePart[]): NormalizedMessage => ({
  role: "assistant",
  source: "output",
  parts,
});

describe("groupTranscriptMessages", () => {
  it("groups results at call positions while preserving surrounding parts and metadata", () => {
    const firstCall = call("a");
    const secondCall = call("b");
    const firstResult = result("a");
    const secondResult = result("b");
    const messages = [
      {
        ...message([
          text("before"),
          firstCall,
          text("between"),
          secondCall,
          text("after"),
        ]),
        observationId: "generation",
        startTime: new Date(0),
      },
      {
        ...message([secondResult, text("result context"), firstResult]),
        observationId: "tool",
        startTime: new Date(1),
      },
    ];

    expect(groupTranscriptMessages(messages)).toEqual([
      { type: "message", message: { ...messages[0], parts: [text("before")] } },
      {
        type: "tool",
        message: messages[0],
        call: firstCall,
        result: firstResult,
      },
      {
        type: "message",
        message: { ...messages[0], parts: [text("between")] },
      },
      {
        type: "tool",
        message: messages[0],
        call: secondCall,
        result: secondResult,
      },
      { type: "message", message: { ...messages[0], parts: [text("after")] } },
      {
        type: "message",
        message: { ...messages[1], parts: [text("result context")] },
      },
    ]);
  });

  it.each([
    [call(null), result(null)],
    [call(""), result("")],
    [call("a"), result("b")],
    [call("a"), call("a"), result("a")],
    [call("a"), result("a"), result("a")],
    [result("a"), call("a")],
  ])("preserves missing, ambiguous and out-of-order IDs: %j", (...parts) => {
    const messages = parts.map((part) => message([part]));
    expect(groupTranscriptMessages(messages)).toEqual(
      messages.map((message) => ({ type: "message", message })),
    );
  });

  it("pairs a call and later result in the same message without mutating input", () => {
    const toolCall = call("a");
    const toolResult = result("a");
    const input = message([toolCall, text("middle"), toolResult, text("end")]);
    const original = structuredClone(input);
    input.parts.forEach(Object.freeze);
    Object.freeze(input.parts);
    Object.freeze(input);
    const groups = groupTranscriptMessages(Object.freeze([input]));
    expect(groups).toEqual([
      { type: "tool", message: input, call: toolCall, result: toolResult },
      {
        type: "message",
        message: { ...input, parts: [text("middle"), text("end")] },
      },
    ]);
    expect(input).toEqual(original);
  });
});

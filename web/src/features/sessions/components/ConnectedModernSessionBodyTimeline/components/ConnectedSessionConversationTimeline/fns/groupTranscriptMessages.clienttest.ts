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
  it("keeps a media-only result and its omission metadata inside the tool row", () => {
    const toolCall = call("a");
    const toolResult: ToolResultPart = {
      ...result("a"),
      output: null,
      omittedContent: [{ kind: "media", count: 2 }],
    };
    const response = { ...message([toolResult]), role: "tool" as const };

    expect(groupTranscriptMessages([message([toolCall]), response])).toEqual([
      { type: "tool", message: response, call: toolCall, result: toolResult },
    ]);
  });

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
        timing: { startTime: new Date(0), endTime: new Date(1000) },
      },
      {
        ...message([secondResult, text("result context"), firstResult]),
        observationId: "tool",
        startTime: new Date(1),
        timing: { startTime: new Date(1), endTime: new Date(101) },
      },
    ];

    expect(groupTranscriptMessages(messages)).toEqual([
      { type: "message", message: { ...messages[0], parts: [text("before")] } },
      {
        type: "tool",
        message: messages[1],
        call: firstCall,
        result: firstResult,
      },
      {
        type: "message",
        message: { ...messages[0], parts: [text("between")] },
      },
      {
        type: "tool",
        message: messages[1],
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

  it("pairs a server-produced identified tool response", () => {
    const output = "found";
    const parts = [{ ...result("a"), toolName: "search", output }];
    const toolCall = call("a");
    const response = {
      ...message(parts),
      role: "tool" as const,
      observationId: "tool",
    };
    const input = { ...message([toolCall]), observationId: "generation" };

    expect(groupTranscriptMessages([input, response])).toEqual([
      {
        type: "tool",
        message: response,
        call: toolCall,
        result: {
          type: "tool-result",
          toolCallId: "a",
          toolName: "search",
          output,
        },
      },
    ]);
  });

  it.each(["search", "weather"])(
    "keeps a text response separate from multiple calls including %s",
    (toolName) => {
      const input = message([call("a"), { ...call("b"), toolName }]);
      const response = { ...message([text("found")]), role: "tool" as const };
      expect(groupTranscriptMessages([input, response])).toEqual([
        { type: "tool", message: input, call: input.parts[0], result: null },
        { type: "tool", message: input, call: input.parts[1], result: null },
        { type: "message", message: response },
      ]);
    },
  );

  it("keeps unnamed later responses separate rather than skipping intervening tools", () => {
    const input = message([call("a")]);
    const first = { ...message([text("first")]), role: "tool" as const };
    const second = { ...message([text("second")]), role: "tool" as const };
    expect(
      groupTranscriptMessages([input, first, second]).map((row) => row.message),
    ).toEqual([input, first, second]);
  });

  it("does not invent an ID for a text response to an unidentified call", () => {
    const toolCall = call(null);
    const input = message([toolCall]);
    const response = { ...message([text("found")]), role: "tool" as const };
    expect(groupTranscriptMessages([input, response])).toEqual([
      { type: "tool", message: input, call: toolCall, result: null },
      { type: "message", message: response },
    ]);
  });

  it("prefers an explicitly identified result over an adjacent text response", () => {
    const toolCall = call("a");
    const toolResult = result("a");
    const input = message([toolCall]);
    const response = {
      ...message([text("unidentified")]),
      role: "tool" as const,
    };
    const identifiedResponse = message([toolResult]);
    expect(
      groupTranscriptMessages([input, response, identifiedResponse]),
    ).toEqual([
      {
        type: "tool",
        message: identifiedResponse,
        call: toolCall,
        result: toolResult,
      },
      { type: "message", message: response },
    ]);
  });

  it.each([
    [call(null), result(null)],
    [call(""), result("")],
    [call("a"), result("b")],
    [call("a"), call("a"), result("a")],
    [call("a"), result("a"), result("a")],
    [result("a"), call("a")],
  ])(
    "extracts missing, ambiguous and out-of-order IDs without pairing: %j",
    (...parts) => {
      const messages = parts.map((part) => message([part]));
      expect(groupTranscriptMessages(messages)).toEqual(
        messages.map((message, index) => ({
          type: "tool",
          message,
          call: parts[index]!.type === "tool-call" ? parts[index] : null,
          result: parts[index]!.type === "tool-result" ? parts[index] : null,
        })),
      );
    },
  );

  it.each([call("a"), result("a")])(
    "extracts an unmatched tool part while preserving surrounding text: %j",
    (part) => {
      const input = message([text("before"), part, text("after")]);
      expect(groupTranscriptMessages([input])).toEqual([
        { type: "message", message: { ...input, parts: [text("before")] } },
        {
          type: "tool",
          message: input,
          call: part.type === "tool-call" ? part : null,
          result: part.type === "tool-result" ? part : null,
        },
        { type: "message", message: { ...input, parts: [text("after")] } },
      ]);
    },
  );

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

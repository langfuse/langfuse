import { describe, expect, it } from "vitest";
import { pydanticAIAdapter } from "./pydantic-ai";

describe("pydanticAIAdapter preprocess", () => {
  const ctx = { metadata: undefined };

  it("preserves user text that shares a request with tool responses", () => {
    const data = [
      {
        role: "user",
        parts: [
          { type: "tool_call_response", id: "t1", result: "42" },
          { type: "text", content: "now summarize the result" },
        ],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", ctx);

    expect(result).toEqual([
      { role: "tool", tool_call_id: "t1", content: "42" },
      { role: "user", content: "now summarize the result" },
    ]);
  });

  it("keeps splitting pure tool-response user messages into tool messages only", () => {
    const data = [
      {
        role: "user",
        parts: [
          { type: "tool_call_response", id: "t1", result: "a" },
          { type: "tool_call_response", id: "t2", result: "b" },
        ],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", ctx);

    expect(result).toEqual([
      { role: "tool", tool_call_id: "t1", content: "a" },
      { role: "tool", tool_call_id: "t2", content: "b" },
    ]);
  });

  it("keeps assistant tool calls with their text content", () => {
    const data = [
      {
        role: "assistant",
        parts: [
          { type: "text", content: "calling the tool" },
          { type: "tool_call", id: "t1", name: "lookup", arguments: '{"q":1}' },
        ],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", ctx);

    expect(result).toEqual([
      {
        role: "assistant",
        content: "calling the tool",
        tool_calls: [
          { id: "t1", name: "lookup", arguments: '{"q":1}', type: "function" },
        ],
      },
    ]);
  });

  it("keeps plain user text messages unchanged", () => {
    const data = [
      { role: "user", parts: [{ type: "text", content: "hello" }] },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", ctx);

    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });
});

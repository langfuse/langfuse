import { describe, expect, it } from "vitest";
import { pydanticAIAdapter } from "./pydantic-ai";

describe("pydanticAIAdapter", () => {
  it("preserves user text when a message contains both tool responses and text parts", () => {
    const data = [
      {
        role: "user",
        parts: [
          { type: "tool_call_response", id: "t1", result: "42" },
          { type: "text", content: "now summarize the result" },
        ],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", {
      framework: "pydantic-ai",
    });

    expect(result).toEqual([
      { role: "tool", tool_call_id: "t1", content: "42" },
      { role: "user", content: "now summarize the result" },
    ]);
  });

  it("handles user messages with only tool responses without extra user message", () => {
    const data = [
      {
        role: "user",
        parts: [{ type: "tool_call_response", id: "t1", result: "42" }],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", {
      framework: "pydantic-ai",
    });

    expect(result).toEqual([
      { role: "tool", tool_call_id: "t1", content: "42" },
    ]);
  });

  it("handles multiple tool responses alongside user text", () => {
    const data = [
      {
        role: "user",
        parts: [
          { type: "tool_call_response", id: "t1", result: "42" },
          { type: "tool_call_response", id: "t2", result: "100" },
          { type: "text", content: "compare these two numbers" },
        ],
      },
    ];

    const result = pydanticAIAdapter.preprocess(data, "input", {
      framework: "pydantic-ai",
    });

    expect(result).toEqual([
      { role: "tool", tool_call_id: "t1", content: "42" },
      { role: "tool", tool_call_id: "t2", content: "100" },
      { role: "user", content: "compare these two numbers" },
    ]);
  });
});

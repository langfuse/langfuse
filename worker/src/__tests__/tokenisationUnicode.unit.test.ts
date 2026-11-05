import { encoding_for_model } from "tiktoken";
import { afterAll, describe, expect, it } from "vitest";

import { type Model } from "@langfuse/shared";

import { tokenCount } from "../features/tokenisation/usage";

const gpt4o = {
  id: "model-gpt-4o",
  tokenizerId: "openai",
  tokenizerConfig: {
    tokenizerModel: "gpt-4o",
    tokensPerMessage: 3,
    tokensPerName: 1,
  },
} as unknown as Model;

const encoding = encoding_for_model("gpt-4o");

afterAll(() => {
  encoding.free();
});

describe("token count of text outside the basic plane", () => {
  // Text was passed through a pass that hex-encoded astral characters before
  // counting. It never actually did so, because indexing a string yields UTF-16
  // code units and an astral character arrives as a lone surrogate. These pin
  // the counts to what the tokeniser itself reports, so a later change that
  // revives the encoding is caught rather than silently repricing every
  // observation containing an emoji.
  it.each([
    ["an emoji", "hello 😀 world"],
    ["a musical symbol", "𝄞 clef"],
    ["a multi-person emoji sequence", "👨‍👩‍👧‍👦 family"],
    ["a regional indicator pair", "🇮🇳 flag"],
    ["text with no astral characters", "plain ascii text"],
  ])("counts %s as the tokeniser does", (_label, text) => {
    expect(tokenCount({ model: gpt4o, text })).toBe(
      encoding.encode(text, "all").length,
    );
  });
});

describe("token count of chat messages with tool calls", () => {
  // The tool-call objects must be serialised before counting. Passing them to
  // the tokeniser as-is stringifies them through JS object coercion, so the
  // function name and arguments cost nothing and every call is counted as the
  // same "[object Object]" string.
  it("counts a tool call by its serialised arguments, not [object Object]", () => {
    const toolCalls = [
      {
        id: "call_abc123",
        type: "function",
        function: {
          name: "get_current_weather",
          arguments: '{"location":"Paris, France","unit":"celsius"}',
        },
      },
    ];
    const text = [
      { role: "assistant", content: "Let me check.", tool_calls: toolCalls },
    ];

    const expected =
      3 +
      encoding.encode("assistant", "all").length +
      encoding.encode("Let me check.", "all").length +
      encoding.encode(JSON.stringify(toolCalls), "all").length +
      3;

    expect(tokenCount({ model: gpt4o, text })).toBe(expected);
  });
});

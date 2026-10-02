import { describe, expect, it } from "vitest";

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

describe("openAI chat token count", () => {
  it("prices a tool call by its contents rather than as [object Object]", () => {
    // An assistant turn that calls a tool carries the call as an object. Passing
    // that object to the tokeniser unchanged stringifies it to "[object Object]",
    // which is a handful of tokens no matter how large the call actually is.
    const withToolCalls = tokenCount({
      model: gpt4o,
      text: [
        { role: "assistant", content: "Let me check.", tool_calls: toolCalls },
      ],
    });

    const withoutToolCalls = tokenCount({
      model: gpt4o,
      text: [{ role: "assistant", content: "Let me check." }],
    });

    expect(withToolCalls).toBeDefined();
    expect(withoutToolCalls).toBeDefined();

    // The function name and its JSON arguments alone run past twenty tokens, so
    // anything near the "[object Object]" cost of four would be the old undercount.
    expect(
      (withToolCalls as number) - (withoutToolCalls as number),
    ).toBeGreaterThan(20);
  });

  it("counts a tool call the same whether the SDK sent it as an object or as JSON", () => {
    const asObject = tokenCount({
      model: gpt4o,
      text: [
        { role: "assistant", content: "Let me check.", tool_calls: toolCalls },
      ],
    });

    const asJson = tokenCount({
      model: gpt4o,
      text: [
        {
          role: "assistant",
          content: "Let me check.",
          tool_calls: JSON.stringify(toolCalls),
        },
      ],
    });

    expect(asObject).toBe(asJson);
  });

  it("still counts a plain assistant message the same as before", () => {
    expect(
      tokenCount({
        model: gpt4o,
        text: [{ role: "user", content: "Hello world" }],
      }),
    ).toBe(9);
  });
});

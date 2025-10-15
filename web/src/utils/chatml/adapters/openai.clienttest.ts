jest.mock("@langfuse/shared", () => ({
  ChatMessageRole: {
    System: "system",
    Developer: "developer",
    User: "user",
    Assistant: "assistant",
    Tool: "tool",
    Model: "model",
  },
}));

import { normalizeInput } from "./index";
import { openAIAdapter } from "./openai";

describe("OpenAI Adapter", () => {
  it("should detect OpenAI and reject LangGraph", () => {
    expect(openAIAdapter.detect({ observationName: "OpenAI-generation" })).toBe(
      true,
    );

    expect(
      openAIAdapter.detect({
        metadata: { messages: [{ role: "user", content: "test" }] },
      }),
    ).toBe(true);

    expect(openAIAdapter.detect({ metadata: { framework: "langgraph" } })).toBe(
      false,
    );

    expect(
      openAIAdapter.detect({
        metadata: { langgraph_node: "agent", langgraph_step: 3 },
      }),
    ).toBe(false);

    expect(
      openAIAdapter.detect({
        metadata: {
          messages: [{ type: "human", content: "test" }],
        },
      }),
    ).toBe(false);
  });

  it("should normalize tool_calls arguments to JSON strings", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: {
                name: "get_weather",
                arguments: { city: "NYC", units: "celsius" },
              },
            },
          ],
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);

    // Verify arguments were stringified (ChatMlSchema nests in json.json due to content union quirk)
    const toolCalls = result.data?.[0].json?.json?.tool_calls;
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].function.arguments).toBe(
      '{"city":"NYC","units":"celsius"}',
    );
  });

  it("should handle multimodal content (array of parts)", () => {
    const input = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/image.jpg" },
            },
          ],
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data?.[0].content)).toBe(true);
  });

  it("should remove null fields from messages", () => {
    const input = {
      messages: [
        {
          role: "user",
          content: "Hello",
          tool_call_id: null,
          name: null,
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);

    // When all extra fields are null and removed, json field won't exist (correct behavior)
    expect(result.data?.[0].role).toBe("user");
    expect(result.data?.[0].content).toBe("Hello");
  });

  it("should stringify tool message object content", () => {
    const input = {
      messages: [
        {
          role: "tool",
          content: { temperature: 72, conditions: "sunny" },
          tool_call_id: "call_123",
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);
    expect(typeof result.data?.[0].content).toBe("string");
    expect(result.data?.[0].content).toBe(
      '{"temperature":72,"conditions":"sunny"}',
    );
  });
});

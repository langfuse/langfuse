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

import { normalizeInput, normalizeOutput } from "./index";
import { openaiChatCompletionAdapter } from "./openai-chat-completion";

describe("OpenAI Chat Completion Adapter", () => {
  it("should detect Chat Completions API formats", () => {
    // Request format
    // using the metadata key here
    expect(
      openaiChatCompletionAdapter.detect({
        metadata: {
          tools: [{ type: "function", function: { name: "test" } }],
          messages: [{ role: "user", content: "test" }],
        },
      }),
    ).toBe(true);

    // Response format with nested tool_calls
    // using the data key here, result should be same as metadata
    expect(
      openaiChatCompletionAdapter.detect({
        data: {
          role: "assistant",
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: { name: "get_weather", arguments: "{}" },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("should handle request format with tools and flatten tool_calls", () => {
    const input = {
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object" },
          },
        },
      ],
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: {
                name: "get_weather",
                arguments: { location: "NYC" },
              },
            },
          ],
        },
      ],
    };

    const result = normalizeInput(input, {
      framework: "openai-chat-completion",
    });
    expect(result.success).toBe(true);

    // Tools attached to messages
    expect(result.data?.[0].tools).toHaveLength(1);
    expect(result.data?.[0].tools?.[0].name).toBe("get_weather");

    // Tool calls flattened
    expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");
    expect(result.data?.[0].tool_calls?.[0].arguments).toBe(
      '{"location":"NYC"}',
    );
  });

  it("should handle response format with tool calls", () => {
    const output = {
      role: "assistant",
      tool_calls: [
        {
          id: "call_xyz",
          type: "function",
          function: {
            name: "query_db",
            arguments: { query: "test" },
          },
        },
      ],
    };

    const result = normalizeOutput(output, {
      framework: "openai-chat-completion",
    });
    expect(result.success).toBe(true);

    expect(result.data?.[0].tool_calls?.[0].name).toBe("query_db");
    expect(result.data?.[0].tool_calls?.[0].arguments).toBe('{"query":"test"}');
  });
});

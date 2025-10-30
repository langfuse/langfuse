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
import { openAIAdapter } from "./openai";

describe("OpenAI Adapter", () => {
  describe("detection", () => {
    it("should detect OpenAI and reject LangGraph", () => {
      expect(
        openAIAdapter.detect({ observationName: "OpenAI-generation" }),
      ).toBe(true);

      expect(
        openAIAdapter.detect({
          metadata: { messages: [{ role: "user", content: "test" }] },
        }),
      ).toBe(true);

      expect(
        openAIAdapter.detect({ metadata: { framework: "langgraph" } }),
      ).toBe(false);

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

    it("should detect Chat Completions API formats", () => {
      // Request format with {tools, messages}
      expect(
        openAIAdapter.detect({
          metadata: {
            tools: [{ type: "function", function: { name: "test" } }],
            messages: [{ role: "user", content: "test" }],
          },
        }),
      ).toBe(true);

      // Response format with nested tool_calls (via data field)
      expect(
        openAIAdapter.detect({
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

    // Verify tool_calls were flattened to ChatML format and arguments were stringified
    const toolCalls = result.data?.[0].tool_calls;
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].name).toBe("get_weather");
    expect(toolCalls?.[0].arguments).toBe('{"city":"NYC","units":"celsius"}');
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

  describe("Chat Completions API", () => {
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

      const result = normalizeInput(input, { framework: "openai" });
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

      const result = normalizeOutput(output, { framework: "openai" });
      expect(result.success).toBe(true);

      expect(result.data?.[0].tool_calls?.[0].name).toBe("query_db");
      expect(result.data?.[0].tool_calls?.[0].arguments).toBe(
        '{"query":"test"}',
      );
    });
  });
});

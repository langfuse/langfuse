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

    it("should reject Microsoft Agent format with top-level parts", () => {
      // Microsoft Agent/Gemini use top-level parts, OpenAI uses parts inside content
      const input = [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];

      // Should reject when passed as metadata
      expect(openAIAdapter.detect({ metadata: input })).toBe(false);

      // Should also reject when passed as data
      expect(openAIAdapter.detect({ metadata: {}, data: input })).toBe(false);
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

  it("should stringify simple tool message object content (1-2 scalar keys)", () => {
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
    // Simple objects (< 5 keys) get stringified, not spread
    expect(typeof result.data?.[0].content).toBe("string");
    expect(result.data?.[0].content).toBe(
      '{"temperature":72,"conditions":"sunny"}',
    );
    expect(result.data?.[0].tool_call_id).toBe("call_123");
  });

  it("should spread rich tool message object content (3+ keys or nested) for table rendering", () => {
    const input = {
      messages: [
        {
          role: "tool",
          content: {
            PatientNo: "123",
            Firstname: "John",
            Lastname: "Doe",
            Email: "john@example.com",
            Mobile: "1234567890",
          },
          tool_call_id: "call_456",
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);
    // Rich objects (5+ keys) get spread for passthrough rendering
    expect(result.data?.[0].content).toBeUndefined();
    expect(result.data?.[0].json?.json?.PatientNo).toBe("123");
    expect(result.data?.[0].json?.json?.Firstname).toBe("John");
    expect(result.data?.[0].tool_call_id).toBe("call_456");
  });

  describe("OpenAI Agents SDK format", () => {
    it("should convert function_call to assistant with tool_calls", () => {
      const output = [
        {
          type: "function_call",
          name: "get_weather",
          arguments: { city: "SF" },
          call_id: "call_123",
        },
      ];

      const result = normalizeOutput(output, { framework: "openai" });

      expect(result.data?.[0].role).toBe("assistant");
      expect(result.data?.[0].tool_calls?.[0]).toEqual({
        id: "call_123",
        name: "get_weather",
        arguments: '{"city":"SF"}',
        type: "function",
      });
    });

    it("should convert function_call_output to tool message", () => {
      const input = [
        {
          type: "function_call_output",
          call_id: "call_456",
          output: "It's sunny.",
        },
      ];

      const result = normalizeInput(input, { framework: "openai" });

      expect(result.data?.[0].role).toBe("tool");
      expect(result.data?.[0].tool_call_id).toBe("call_456");
      expect(result.data?.[0].content).toBe("It's sunny.");
    });

    it("should attach tools to messages in Responses API format", () => {
      const output = {
        tools: [{ name: "get_weather", type: "function", description: null }],
        output: [{ type: "function_call", name: "get_weather", call_id: "c1" }],
      };

      const result = normalizeOutput(output, { framework: "openai" });

      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tools?.[0].description).toBe("");
    });

    it("should extract text from output_text content", () => {
      const output = {
        output: [
          {
            content: [{ type: "output_text", text: "Hello" }],
            role: "assistant",
          },
        ],
      };

      const result = normalizeOutput(output, { framework: "openai" });

      expect(result.data?.[0].content).toBe("Hello");
    });
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

    it("should handle request format with multiple tools and multiple messages", () => {
      const input = {
        tools: [
          {
            type: "function",
            function: {
              name: "tool_a",
              description: "First tool",
              parameters: {
                type: "object",
                properties: { param1: { type: "string" } },
                required: ["param1"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "tool_b",
              description: "Second tool",
              parameters: {
                type: "object",
                properties: { param2: { type: "string" } },
                required: ["param2"],
              },
            },
          },
        ],
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "test query" },
        ],
      };

      const result = normalizeInput(input, { framework: "openai" });
      expect(result.success).toBe(true);

      // Tools should be attached to ALL messages
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].tools).toHaveLength(2);
      expect(result.data?.[1].tools).toHaveLength(2);

      // Check tool definitions are properly flattened
      expect(result.data?.[0].tools?.[0].name).toBe("tool_a");
      expect(result.data?.[0].tools?.[0].description).toBe("First tool");
      expect(result.data?.[0].tools?.[0].parameters).toBeDefined();

      expect(result.data?.[0].tools?.[1].name).toBe("tool_b");
      expect(result.data?.[0].tools?.[1].description).toBe("Second tool");
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

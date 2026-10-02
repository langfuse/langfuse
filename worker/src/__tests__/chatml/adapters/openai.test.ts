import { describe, it, expect } from "vitest";
import {
  openAIAdapter,
  normalizeInput,
  normalizeOutput,
  extractAdditionalInput,
} from "@langfuse/shared";

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

    it("should not crash when detecting messages array with null items", () => {
      // tests for bug when detection code tried to access .type on null items
      const messagesWithNull = {
        messages: [
          { role: "user", content: "Hello" },
          null, // This null item should not crash detection
          { role: "assistant", content: "Hi there!" },
        ],
      };

      // Should not throw TypeError when detecting
      expect(() =>
        openAIAdapter.detect({ metadata: messagesWithNull }),
      ).not.toThrow();

      // Should still successfully detect as OpenAI format despite null items
      expect(openAIAdapter.detect({ metadata: messagesWithNull })).toBe(true);
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

  it("should skip null entries in tool_calls arrays", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            null,
            {
              id: "call_valid",
              type: "function",
              function: {
                name: "get_balance",
                arguments: { account: "123" },
              },
            },
          ],
        },
      ],
    };

    const result = normalizeInput(input, { framework: "openai" });
    expect(result.success).toBe(true);

    const toolCalls = result.data?.[0].tool_calls;
    expect(toolCalls?.length).toBe(1);
    expect(toolCalls?.[0].name).toBe("get_balance");
    expect(toolCalls?.[0].arguments).toBe('{"account":"123"}');
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

  describe("Responses API request format", () => {
    // Shape logged by SDK wrappers for Responses API calls,
    // e.g. langfuse.openai (langfuse-python >= 4.9.1)
    const responsesRequestInput = {
      input: [
        {
          role: "system",
          content: "# Expense Policy Assistant\nAnswer using policy documents.",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Can I expense a $50 team lunch?" },
          ],
        },
        {
          id: "rs_123",
          summary: [],
          type: "reasoning",
          content: [],
          encrypted_content: "gAAAAA...",
        },
        {
          arguments: '{"query":"team lunch limit"}',
          call_id: "call_123",
          name: "SearchExpensePolicy",
          type: "function_call",
          id: "fc_123",
          status: "completed",
        },
        {
          call_id: "call_123",
          output: "Meals with clients are capped at $75 per person.",
          type: "function_call_output",
        },
      ],
      tools: [
        {
          name: "SearchExpensePolicy",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
          strict: true,
          type: "function",
          description: "Search the expense policy",
        },
      ],
      // Junk value logged by an SDK bug; must not break parsing
      tool_choice: "<openai.Omit object at 0x104f0e900>",
      parallel_tool_calls: false,
    };

    it("should detect Responses API request format structurally", () => {
      expect(
        openAIAdapter.detect({ metadata: {}, data: responsesRequestInput }),
      ).toBe(true);

      expect(openAIAdapter.detect({ metadata: responsesRequestInput })).toBe(
        true,
      );

      // Embeddings-style {input: [...strings]} is not a chat request
      expect(
        openAIAdapter.detect({
          metadata: {},
          data: {
            input: ["some text", "other text"],
            model: "text-embedding-3-small",
          },
        }),
      ).toBe(false);

      // Top-level parts identify Microsoft Agent/Gemini, not OpenAI
      expect(
        openAIAdapter.detect({
          metadata: {},
          data: {
            input: [{ role: "user", parts: [{ type: "text", content: "Hi" }] }],
          },
        }),
      ).toBe(false);

      // Role-less items with LangChain types are not Responses API items
      expect(
        openAIAdapter.detect({
          metadata: {},
          data: {
            input: [
              { type: "human", content: "hi" },
              { type: "ai", content: "hello" },
            ],
          },
        }),
      ).toBe(false);
    });

    it("should treat input array as messages and attach tools (real-world SDK payload)", () => {
      // No framework/name hints: exercises structural detection end-to-end
      const result = normalizeInput(responsesRequestInput, {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);

      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[1].role).toBe("user");
      expect(Array.isArray(result.data?.[1].content)).toBe(true);

      // Encrypted-only reasoning renders as redacted thinking, not a roleless
      // JSON bubble.
      expect(result.data?.[2].role).toBe("assistant");
      expect(result.data?.[2].content).toBe("");
      expect(result.data?.[2].redacted_thinking).toEqual([
        { type: "redacted_thinking", data: "gAAAAA..." },
      ]);

      // function_call item converted to assistant message with tool_calls
      expect(result.data?.[3].role).toBe("assistant");
      expect(result.data?.[3].tool_calls?.[0]).toEqual({
        id: "call_123",
        name: "SearchExpensePolicy",
        arguments: '{"query":"team lunch limit"}',
        type: "function",
      });

      // function_call_output item converted to tool message
      expect(result.data?.[4].role).toBe("tool");
      expect(result.data?.[4].tool_call_id).toBe("call_123");
      expect(result.data?.[4].content).toBe(
        "Meals with clients are capped at $75 per person.",
      );

      // Tool definitions attached to all messages
      expect(result.data?.[0].tools).toHaveLength(1);
      expect(result.data?.[0].tools?.[0].name).toBe("SearchExpensePolicy");
      expect(result.data?.[0].tools?.[0].description).toBe(
        "Search the expense policy",
      );
    });

    it("should not duplicate the conversation in additional input", () => {
      const additionalInput = extractAdditionalInput(responsesRequestInput);

      expect(additionalInput?.input).toBeUndefined();
      expect(additionalInput?.tool_choice).toBe(
        "<openai.Omit object at 0x104f0e900>",
      );
      expect(additionalInput?.parallel_tool_calls).toBe(false);
    });

    it("should keep an unconsumed input sibling in additional input", () => {
      // e.g. LangGraph state: `messages` holds the conversation, not `input`
      const additionalInput = extractAdditionalInput({
        messages: [{ role: "user", content: "Hi" }],
        input: "user question",
      });

      expect(additionalInput?.input).toBe("user question");
      expect(additionalInput?.messages).toBeUndefined();
    });

    it("should handle input array without tools", () => {
      const input = {
        input: [
          { role: "user", content: "What is the meaning of life?" },
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "Considering philosophy" }],
            content: [],
          },
        ],
      };

      const result = normalizeInput(input, { framework: "openai" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].role).toBe("user");
      expect(result.data?.[1].role).toBe("assistant");
      expect(result.data?.[1].thinking?.[0].content).toBe(
        "Considering philosophy",
      );
    });

    it("should handle built-in tool items in a Responses API conversation", () => {
      const input = {
        input: [
          { role: "user", content: "Search for the latest policy" },
          {
            type: "web_search_call",
            id: "ws_123",
            status: "completed",
            action: { type: "search", query: "latest expense policy" },
          },
        ],
      };

      expect(openAIAdapter.detect({ metadata: {}, data: input })).toBe(true);

      const result = normalizeInput(input, {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].role).toBe("user");
      expect(result.data?.[1]).toMatchObject({
        type: "web_search_call",
        json: {
          id: "ws_123",
          status: "completed",
          action: { type: "search", query: "latest expense policy" },
        },
      });
    });

    it("should map string input with a tools sibling to a user message", () => {
      // langfuse-python logs {input: "...", tools, ...} when tool fields are set
      const input = {
        input: "Can I expense a $50 team lunch?",
        tools: [{ name: "get_weather", type: "function", description: "" }],
        tool_choice: "auto",
      };

      expect(openAIAdapter.detect({ metadata: {}, data: input })).toBe(true);

      const result = normalizeInput(input, {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].role).toBe("user");
      expect(result.data?.[0].content).toBe("Can I expense a $50 team lunch?");
      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
    });

    it("should prepend instructions as a system message for string input", () => {
      const input = {
        instructions: "You are an expense policy assistant.",
        input: "Can I expense a $50 team lunch?",
      };

      expect(openAIAdapter.detect({ metadata: {}, data: input })).toBe(true);

      const result = normalizeInput(input, {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[0].content).toBe(
        "You are an expense policy assistant.",
      );
      expect(result.data?.[1].role).toBe("user");
      expect(result.data?.[1].content).toBe("Can I expense a $50 team lunch?");

      expect(extractAdditionalInput(input)).toEqual({});
    });

    it("should not claim bare string input without request siblings", () => {
      const input = { input: "just some text" };

      expect(openAIAdapter.detect({ metadata: {}, data: input })).toBe(false);

      const result = normalizeInput(input, { framework: "openai" });

      expect(result.success).toBe(false);
    });

    it("should not treat embeddings-style string input as chat", () => {
      const result = normalizeInput(
        { input: ["some text", "other text"], model: "text-embedding-3-small" },
        { framework: "openai" },
      );

      expect(result.success).toBe(false);
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

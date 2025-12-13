import { describe, it, expect } from "vitest";
import {
  aisdkAdapter,
  normalizeInput,
  type NormalizerContext,
} from "@langfuse/shared";

describe("AI SDK Adapter", () => {
  describe("detection", () => {
    it("should detect AI SDK via metadata attributes", () => {
      // operation.name starting with "ai."
      expect(
        aisdkAdapter.detect({
          metadata: {
            attributes: {
              "operation.name": "ai.generateText.doGenerate",
            },
          },
        }),
      ).toBe(true);

      // scope.name === "ai"
      expect(
        aisdkAdapter.detect({
          metadata: {
            scope: {
              name: "ai",
            },
          },
        }),
      ).toBe(true);

      // Both indicators together
      expect(
        aisdkAdapter.detect({
          metadata: {
            scope: {
              name: "ai",
            },
            attributes: {
              "operation.name": "ai.generateText.doGenerate",
              "ai.model.provider": "openai.responses",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect AI SDK via framework hint", () => {
      expect(aisdkAdapter.detect({ framework: "aisdk" })).toBe(true);
      expect(aisdkAdapter.detect({ framework: "aisdk-v5" })).toBe(true);
    });

    it("should not detect non-AI SDK formats", () => {
      // LangGraph scope
      expect(
        aisdkAdapter.detect({
          metadata: {
            scope: { name: "langfuse-sdk" },
          },
        }),
      ).toBe(false);

      // No AI SDK markers
      expect(
        aisdkAdapter.detect({
          metadata: {
            attributes: {
              "operation.name": "custom.operation",
            },
          },
        }),
      ).toBe(false);

      // Empty metadata
      expect(aisdkAdapter.detect({ metadata: {} })).toBe(false);
    });

    it("should detect AI SDK via structural patterns (fallback)", () => {
      // Tool-call content structure
      const toolCallData = [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_123",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
        },
      ];
      expect(aisdkAdapter.detect({ data: toolCallData })).toBe(true);

      // Tool-result content structure
      const toolResultData = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_123",
              toolName: "get_weather",
              output: { type: "text", value: "sunny" },
            },
          ],
        },
      ];
      expect(aisdkAdapter.detect({ data: toolResultData })).toBe(true);
    });
  });

  describe("preprocessing - provider field variations", () => {
    it("should normalize tool calls (input/args variants)", () => {
      // OpenAI uses 'input' field
      const openaiInput = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_abc",
                toolName: "get_weather",
                input: { city: "NYC" },
              },
            ],
          },
        ],
      };

      const openaiResult = normalizeInput(openaiInput, { framework: "aisdk" });
      expect(openaiResult.success).toBe(true);
      expect(openaiResult.data?.[0].tool_calls?.[0].id).toBe("call_abc");
      expect(openaiResult.data?.[0].tool_calls?.[0].name).toBe("get_weather");
      expect(openaiResult.data?.[0].tool_calls?.[0].arguments).toBe(
        '{"city":"NYC"}',
      );

      // Bedrock uses 'args' field
      const bedrockInput = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "tooluse_abc",
                toolName: "agentResponse",
                args: {
                  response: "Processing...",
                  reasoning: "Need to respond",
                },
              },
            ],
          },
        ],
      };

      const bedrockResult = normalizeInput(bedrockInput, {
        framework: "aisdk",
      });
      expect(bedrockResult.success).toBe(true);
      expect(bedrockResult.data?.[0].tool_calls?.[0].id).toBe("tooluse_abc");
      expect(bedrockResult.data?.[0].tool_calls?.[0].name).toBe(
        "agentResponse",
      );
      expect(bedrockResult.data?.[0].tool_calls?.[0].arguments).toContain(
        "response",
      );
      expect(bedrockResult.data?.[0].tool_calls?.[0].arguments).toContain(
        "reasoning",
      );
    });

    it("should normalize tool results (output/result variants)", () => {
      // OpenAI uses 'output' field with nested {type: "text", value: "..."}
      const openaiInput = {
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_abc",
                toolName: "get_weather",
                output: {
                  type: "text",
                  value: "72°F, sunny",
                },
              },
            ],
          },
        ],
      };

      const openaiResult = normalizeInput(openaiInput, { framework: "aisdk" });
      expect(openaiResult.success).toBe(true);
      expect(openaiResult.data?.[0].tool_call_id).toBe("call_abc");
      expect(openaiResult.data?.[0].content).toBe("72°F, sunny");

      // Bedrock uses 'result' field with array/object
      const bedrockInput = {
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "tooluse_abc",
                toolName: "agentResponse",
                result: [
                  {
                    id: "some_id",
                    code: "SOME_CODE",
                  },
                ],
              },
            ],
          },
        ],
      };

      const bedrockResult = normalizeInput(bedrockInput, {
        framework: "aisdk",
      });
      expect(bedrockResult.success).toBe(true);
      expect(bedrockResult.data?.[0].tool_call_id).toBe("tooluse_abc");
      expect(typeof bedrockResult.data?.[0].content).toBe("string");
    });

    it("should strip provider-specific metadata", () => {
      // OpenAI providerOptions
      const openaiInput = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_123",
                toolName: "test",
                input: {},
                providerOptions: {
                  openai: { itemId: "fc_456" },
                },
              },
            ],
          },
        ],
      };

      const openaiResult = normalizeInput(openaiInput, { framework: "aisdk" });
      expect(openaiResult.success).toBe(true);
      const toolCall = openaiResult.data?.[0].tool_calls?.[0];
      expect(toolCall).toBeDefined();
      expect(toolCall).not.toHaveProperty("providerOptions");

      // Bedrock providerMetadata
      const bedrockInput = {
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant",
            providerMetadata: {
              bedrock: {
                cachePoint: { type: "default" },
              },
            },
          },
        ],
      };

      const bedrockResult = normalizeInput(bedrockInput, {
        framework: "aisdk",
      });
      expect(bedrockResult.success).toBe(true);
      expect(bedrockResult.data?.[0].role).toBe("system");
      expect(bedrockResult.data?.[0].content).toBe(
        "You are a helpful assistant",
      );
      expect(bedrockResult.data?.[0]).not.toHaveProperty("providerMetadata");
    });
  });

  describe("tool handling", () => {
    it("should attach tools to messages when present", () => {
      const input = {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Test" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather info",
            inputSchema: {
              type: "object",
              properties: {
                city: { type: "string" },
              },
            },
          },
        ],
      };

      const result = normalizeInput(input, { framework: "aisdk" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].tools).toBeDefined();
      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tools?.[0].parameters).toBeDefined();
    });

    it("should stringify simple tool result objects (1-2 scalar keys)", () => {
      const input = {
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_123",
                toolName: "get_weather",
                output: {
                  type: "text",
                  value: '{"temperature":72,"conditions":"sunny"}',
                },
              },
            ],
          },
        ],
      };

      const result = normalizeInput(input, { framework: "aisdk" });
      expect(result.success).toBe(true);
      expect(typeof result.data?.[0].content).toBe("string");
      expect(result.data?.[0].content).toContain("temperature");
    });
  });

  describe("mixed content", () => {
    it("should extract text from single text item", () => {
      const input = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What's the weather?",
              },
            ],
          },
        ],
      };

      const result = normalizeInput(input, { framework: "aisdk" });
      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("What's the weather?");
    });

    it("should concatenate multiple text items", () => {
      const input = {
        messages: [
          {
            role: "assistant",
            content: [
              { type: "text", text: "Hello " },
              { type: "text", text: "world!" },
            ],
          },
        ],
      };

      const result = normalizeInput(input, { framework: "aisdk" });
      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("Hello world!");
    });

    it("should handle messages with both text and tool calls", () => {
      const input = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Let me check that for you.",
              },
              {
                type: "tool-call",
                toolCallId: "call_123",
                toolName: "get_weather",
                input: { city: "SF" },
              },
            ],
          },
        ],
      };

      const result = normalizeInput(input, { framework: "aisdk" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("Let me check that for you.");
      expect(result.data?.[0].tool_calls).toBeDefined();
      expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");
    });
  });

  describe("array handling", () => {
    it("should handle array of messages without wrapper", () => {
      const input = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_123",
              toolName: "test",
              input: {},
            },
          ],
        },
      ];

      const result = normalizeInput(input, { framework: "aisdk" });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
      expect(result.data?.[0].content).toBe("Hello");
      expect(result.data?.[1].tool_calls).toBeDefined();
    });
  });

  describe("raw tool call array handling (OUTPUT format)", () => {
    it("should convert raw tool call array to assistant message with tool_calls", () => {
      // This is the OUTPUT format from ai.generateText.doGenerate when model makes tool calls
      const rawToolCallArray = [
        {
          toolCallId: "call_abc",
          toolName: "get_weather",
          input: { city: "NYC" },
        },
        {
          toolCallId: "call_xyz",
          toolName: "get_time",
          input: { timezone: "EST" },
        },
      ];

      const result = normalizeInput(rawToolCallArray, { framework: "aisdk" });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);

      // Should be assistant message
      const msg = result.data?.[0];
      expect(msg?.role).toBe("assistant");
      expect(msg?.content).toBe("");

      // Should have tool_calls array
      expect(msg?.tool_calls).toBeDefined();
      expect(msg?.tool_calls?.length).toBe(2);

      // Verify first tool call structure
      expect(msg?.tool_calls?.[0].id).toBe("call_abc");
      expect(msg?.tool_calls?.[0].name).toBe("get_weather");
      expect(msg?.tool_calls?.[0].arguments).toBe('{"city":"NYC"}');
      expect(msg?.tool_calls?.[0].type).toBe("function");

      // Verify second tool call
      expect(msg?.tool_calls?.[1].id).toBe("call_xyz");
      expect(msg?.tool_calls?.[1].name).toBe("get_time");
      expect(msg?.tool_calls?.[1].arguments).toBe('{"timezone":"EST"}');
    });

    it("should handle Bedrock's args field (instead of input)", () => {
      const bedrockToolCallArray = [
        {
          toolCallId: "tooluse_123",
          toolName: "agentResponse",
          args: {
            response: "Processing your request",
            reasoning: "Need to respond to user",
          },
        },
      ];

      const result = normalizeInput(bedrockToolCallArray, {
        framework: "aisdk",
      });

      expect(result.success).toBe(true);
      const msg = result.data?.[0];

      expect(msg?.tool_calls?.length).toBe(1);
      expect(msg?.tool_calls?.[0].id).toBe("tooluse_123");
      expect(msg?.tool_calls?.[0].name).toBe("agentResponse");
      expect(msg?.tool_calls?.[0].arguments).toContain("response");
      expect(msg?.tool_calls?.[0].arguments).toContain("reasoning");
    });

    it("should attach tools from metadata context to raw tool call array", () => {
      const rawToolCallArray = [
        {
          toolCallId: "call_123",
          toolName: "calculator",
          input: { operation: "add", a: 1, b: 2 },
        },
      ];

      const metadata = {
        tools: [
          {
            type: "function",
            name: "calculator",
            description: "Perform math operations",
            inputSchema: {
              type: "object",
              properties: {
                operation: { type: "string" },
                a: { type: "number" },
                b: { type: "number" },
              },
            },
          },
        ],
        scope: {
          name: "ai",
        },
      };

      const result = normalizeInput(rawToolCallArray, {
        metadata,
        framework: "aisdk",
      });

      expect(result.success).toBe(true);
      const msg = result.data?.[0];

      // Tools should be attached from metadata
      expect(msg?.tools).toBeDefined();
      expect(msg?.tools?.length).toBe(1);
      expect(msg?.tools?.[0].name).toBe("calculator");
      expect(msg?.tools?.[0].description).toBe("Perform math operations");
      expect(msg?.tools?.[0].parameters).toBeDefined();

      // Tool call should still be present
      expect(msg?.tool_calls?.length).toBe(1);
      expect(msg?.tool_calls?.[0].name).toBe("calculator");
    });
  });
});

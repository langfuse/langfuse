// Mock the problematic @langfuse/shared import before importing our functions
jest.mock("@langfuse/shared", () => {
  const { z } = require("zod/v4");

  const OpenAITextContentPart = z.object({
    type: z.literal("text"),
    text: z.string(),
  });

  const OpenAIImageContentPart = z.object({
    type: z.literal("image_url"),
    image_url: z.union([
      z.string(),
      z.object({
        url: z.string(),
        detail: z.enum(["auto", "low", "high"]).optional(),
      }),
    ]),
  });

  return {
    ChatMessageRole: {
      System: "system",
      Developer: "developer",
      User: "user",
      Assistant: "assistant",
      Tool: "tool",
      Model: "model",
    },
    ChatMessageType: {
      PublicAPICreated: "public-api-created",
      AssistantToolCall: "assistant-tool-call",
      ToolResult: "tool-result",
      Placeholder: "placeholder",
      System: "system",
    },
    OpenAIToolSchema: z.object({
      type: z.literal("function"),
      function: z.object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.any().optional(),
      }),
    }),
    BaseChatMlMessageSchema: z
      .object({
        role: z.string().optional(),
        name: z.string().optional(),
        content: z
          .union([
            z.record(z.string(), z.any()),
            z.string(),
            z.array(z.any()),
            z.any(), // Simplified - was OpenAIContentSchema
          ])
          .nullish(),
        audio: z.any().optional(),
        additional_kwargs: z.record(z.string(), z.any()).optional(),
        tools: z.array(z.any()).optional(),
        tool_calls: z.array(z.any()).optional(),
        tool_call_id: z.string().optional(),
      })
      .passthrough(),
    isOpenAITextContentPart: (content: any) => {
      return OpenAITextContentPart.safeParse(content).success;
    },
    isOpenAIImageContentPart: (content: any) => {
      return OpenAIImageContentPart.safeParse(content).success;
    },
  };
});

import { normalizeInput, normalizeOutput } from "./adapters";
import { convertChatMlToPlayground } from "./playgroundConverter";
import { extractTools } from "./extractTools";

describe("Playground Jump Full Pipeline", () => {
  it("should convert full trace with tool calls through mapper and playground conversion", () => {
    // Same data as integration test
    const observationName = "OpenAI-generation";
    const metadata = {
      language: "en",
      resourceAttributes: {
        "telemetry.sdk.language": "python",
        "telemetry.sdk.name": "opentelemetry",
        "telemetry.sdk.version": "1.34.1",
        "deployment.environment": "prod",
      },
      scope: {
        name: "langfuse-sdk",
        version: "3.2.3",
        attributes: {
          public_key: "pk-lf-1234567890",
        },
      },
    };

    const input = {
      tools: [
        {
          type: "function",
          function: {
            name: "get_user_info",
            description: "Retrieve user contact information",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "query_database",
            description: "Query the knowledge base for information",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
                lang: {
                  type: "string",
                  description: "Language code",
                },
              },
              required: ["query", "lang"],
            },
          },
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Use tools to gather information before responding.",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_user_info_001",
              type: "function",
              function: {
                name: "get_user_info",
                arguments: {},
              },
            },
          ],
        },
        {
          role: "tool",
          content: JSON.stringify({
            userInfo: {
              displayName: "Test User",
              email: "test@example.com",
            },
          }),
          tool_call_id: "call_user_info_001",
        },
        {
          role: "user",
          content: "How do I configure the API settings?",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_query_db_002",
              type: "function",
              function: {
                name: "query_database",
                arguments: {
                  query: "configure API settings",
                  lang: "en",
                },
              },
            },
          ],
        },
        {
          role: "tool",
          content:
            "To configure API settings, go to Settings > API Configuration. Enter your API key and select the appropriate region.",
          name: "query_database",
          tool_call_id: "call_query_db_002",
        },
      ],
    };

    // const output = {
    //   role: "assistant",
    //   content:
    //     "To configure the API settings, follow these steps:\n\n1. Navigate to **Settings\n2. Enter your API key\n3. Select the appropriate region.",
    // };

    const ctx = { metadata, observationName };
    const inResult = normalizeInput(input, ctx);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");

    // convert all messages to playground format
    const playgroundMessages = inResult.data
      .map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Verify we got messages (if length is 0, button would be disabled!)
    expect(playgroundMessages.length).toBeGreaterThan(0);
    expect(playgroundMessages).toHaveLength(6);

    // Verify first assistant message with tool call
    const assistantWithToolCall1 = playgroundMessages[1];
    expect(assistantWithToolCall1?.type).toBe("assistant-tool-call");
    if (assistantWithToolCall1?.type === "assistant-tool-call") {
      expect(assistantWithToolCall1.toolCalls).toHaveLength(1);
      expect(assistantWithToolCall1.toolCalls[0].id).toBe("call_user_info_001");
      expect(assistantWithToolCall1.toolCalls[0].name).toBe("get_user_info");
      expect(assistantWithToolCall1.toolCalls[0].args).toEqual({});
    }

    // Verify first tool result
    const toolResult1 = playgroundMessages[2];
    expect(toolResult1?.type).toBe("tool-result");
    if (toolResult1?.type === "tool-result") {
      expect(toolResult1.toolCallId).toBe("call_user_info_001");
      expect(typeof toolResult1.content).toBe("string");
      expect(toolResult1.content).toContain("Test User");
    }

    // Verify second assistant message with tool call (object args)
    const assistantWithToolCall2 = playgroundMessages[4];
    expect(assistantWithToolCall2?.type).toBe("assistant-tool-call");
    if (assistantWithToolCall2?.type === "assistant-tool-call") {
      expect(assistantWithToolCall2.toolCalls).toHaveLength(1);
      expect(assistantWithToolCall2.toolCalls[0].id).toBe("call_query_db_002");
      expect(assistantWithToolCall2.toolCalls[0].name).toBe("query_database");
      // Object arguments should be parsed back to object
      expect(assistantWithToolCall2.toolCalls[0].args).toEqual({
        query: "configure API settings",
        lang: "en",
      });
    }

    // Verify second tool result
    const toolResult2 = playgroundMessages[5];
    expect(toolResult2?.type).toBe("tool-result");
    if (toolResult2?.type === "tool-result") {
      expect(toolResult2.toolCallId).toBe("call_query_db_002");
      expect(typeof toolResult2.content).toBe("string");
      expect(toolResult2.content).toContain("Settings > API Configuration");
    }
  });

  it("should handle Langchain Gemini-style tool definitions embedded in messages", () => {
    // Langchain Gemini format embeds tool definitions as messages with role="tool"
    // This test verifies that:
    // 1. Tool definition messages are filtered out of the message list
    // 2. Tool definitions are extracted and available for the playground
    const observationName = "VertexGemini";
    const metadata = {
      ls_provider: "google_vertexai",
      ls_model_name: "gemini-2.5-flash",
    };

    const input = [
      {
        role: "system",
        content: "You are a helpful assistant with access to tools.",
      },
      {
        role: "model",
        content: [
          {
            type: "text",
            text: "Hello! How can I help you today?",
          },
        ],
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "transition_to_next_stage",
            description:
              "Use this function to transition to the next stage when conditions are met",
            parameters: {
              properties: {
                reason: {
                  description: "Explanation of why transitioning",
                  type: "string",
                },
              },
              required: ["reason"],
              type: "object",
            },
          },
        },
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "get_user_info",
            description: "Retrieve user contact information",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        },
      },
      {
        role: "user",
        content: "What can you do?",
      },
    ];

    const ctx = { metadata, observationName };
    const inResult = normalizeInput(input, ctx);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");

    // Convert all messages to playground format
    const playgroundMessages = inResult.data
      .map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Should have 3 real messages (system, model, user)
    // Tool definition messages should be filtered out by the converter
    expect(playgroundMessages.length).toBe(3);

    // Filter out placeholder messages for role testing
    const regularMessages = playgroundMessages.filter(
      (msg) => msg.type !== "placeholder",
    );

    // Verify message roles
    expect(regularMessages[0]?.role).toBe("system");
    expect(regularMessages[1]?.role).toBe("model");
    expect(regularMessages[2]?.role).toBe("user");

    // All should have type public-api-created (regular messages)
    expect(playgroundMessages[0]?.type).toBe("public-api-created");
    expect(playgroundMessages[1]?.type).toBe("public-api-created");
    expect(playgroundMessages[2]?.type).toBe("public-api-created");

    // IMPORTANT: Test that tools are extracted from the Langchain Gemini input format
    // The parseTools function in JumpToPlaygroundButton.tsx needs to handle Langchain Gemini format
    // where tool definitions are embedded as messages with role="tool"

    // We need to test parseTools behavior directly
    // For now, manually verify the structure exists
    const toolMessages = input.filter(
      (msg: any) =>
        msg.role === "tool" &&
        typeof msg.content === "object" &&
        msg.content?.type === "function" &&
        msg.content?.function,
    );

    // Verify the structure that parseTools should handle
    expect(toolMessages.length).toBe(2);
    expect((toolMessages[0].content as any).function.name).toBe(
      "transition_to_next_stage",
    );
    expect((toolMessages[1].content as any).function.name).toBe(
      "get_user_info",
    );
  });

  it("should extract tools from Gemini format using extractTools utility", () => {
    const geminiInput = [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the current weather in a location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city name",
                },
              },
              required: ["location"],
            },
          },
        },
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "search_web",
            description: "Search the web for information",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
              },
              required: ["query"],
            },
          },
        },
      },
    ];

    // Test the exported extractTools utility directly
    const tools = extractTools(geminiInput);

    expect(tools.length).toBe(2);
    expect(tools[0]).toEqual({
      id: expect.any(String),
      name: "get_weather",
      description: "Get the current weather in a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city name",
          },
        },
        required: ["location"],
      },
    });
    expect(tools[1].name).toBe("search_web");
  });

  it("should stringify array content in tool messages for playground (eg as from langgraph)", () => {
    // CodeMirror expects string but got array in tool result content
    const input = [
      {
        role: "tool",
        content: [{ url: "https://example.com", title: "Example" }],
        tool_call_id: "call_123",
      },
    ];

    const inResult = normalizeInput(input, { framework: "langgraph" });
    expect(inResult.success).toBe(true);

    const playgroundMsg = convertChatMlToPlayground(inResult.data![0]);
    expect(playgroundMsg?.type).toBe("tool-result");
    // Array must be stringified, not left as object
    if (playgroundMsg && "content" in playgroundMsg) {
      expect(typeof playgroundMsg.content).toBe("string");
      expect(playgroundMsg.content).toBe(
        '[{"url":"https://example.com","title":"Example"}]',
      );
    }
  });

  it("should stringify multimodal array content in tool results", () => {
    // This format appears in some OpenAI traces where tool results have
    // complex nested structures with type/text fields
    const input = {
      tools: [
        {
          type: "function",
          function: {
            name: "get_user_contact_information",
            description: "Get user contact info",
            parameters: {},
          },
        },
      ],
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_user_info",
              type: "function",
              function: {
                name: "get_user_contact_information",
                arguments: {},
              },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "text",
              text: {
                userInformation: {
                  firstName: "John",
                  lastName: "Doe",
                  email: "john@example.com",
                },
              },
            },
          ],
          tool_call_id: "call_user_info",
        },
      ],
    };

    const ctx = { framework: "openai" };
    const inResult = normalizeInput(input, ctx);
    expect(inResult.success).toBe(true);

    // Convert all messages to playground format
    const playgroundMessages = inResult
      .data!.map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Find the tool result message
    const toolResult = playgroundMessages.find(
      (msg) => msg?.type === "tool-result",
    );

    expect(toolResult).toBeDefined();
    if (toolResult && "content" in toolResult) {
      // CRITICAL: Content must be stringified, not left as array/object
      // Otherwise CodeMirror will throw "value must be typeof string but got object"
      expect(typeof toolResult.content).toBe("string");

      // Verify it's valid JSON string
      const parsed = JSON.parse(toolResult.content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].type).toBe("text");
      expect(parsed[0].text.userInformation.firstName).toBe("John");
    }
  });

  it("should extract text from Vercel AI SDK content array format", () => {
    // Vercel AI SDK format: content as array with type/text structure
    const input = {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };

    const inResult = normalizeInput(input, {});
    expect(inResult.success).toBe(true);

    const playgroundMsg = convertChatMlToPlayground(inResult.data![0]);

    // Should extract text, not stringify array
    expect(
      playgroundMsg && "content" in playgroundMsg && playgroundMsg.content,
    ).toBe("Hello world");
    expect(
      playgroundMsg && "content" in playgroundMsg && playgroundMsg.content,
    ).not.toContain("[{");
  });

  it("should extract tools from Microsoft Agent Framework metadata", () => {
    // Microsoft Agent Framework stores tools in metadata.attributes["gen_ai.tool.definitions"]
    const input = [
      {
        role: "user",
        parts: [
          {
            type: "text",
            content: "What's the weather like in Portland?",
          },
        ],
      },
    ];

    const metadata = {
      attributes: {
        "gen_ai.provider.name": "microsoft.agent_framework",
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.tool.definitions": [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get the weather for a given location.",
              parameters: {
                properties: {
                  location: {
                    description: "The location to get the weather for.",
                    title: "Location",
                    type: "string",
                  },
                },
                required: ["location"],
                title: "get_weather_input",
                type: "object",
              },
            },
          },
          {
            type: "function",
            function: {
              name: "get_time",
              description: "Get the current time in a timezone.",
              parameters: {
                properties: {
                  timezone: {
                    description: "IANA timezone identifier",
                    type: "string",
                  },
                },
                required: ["timezone"],
                type: "object",
              },
            },
          },
        ],
      },
      scope: {
        name: "agent_framework",
        version: "1.0.0b251007",
      },
    };

    // Test extractTools with metadata parameter
    const tools = extractTools(input, metadata);

    expect(tools.length).toBe(2);
    expect(tools[0]).toEqual({
      id: expect.any(String),
      name: "get_weather",
      description: "Get the weather for a given location.",
      parameters: {
        properties: {
          location: {
            description: "The location to get the weather for.",
            title: "Location",
            type: "string",
          },
        },
        required: ["location"],
        title: "get_weather_input",
        type: "object",
      },
    });
    expect(tools[1].name).toBe("get_time");
    expect(tools[1].description).toBe("Get the current time in a timezone.");
  });

  it("should preserve rich tool results when jumping to playground", () => {
    // Regression test: tool results with many keys(6+) are spread into json passthrough by adapters
    // (for PrettyJsonView table rendering in trace view). playgroundConverter must fallback
    // to jsonData when content is undefined to preserve tool result data for playground.
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "verify", arguments: {} },
            },
          ],
        },
        {
          role: "tool",
          content: {
            PatientNo: "123",
            First: "J",
            Last: "D",
            Email: "j@x.com",
            Mobile: "555",
            Active: true,
          },
          tool_call_id: "c1",
        },
      ],
    };

    const playgroundMessages = normalizeInput(input, { metadata: input })
      .data?.map(convertChatMlToPlayground)
      .filter((m) => m !== null);

    const secondMsg = playgroundMessages?.[1];
    expect(secondMsg).toBeDefined();
    expect(secondMsg && "role" in secondMsg ? secondMsg.role : null).toBe(
      "tool",
    );
    expect(
      secondMsg && "content" in secondMsg ? secondMsg.content : "",
    ).toContain("PatientNo");
  });

  it("should handle OpenAI Agents function_call and function_call_output", () => {
    // user message, function_call (tool call), function_call_output (tool result)
    const input = [
      { content: "What's the weather in Tokyo?", role: "user" },
      {
        arguments: { city: "Tokyo" },
        call_id: "call_abc123",
        name: "get_weather",
        type: "function_call",
        id: "fc_xyz",
        status: "completed",
      },
      {
        call_id: "call_abc123",
        output: "The weather in Tokyo is sunny.",
        type: "function_call_output",
      },
    ];

    const inResult = normalizeInput(input, { framework: "openai" });
    expect(inResult.success).toBe(true);

    const playgroundMessages = inResult
      .data!.map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Should have 3 messages
    expect(playgroundMessages).toHaveLength(3);

    // Message 1: user
    expect(playgroundMessages[0]?.type).toBe("public-api-created");
    if (playgroundMessages[0]?.type === "public-api-created") {
      expect(playgroundMessages[0].role).toBe("user");
      expect(playgroundMessages[0].content).toBe(
        "What's the weather in Tokyo?",
      );
    }

    // Message 2: assistant with tool call
    expect(playgroundMessages[1]?.type).toBe("assistant-tool-call");
    if (playgroundMessages[1]?.type === "assistant-tool-call") {
      expect(playgroundMessages[1].toolCalls[0].id).toBe("call_abc123");
      expect(playgroundMessages[1].toolCalls[0].name).toBe("get_weather");
    }

    // Message 3: tool result
    expect(playgroundMessages[2]?.type).toBe("tool-result");
    if (playgroundMessages[2]?.type === "tool-result") {
      expect(playgroundMessages[2].toolCallId).toBe("call_abc123");
      expect(playgroundMessages[2].content).toBe(
        "The weather in Tokyo is sunny.",
      );
    }
  });

  it("should handle VAPI camelCase toolCalls and preserve IDs", () => {
    // VAPI uses camelCase toolCalls instead of tool_calls
    // Critical: Tool call IDs must be preserved for OpenAI API compatibility
    const input = {
      tools: [
        {
          type: "function",
          function: {
            name: "verify_user",
            description: "Verify user",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
      ],
      messages: [
        {
          role: "assistant",
          content: "Checking...",
          toolCalls: [
            {
              id: "call_123",
              type: "function",
              function: { name: "verify_user", arguments: "{}" },
            },
          ],
        },
        {
          role: "tool",
          content: '{"verified": true}',
          tool_call_id: "call_123",
        },
      ],
    };

    const inResult = normalizeInput(input, {
      observationName: "chat-completion",
    });
    expect(inResult.success).toBe(true);

    const playgroundMessages = inResult
      .data!.map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Critical assertions: IDs must match
    const toolCallMsg = playgroundMessages[0];
    expect(toolCallMsg?.type).toBe("assistant-tool-call");
    if (toolCallMsg?.type === "assistant-tool-call") {
      expect(toolCallMsg.toolCalls[0].id).toBe("call_123");
    }

    const toolResultMsg = playgroundMessages[1];
    expect(toolResultMsg?.type).toBe("tool-result");
    if (toolResultMsg?.type === "tool-result") {
      expect(toolResultMsg.toolCallId).toBe("call_123");
    }

    // Verify tools extracted
    expect(extractTools(input)).toHaveLength(1);
  });

  it("should handle stringified tools in metadata (like from vercel AI SDK v5 + bedrock)", () => {
    // metadata contains stringified tools instead of actual objects, causing flattenToolDefinition to return {}
    // and ChatML validation to fail with "normalizeInput success: false"

    const input = [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: [{ type: "text", text: "Test" }],
      },
    ];

    // metadata.tools array has STRINGIFIED elements
    const metadata = {
      tools: [
        JSON.stringify({
          type: "function",
          name: "get_weather",
          description: "Get weather info",
          inputSchema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        }),
        JSON.stringify({
          type: "function",
          name: "search_web",
          description: "Search the web",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        }),
      ],
      scope: { name: "ai" },
    };

    const inResult = normalizeInput(input, { metadata });

    // Should succeed (flattenToolDefinition parses strings)
    expect(inResult.success).toBe(true);
    expect(inResult.data).toBeDefined();
    expect(inResult.data!.length).toBeGreaterThan(0);

    // Verify tools are attached to messages
    const firstMessage = inResult.data![0];
    expect(firstMessage.tools).toBeDefined();
    expect(firstMessage.tools!.length).toBe(2);
    expect(firstMessage.tools![0].name).toBe("get_weather");
    expect(firstMessage.tools![1].name).toBe("search_web");
  });

  it("should respect includeOutput flag when jumping to playground, default to no output added", () => {
    // kinda a bad test mocking UI behavior and not really testing the UI.
    // but it should illustrate that the default behavior is to not include output! and document that.
    const input = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What can you help me with?" },
      ],
    };
    const output = {
      role: "assistant",
      content: "I can help with many tasks!",
    };
    const ctx = {};

    // Process input (always happens)
    const inputMessages = normalizeInput(input, ctx)
      .data!.map(convertChatMlToPlayground)
      .filter((msg) => msg !== null);

    // Test 1: Default behavior (includeOutput=false) - only input passed to the playground
    expect(inputMessages.length).toBe(2);
    const secondMsg = inputMessages[1];
    if (secondMsg && "role" in secondMsg) {
      expect(secondMsg.role).toBe("user");
    }

    // Test 2: With includeOutput=true - input + output
    const outputMessages = normalizeOutput(output, ctx)
      .data!.map(convertChatMlToPlayground)
      .filter((msg) => msg !== null && msg.type !== "assistant-tool-call");

    const withOutput = [...inputMessages, ...outputMessages];
    expect(withOutput.length).toBe(3);
    const thirdMsg = withOutput[2];
    if (thirdMsg && "role" in thirdMsg) {
      expect(thirdMsg.role).toBe("assistant");
      expect(thirdMsg.content).toBe("I can help with many tasks!");
    }
  });
});

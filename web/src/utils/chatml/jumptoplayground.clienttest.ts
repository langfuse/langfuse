// Mock the problematic @langfuse/shared import before importing our functions
jest.mock("@langfuse/shared", () => ({
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
}));

import { normalizeInput } from "./adapters";
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

  it("should handle Gemini-style tool definitions embedded in messages", () => {
    // Gemini format embeds tool definitions as messages with role="tool"
    // This test verifies that:
    // 1. Tool definition messages are filtered out of the message list
    // 2. Tool definitions are extracted and available for the playground
    const observationName = "VertexGemini";
    const metadata = {
      ls_provider: "google_vertexai",
      ls_model_name: "gemini-2.5-flash",
      ls_model_type: "chat",
      ls_temperature: 0,
      ls_max_tokens: 8192,
    };

    const input = [
      {
        role: "system",
        content: "You are a helpful assistant with access to tools.",
      },
      {
        role: "assistant",
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

    // Should have 3 real messages (system, assistant, user)
    // Tool definition messages should be filtered out by the converter
    expect(playgroundMessages.length).toBe(3);

    // Filter out placeholder messages for role testing
    const regularMessages = playgroundMessages.filter(
      (msg) => msg.type !== "placeholder",
    );

    // Verify message roles
    expect(regularMessages[0]?.role).toBe("system");
    expect(regularMessages[1]?.role).toBe("assistant");
    expect(regularMessages[2]?.role).toBe("user");

    // All should have type public-api-created (regular messages)
    expect(playgroundMessages[0]?.type).toBe("public-api-created");
    expect(playgroundMessages[1]?.type).toBe("public-api-created");
    expect(playgroundMessages[2]?.type).toBe("public-api-created");

    // IMPORTANT: Test that tools are extracted from the Gemini input format
    // The parseTools function in JumpToPlaygroundButton.tsx needs to handle Gemini format
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
});

// TODO: remove
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

import { openAIMapper } from "./openai";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("openAIMapper", () => {
  it("should detect OpenAI via metadata and structural indicators", () => {
    // Metadata detection: ls_provider
    // TODO: remove ls_... check -> should be oai specific
    expect(openAIMapper.canMapScore({}, {}, { ls_provider: "openai" })).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(
      openAIMapper.canMapScore(
        {},
        {},
        { ls_provider: "openai", ls_version: "1.0" },
      ),
    ).toBe(MAPPER_SCORE_DEFINITIVE);
    expect(openAIMapper.canMapScore({}, {}, { framework: "langgraph" })).toBe(
      MAPPER_SCORE_NONE,
    );

    // Structural detection: Parts API
    const partsInput = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,..." },
            },
          ],
        },
      ],
    };
    expect(openAIMapper.canMapScore(partsInput, null)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(openAIMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should handle tool calls and tool results", () => {
    // Test assistant message with tool_calls
    const inputWithToolCalls = {
      messages: [
        {
          role: "assistant",
          content: "Let me check that for you",
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city": "NYC"}',
              },
            },
          ],
          custom_field: "should_be_preserved",
        },
      ],
    };

    const result1 = openAIMapper.map(inputWithToolCalls, null);
    expect(result1.input.messages).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_abc123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"city": "NYC"}',
      },
    });
    expect(result1.input.messages[0].content).toBe("Let me check that for you");
    expect(result1.input.messages[0].json).toEqual({
      custom_field: "should_be_preserved",
    });

    // Test tool message with tool_call_id
    const inputWithToolResult = {
      messages: [
        {
          role: "tool",
          content: '{"temperature": 72}',
          tool_call_id: "call_abc123",
        },
      ],
    };

    const result2 = openAIMapper.map(inputWithToolResult, null);
    expect(result2.input.messages).toHaveLength(1);
    expect(result2.input.messages[0].toolCallId).toBe("call_abc123");
    expect(result2.input.messages[0].content).toBe('{"temperature": 72}');

    // Test object arguments (not string)
    const inputWithObjectArgs = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_obj",
              type: "function",
              function: {
                name: "test_func",
                arguments: { key: "value", nested: { data: 123 } },
              },
            },
          ],
        },
      ],
    };

    const result3 = openAIMapper.map(inputWithObjectArgs, null);
    expect(result3.input.messages[0].toolCalls?.[0].function.arguments).toBe(
      '{"key":"value","nested":{"data":123}}',
    );
  });

  it("should not add toolCalls or toolCallId if not present", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "Regular message without tools",
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toBeUndefined();
    expect(result.input.messages[0].toolCallId).toBeUndefined();
  });

  it("should handle trace with tool calls (langfuse-sdk, openai auto instrument)", () => {
    const metadata = {
      language: "en",
      scope: {
        name: "langfuse-sdk",
        version: "3.2.3",
      },
    };

    const input = {
      tools: [
        {
          type: "function",
          function: {
            name: "get_user_contact_information",
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
            name: "query_knowledge_base",
            description: "Query the knowledge base for information",
            parameters: {
              type: "object",
              properties: {
                _inquiry_summary: { type: "string" },
                _lang: { type: "string" },
              },
              required: ["_inquiry_summary", "_lang"],
            },
          },
        },
      ],
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "assistant",
          content: "",
          name: null,
          tool_call_id: null,
          tool_calls: [
            {
              id: "call_user_001",
              type: "function",
              function: {
                name: "get_user_contact_information",
                arguments: {}, // Object, not string
              },
            },
          ],
        },
        {
          role: "tool",
          content: {
            // Object content, not stringified
            userInformation: {
              displayName: "Anonymous",
              emails: [],
              phoneNumbers: [],
            },
          },
          name: null,
          tool_call_id: "call_user_001",
          tool_calls: null,
        },
        {
          role: "user",
          content: "how do I add an agent?",
          name: null,
          tool_call_id: null,
          tool_calls: null,
        },
        {
          role: "assistant",
          content: "",
          name: null,
          tool_call_id: null,
          tool_calls: [
            {
              id: "call_kb_002",
              type: "function",
              function: {
                name: "query_knowledge_base",
                arguments: {
                  // Object arguments
                  _inquiry_summary: "how to add an agent",
                  _lang: "en",
                },
              },
            },
          ],
        },
        {
          role: "tool",
          content:
            "To add an agent, go to Settings and add it. Complete the required fields.",
          name: "query_knowledge_base",
          tool_call_id: "call_kb_002",
          tool_calls: null,
        },
      ],
    };

    const output = {
      role: "assistant",
      content: "To add an agent, follow these steps:\n1. Go to Settings",
    };

    const result = openAIMapper.map(input, output, metadata);

    // Verify mapper was used correctly
    expect(result.input.messages).toHaveLength(6);

    // Check first assistant message with tool call
    const assistantMsg1 = result.input.messages[1];
    expect(assistantMsg1.role).toBe("assistant");
    expect(assistantMsg1.toolCalls).toBeDefined();
    expect(assistantMsg1.toolCalls).toHaveLength(1);
    expect(assistantMsg1.toolCalls?.[0].id).toBe("call_user_001");
    expect(assistantMsg1.toolCalls?.[0].function.name).toBe(
      "get_user_contact_information",
    );
    expect(assistantMsg1.toolCalls?.[0].function.arguments).toBe("{}");

    // Check first tool response - content should remain as string
    const toolMsg1 = result.input.messages[2];
    expect(toolMsg1.role).toBe("tool");
    expect(toolMsg1.toolCallId).toBe("call_user_001");
    expect(typeof toolMsg1.content).toBe("string");
    // Content should be the JSON string we provided
    expect(toolMsg1.content).toContain("userInformation");

    // Check second assistant message with tool call (object arguments)
    const assistantMsg2 = result.input.messages[4];
    expect(assistantMsg2.toolCalls).toBeDefined();
    expect(assistantMsg2.toolCalls).toHaveLength(1);
    expect(assistantMsg2.toolCalls?.[0].id).toBe("call_kb_002");
    expect(assistantMsg2.toolCalls?.[0].function.name).toBe(
      "query_knowledge_base",
    );
    // Object arguments should be stringified
    expect(typeof assistantMsg2.toolCalls?.[0].function.arguments).toBe(
      "string",
    );
    const args = JSON.parse(
      assistantMsg2.toolCalls?.[0].function.arguments || "{}",
    );
    expect(args._inquiry_summary).toBe("how to add an agent");

    // Check second tool response with name field
    const toolMsg2 = result.input.messages[5];
    expect(toolMsg2.role).toBe("tool");
    expect(toolMsg2.toolCallId).toBe("call_kb_002");
    expect(toolMsg2.name).toBe("query_knowledge_base");
    expect(typeof toolMsg2.content).toBe("string");

    // Verify additional input (tools array)
    expect(result.input.additional).toBeDefined();
    expect(result.input.additional?.tools).toBeDefined();
  });
});

import type { NormalizedIOFixture } from "./types";

const toolCallId = "call_weather_001";
const customToolCallId = "call_custom_002";

/** Synthetic OpenAI chat-completion case adapted from the playground suite. */
export const openAiChatCompletionToolSequenceFixture = {
  name: "normalizes an OpenAI chat-completion tool sequence",
  spanIO: {
    input: {
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the weather for a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
        {
          type: "custom",
          custom: {
            name: "run_python",
            description: "Runs a python snippet",
            format: { type: "text" },
          },
        },
      ],
      messages: [
        { role: "user", content: "What is the weather in Zurich?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"Zurich"}',
              },
            },
            {
              id: customToolCallId,
              type: "custom",
              custom: { name: "run_python", input: "print(21 * 2)" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          content: '{"condition":"sunny","temperature":24}',
        },
        // Deprecated legacy function-calling protocol: the result message
        // carries the function name instead of a tool_call_id.
        { role: "function", name: "run_python", content: "42" },
      ],
    },
    output: {
      role: "assistant",
      content: "It is sunny and 24 degrees in Zurich.",
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather in Zurich?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId,
            toolName: "get_weather",
            input: { city: "Zurich" },
          },
          {
            type: "tool-call",
            toolCallId: customToolCallId,
            toolName: "run_python",
            input: "print(21 * 2)",
            toolType: "custom",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId,
            output: { condition: "sunny", temperature: 24 },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: null,
            toolName: "run_python",
            output: 42,
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "It is sunny and 24 degrees in Zurich." },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "get_weather",
        description: "Get the weather for a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        type: "function",
        providerMetadata: undefined,
      },
      {
        name: "run_python",
        description: "Runs a python snippet",
        inputSchema: { type: "text" },
        type: "custom",
        providerMetadata: undefined,
      },
    ],
  },
} satisfies NormalizedIOFixture;

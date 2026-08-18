import type { NormalizedIOFixture } from "./types";

const toolCallId = "call_weather_001";

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
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          content: '{"condition":"sunny","temperature":24}',
        },
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
    ],
  },
} satisfies NormalizedIOFixture;

import type { NormalizedIOFixture } from "../fixture-types";

/** OpenRouter Broadcast traces carry the reply under a single output envelope. */
export const openRouterBroadcastReplyFixture = {
  name: "reads the completion of an OpenRouter Broadcast reply",
  spanIO: {
    input: undefined,
    output: {
      completion: "ready",
      reasoning: null,
      toolCalls: [],
      rawRequest: {
        model: "openai/gpt-6-luna",
        _skin: "chat-completions",
      },
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "assistant",
        parts: [{ type: "text", text: "ready" }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

export const openRouterToolCallReplyFixture = {
  name: "keeps OpenRouter reasoning and tool calls",
  spanIO: {
    input: undefined,
    output: {
      completion: "Checking the forecast.",
      reasoning: "The user asked about the weather, so I need the forecast.",
      toolCalls: [
        {
          id: "call_weather_1",
          type: "function",
          function: {
            name: "get_forecast",
            arguments: '{"city":"Paris"}',
          },
        },
      ],
      rawRequest: {
        model: "openai/gpt-6-luna",
        _skin: "chat-completions",
      },
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "The user asked about the weather, so I need the forecast.",
            },
          },
          { type: "text", text: "Checking the forecast." },
          {
            type: "tool-call",
            toolCallId: "call_weather_1",
            toolName: "get_forecast",
            input: { city: "Paris" },
            toolType: "function",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

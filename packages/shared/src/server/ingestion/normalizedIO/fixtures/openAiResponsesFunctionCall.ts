import type { NormalizedIOFixture } from "./types";

const toolCallId = "call_weather_002";

/** Synthetic OpenAI Responses case adapted from the playground suite. */
export const openAiResponsesFunctionCallFixture = {
  name: "normalizes OpenAI Responses function calls and outputs",
  spanIO: {
    input: [
      { role: "user", content: "What is the weather in Basel?" },
      {
        type: "function_call",
        id: "fc_weather_002",
        call_id: toolCallId,
        name: "get_weather",
        arguments: { city: "Basel" },
        status: "completed",
      },
      {
        type: "function_call_output",
        call_id: toolCallId,
        output: "The weather in Basel is cloudy.",
      },
    ],
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather in Basel?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId,
            toolName: "get_weather",
            input: { city: "Basel" },
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
            output: "The weather in Basel is cloudy.",
          },
        ],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

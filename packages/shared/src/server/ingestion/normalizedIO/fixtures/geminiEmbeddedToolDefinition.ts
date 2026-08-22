import type { NormalizedIOFixture } from "./types";

/** Synthetic Gemini case adapted from the playground suite. */
export const geminiEmbeddedToolDefinitionFixture = {
  name: "extracts Gemini tool-definition messages",
  spanIO: {
    input: [
      { role: "system", content: "Use tools when they are helpful." },
      {
        role: "model",
        content: [{ type: "text", text: "How can I help?" }],
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the current weather in a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      },
      { role: "user", content: "What can you do?" },
    ],
    output: undefined,
    metadata: { provider: "google_vertexai" },
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "Use tools when they are helpful." }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "How can I help?" }],
        source: "input",
      },
      {
        role: "user",
        parts: [{ type: "text", text: "What can you do?" }],
        source: "input",
      },
    ],
    toolDefinitions: [
      {
        name: "get_weather",
        description: "Get the current weather in a city",
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

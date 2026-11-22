import type { NormalizedIOFixture } from "../../fixture-types";

export const paramsMessagesFixture = {
  name: "normalizes messages nested in input params",
  spanIO: {
    input: {
      params: {
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        model: "gpt-4.1-mini",
        temperature: 0,
      },
      skipDoneStreamingCallback: false,
    },
    output: {
      chatCompletion: { id: "completion-1" },
      openaiCompletionModel: { id: "model-1" },
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is 2 + 2?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "data",
            value: {
              chatCompletion: { id: "completion-1" },
              openaiCompletionModel: { id: "model-1" },
            },
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
    additionalInput: {
      params: {
        model: "gpt-4.1-mini",
        temperature: 0,
      },
      skipDoneStreamingCallback: false,
    },
  },
} satisfies NormalizedIOFixture;

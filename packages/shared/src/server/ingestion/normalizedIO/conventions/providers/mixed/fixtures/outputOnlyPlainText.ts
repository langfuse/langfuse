import type { NormalizedIOFixture } from "../../../fixtureTypes";

export const outputOnlyPlainTextFixture = {
  name: "preserves output-only plain text",
  spanIO: {
    input: undefined,
    output: "plain answer",
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "assistant",
        parts: [{ type: "text", text: "plain answer" }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

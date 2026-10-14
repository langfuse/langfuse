import type { NormalizedIOFixture } from "../../fixture-types";

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
        roleInferred: true,
        parts: [{ type: "text", text: "plain answer" }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

import type { NormalizedIOFixture } from "../../fixture-types";

export const outputOnlyStructuredMessageFixture = {
  name: "normalizes an output-only structured assistant message",
  spanIO: {
    input: undefined,
    output: { role: "assistant", content: "final answer" },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "assistant",
        parts: [{ type: "text", text: "final answer" }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

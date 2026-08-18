import type { NormalizedIOFixture } from "./types";

/** Synthetic case adapted from the normalized source-data coverage in PR #14417. */
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

import type { NormalizedIOFixture } from "../fixture-types";

/** Synthetic Semantic Kernel case adapted from the playground suite. */
export const semanticKernelEventContentFixture = {
  name: "unwraps Semantic Kernel event content",
  spanIO: {
    input: [
      {
        role: "user",
        "gen_ai.event.content": JSON.stringify({
          role: "user",
          content: "What is the weather?",
          tool_calls: [],
        }),
      },
    ],
    output: {
      "gen_ai.event.content": JSON.stringify({
        message: {
          role: "Assistant",
          content: "The weather is mild.",
        },
      }),
    },
    metadata: {
      scope: { name: "Microsoft.SemanticKernel.Diagnostics", version: "" },
    },
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "The weather is mild." }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

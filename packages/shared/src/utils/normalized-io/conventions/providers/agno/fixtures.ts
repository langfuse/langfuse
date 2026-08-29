import type { NormalizedIOFixture } from "../fixture-types";

export const agnoPythonReprFixture = {
  name: "normalizes an Agno Python-repr message",
  spanIO: {
    input:
      "role='user' content='What is the weather?' name=None tool_call_id=None",
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather?" }],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

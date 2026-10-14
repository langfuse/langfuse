import type { NormalizedIOFixture } from "../../fixture-types";

// A tool span: function arguments in, a plain result out. Neither side is a
// chat message, so both roles are side defaults.
export const plainSpanIOFixture = {
  name: "marks non-chat span input and output as inferred roles",
  spanIO: {
    input: {
      command: "python3 -c 'import datetime; print(datetime.date.today())'",
    },
    output: "2026-10-05",
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        roleInferred: true,
        parts: [
          {
            type: "data",
            value: {
              command:
                "python3 -c 'import datetime; print(datetime.date.today())'",
            },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        roleInferred: true,
        parts: [{ type: "text", text: "2026-10-05" }],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

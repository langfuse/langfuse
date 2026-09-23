import type { NormalizedIOFixture } from "../fixture-types";

const question = {
  role: "user",
  content: "Read README.md and tell me in one line what this repo is.",
};
const reasoning =
  "The user wants me to read README.md and describe the repo in one line.";
const answer = "A scratch repository for the reasoning-on-output review.";

const userTurn: NormalizedIOFixture["expected"]["messages"][number] = {
  role: "user",
  parts: [{ type: "text", text: question.content }],
  source: "input",
};

const answerThenReasoning = (
  signature?: string,
): NormalizedIOFixture["expected"]["messages"][number] => ({
  role: "assistant",
  parts: [
    { type: "text", text: answer },
    {
      type: "reasoning",
      content: {
        kind: "text",
        text: reasoning,
        ...(signature ? { signature } : {}),
      },
    },
  ],
  source: "output",
});

export const langfuseAgentPluginFixtures: NormalizedIOFixture[] = [
  {
    name: "normalizes a `content`-keyed thinking part in the `thinking` sibling array",
    spanIO: {
      input: JSON.stringify([question]),
      output: JSON.stringify({
        role: "assistant",
        content: answer,
        thinking: [
          { type: "thinking", content: reasoning, signature: "sig_sibling" },
        ],
      }),
      metadata: undefined,
    },
    expected: {
      messages: [userTurn, answerThenReasoning("sig_sibling")],
      toolDefinitions: [],
    },
  },
  {
    name: "normalizes a `content`-keyed thinking part inline in `content`",
    spanIO: {
      input: JSON.stringify([question]),
      output: JSON.stringify({
        role: "assistant",
        content: [
          { type: "thinking", content: reasoning, signature: "sig_inline" },
          { type: "text", text: answer },
        ],
      }),
      metadata: undefined,
    },
    expected: {
      messages: [
        userTurn,
        {
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: {
                kind: "text",
                text: reasoning,
                signature: "sig_inline",
              },
            },
            { type: "text", text: answer },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [],
    },
  },
  {
    name: "normalizes a thinking part carrying both `thinking` and `content`",
    spanIO: {
      input: JSON.stringify([question]),
      output: JSON.stringify({
        role: "assistant",
        content: answer,
        thinking: [
          { type: "thinking", thinking: reasoning, content: reasoning },
        ],
      }),
      metadata: undefined,
    },
    expected: {
      messages: [userTurn, answerThenReasoning()],
      toolDefinitions: [],
    },
  },
  {
    name: "normalizes an Anthropic-native thinking part in the `thinking` sibling array",
    spanIO: {
      input: JSON.stringify([question]),
      output: JSON.stringify({
        role: "assistant",
        content: answer,
        thinking: [
          { type: "thinking", thinking: reasoning, signature: "sig_native" },
        ],
      }),
      metadata: undefined,
    },
    expected: {
      messages: [userTurn, answerThenReasoning("sig_native")],
      toolDefinitions: [],
    },
  },
];

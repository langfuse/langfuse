import type { NormalizedIOFixture } from "../../fixture-types";

// Generation outputs as written by Langfuse's own agent plugins. They all
// build the ChatML thinking part from `ThinkingContentPartSchema`, so the
// reasoning text sits under `content` inside a `thinking` sibling array.
const question = {
  role: "user",
  content: "Read README.md and tell me in one line what this repo is.",
};
const reasoning =
  "The user wants me to read README.md and describe the repo in one line.";
const answer = "A scratch repository for the reasoning-on-output review.";

const expectedMessages: NormalizedIOFixture["expected"]["messages"] = [
  {
    role: "user",
    parts: [{ type: "text", text: question.content }],
    source: "input",
  },
  {
    role: "assistant",
    parts: [
      { type: "text", text: answer },
      { type: "reasoning", content: { kind: "text", text: reasoning } },
    ],
    source: "output",
  },
];

export const langfuseAgentPluginThinkingFixtures: NormalizedIOFixture[] = [
  {
    // claude-observability-plugin (hooks/langfuse_hook.py, build_thinking_parts),
    // opencode-observability-plugin, cursor-observability-plugin and
    // pi-observability-plugin up to #38 all emit exactly this shape.
    name: "normalizes the `content`-keyed thinking sibling array Langfuse's agent plugins emit",
    spanIO: {
      input: JSON.stringify([question]),
      output: JSON.stringify({
        role: "assistant",
        content: answer,
        thinking: [{ type: "thinking", content: reasoning }],
      }),
      metadata: undefined,
    },
    expected: { messages: expectedMessages, toolDefinitions: [] },
  },
  {
    // pi-observability-plugin after its fix writes both spellings, so the
    // legacy ChatML schema (which requires `content`) keeps validating too.
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
    expected: { messages: expectedMessages, toolDefinitions: [] },
  },
];

import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { InAppAgentContextualLanding } from "./InAppAgentContextualLanding";

const createCodeLanding = {
  title: "Create a code evaluator with AI",
  description:
    "Describe what to evaluate. The Assistant will create the evaluator and help you test it.",
  examples: [
    {
      id: "groundedness",
      label: "Fail when the answer contradicts the retrieved context",
      prompt: "Fail when the answer contradicts the retrieved context",
    },
    {
      id: "empty-output",
      label: "Fail when the output is empty",
      prompt: "Fail when the output is empty",
    },
    {
      id: "classification",
      label: "Classify each response into a support topic",
      prompt: "Classify each response into a support topic",
    },
  ],
};

const editJudgeLanding = {
  title: "Improve this LLM-as-a-judge evaluator",
  description:
    "Describe what should change. The Assistant will update the saved evaluator for you to review.",
  examples: [
    {
      id: "strict",
      label: "Make the evaluation criterion stricter",
      prompt: "Make the evaluation criterion stricter",
    },
    {
      id: "scale",
      label: "Change the score to a 1–5 scale",
      prompt: "Change the score to a 1–5 scale",
    },
    {
      id: "reason",
      label: "Add a short explanation for every score",
      prompt: "Add a short explanation for every score",
    },
  ],
};

const meta = preview.meta({
  component: InAppAgentContextualLanding,
  args: {
    isDisabled: false,
    onSelectExample: fn(),
  },
});

export const CreateCode = meta.story({
  args: {
    landing: createCodeLanding,
  },
});

export const EditJudge = meta.story({
  args: {
    landing: editJudgeLanding,
  },
});

export const Compact = meta.story({
  args: {
    landing: createCodeLanding,
  },
  render: (args) => (
    <div className="flex w-64 flex-col items-center px-2">
      <InAppAgentContextualLanding {...args} />
    </div>
  ),
});

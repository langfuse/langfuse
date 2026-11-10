import preview from "../../../../../.storybook/preview";
import { InAppAgentQuestionnaireSummary } from "./InAppAgentQuestionnaireSummary";

const meta = preview.meta({
  component: InAppAgentQuestionnaireSummary,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
});

export const Answered = meta.story({
  args: {
    answers: [
      {
        question: "Which environment should the evaluator run on?",
        answer: ["Preview environment"],
        skipped: false,
      },
      {
        question: "Which signals should count as a failure?",
        answer: ["Tool errors", "High latency"],
        skipped: false,
      },
      {
        question: "Anything else the evaluator should know?",
        answer: [],
        skipped: true,
      },
    ],
  },
});

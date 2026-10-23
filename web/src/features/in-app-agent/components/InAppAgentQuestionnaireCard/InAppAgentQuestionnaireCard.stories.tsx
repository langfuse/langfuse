import preview from "../../../../../.storybook/preview";
import { fn } from "storybook/test";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { InAppAgentQuestionnaireCard } from "./InAppAgentQuestionnaireCard";

const environmentQuestion: InAppAgentQuestionnaireQuestion = {
  question: "Which environment should the evaluator run on?",
  options: [
    {
      label: "Production",
      description: "Score live traffic as it arrives.",
      recommended: true,
    },
    {
      label: "Staging",
      description: "Try it on pre-release traces first.",
      recommended: false,
    },
  ],
  allowMultiple: false,
};

const failureSignalsQuestion: InAppAgentQuestionnaireQuestion = {
  question: "Which signals should count as a failure?",
  options: [
    {
      label: "Tool errors",
      description: "Any tool call that returned an error.",
      recommended: true,
    },
    {
      label: "Empty output",
      description: "The model returned no text.",
      recommended: false,
    },
    {
      label: "High latency",
      description: "The trace took longer than 30 seconds.",
      recommended: false,
    },
  ],
  allowMultiple: true,
};

const scheduleQuestion: InAppAgentQuestionnaireQuestion = {
  question: "How often should it run?",
  options: [
    {
      label: "Every hour",
      description: "Catches regressions fastest.",
      recommended: false,
    },
    {
      label: "Every 6 hours",
      description: "A few runs per working day.",
      recommended: false,
    },
    {
      label: "Once a day",
      description: "Enough for slow-moving traffic.",
      recommended: false,
    },
    {
      label: "Once a week",
      description: "Lowest cost, slowest signal.",
      recommended: false,
    },
  ],
  allowMultiple: false,
};

const multiStepQuestions = [
  environmentQuestion,
  failureSignalsQuestion,
  scheduleQuestion,
];

const meta = preview.meta({
  component: InAppAgentQuestionnaireCard,
  args: {
    questions: [environmentQuestion],
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
});

export const SingleChoice = meta.story({});

export const MultipleChoice = meta.story({
  args: { questions: [failureSignalsQuestion] },
});

export const MultiStep = meta.story({
  args: { questions: multiStepQuestions },
});

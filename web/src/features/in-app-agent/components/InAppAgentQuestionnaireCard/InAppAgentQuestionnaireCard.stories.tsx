import preview from "../../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
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

export const SingleChoiceAdvancesOnPick = meta.story({
  name: "(Test) Single choice submits as soon as an option is picked",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByText("Staging"));

    await expect(args.onSubmit).toHaveBeenCalledWith([
      { selectedOptionIndexes: [1], otherText: null },
    ]);
  },
});

export const SingleChoiceCustomAnswer = meta.story({
  name: "(Test) Single choice turns Skip into Submit for a typed answer",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("radio", { name: /^Type your answer/ }),
    );
    await expect(canvas.getByLabelText("Custom answer")).toHaveFocus();
    await expect(canvas.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();

    await userEvent.keyboard("Preview environment");
    await expect(
      canvas.queryByRole("button", { name: "Skip" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    await expect(args.onSubmit).toHaveBeenCalledWith([
      { selectedOptionIndexes: [], otherText: "Preview environment" },
    ]);
  },
});

export const MultipleChoiceCustomAnswer = meta.story({
  name: "(Test) Multiple choice toggles the custom answer and submits with the shortcut",
  args: { questions: [failureSignalsQuestion] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Submit" })).toBeDisabled();
    const customAnswerCheckbox = canvas.getByRole("checkbox", {
      name: /^Type your answer/,
    });

    await userEvent.click(customAnswerCheckbox);
    await expect(canvas.getByLabelText("Custom answer")).toHaveFocus();
    await userEvent.keyboard("Timeouts");
    await expect(customAnswerCheckbox).toBeChecked();

    await userEvent.click(customAnswerCheckbox);
    await expect(
      canvas.queryByLabelText("Custom answer"),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByText("Empty output"));
    await userEvent.click(customAnswerCheckbox);
    await userEvent.keyboard("Timeouts");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    await expect(args.onSubmit).toHaveBeenCalledWith([
      { selectedOptionIndexes: [1], otherText: "Timeouts" },
    ]);
  },
});

export const AnswerAllSteps = meta.story({
  name: "(Test) Answers every step, jumps back, and submits once",
  args: { questions: multiStepQuestions },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 of 3")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("radio", { name: /^Type your answer/ }),
    );
    await userEvent.keyboard("Preview environment");
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(canvas.getByText("2 of 3")).toBeVisible();
    await userEvent.click(canvas.getByText("High latency"));
    await userEvent.click(canvas.getByText("Tool errors (Recommended)"));

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous question" }),
    );
    await expect(canvas.getByLabelText("Custom answer")).toHaveValue(
      "Preview environment",
    );
    // Picking an option replaces the typed answer and moves on.
    await userEvent.click(canvas.getByText("Staging"));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(canvas.getByText("3 of 3")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith([
      { selectedOptionIndexes: [1], otherText: null },
      { selectedOptionIndexes: [0, 2], otherText: null },
      { selectedOptionIndexes: [], otherText: null },
    ]);
  },
});

export const Dismiss = meta.story({
  name: "(Test) Dismiss submits every question as skipped",
  args: { questions: multiStepQuestions },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss questions" }),
    );

    await expect(args.onSubmit).toHaveBeenCalledWith([
      { selectedOptionIndexes: [], otherText: null },
      { selectedOptionIndexes: [], otherText: null },
      { selectedOptionIndexes: [], otherText: null },
    ]);
  },
});

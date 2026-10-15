import preview from "../../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  type InAppAgentQuestionnaireArgs,
  type InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";
import { InAppAgentQuestionnaireCard } from "./InAppAgentQuestionnaireCard";

const createQuestionnaireTool = (
  args: InAppAgentQuestionnaireArgs | string,
  approvalStatus: "pending" | "submitting" = "pending",
): InAppAgentToolCallContent => ({
  type: "tool",
  name: IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  status: "running",
  args: typeof args === "string" ? args : JSON.stringify(args),
  approval: { id: "approval-questionnaire-1", status: approvalStatus },
});

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
    { label: "Every hour", description: null, recommended: false },
    { label: "Every 6 hours", description: null, recommended: false },
    { label: "Once a day", description: null, recommended: false },
    { label: "Once a week", description: null, recommended: false },
  ],
  allowMultiple: false,
};

const multiStepArgs: InAppAgentQuestionnaireArgs = {
  questions: [environmentQuestion, failureSignalsQuestion, scheduleQuestion],
};

const meta = preview.meta({
  component: InAppAgentQuestionnaireCard,
});

export const SingleChoice = meta.story({
  args: {
    tool: createQuestionnaireTool({ questions: [environmentQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
});

export const SingleChoiceWithoutDescriptions = meta.story({
  args: {
    tool: createQuestionnaireTool({ questions: [scheduleQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
});

export const MultipleChoice = meta.story({
  args: {
    tool: createQuestionnaireTool({ questions: [failureSignalsQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
});

export const MultiStep = meta.story({
  args: {
    tool: createQuestionnaireTool(multiStepArgs),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
});

export const Submitting = meta.story({
  args: {
    tool: createQuestionnaireTool(
      { questions: [environmentQuestion] },
      "submitting",
    ),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
});

export const MalformedArguments = meta.story({
  name: "(Test) Malformed arguments fall back to the tool call card",
  args: {
    tool: createQuestionnaireTool('{ "questions": "not a list" }'),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /Next|Submit/ }),
    ).not.toBeInTheDocument();
  },
});

export const SingleChoiceAutoSubmits = meta.story({
  name: "(Test) Single choice submits as soon as an option is picked",
  args: {
    tool: createQuestionnaireTool({ questions: [environmentQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByText("Staging"));

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [1], otherText: null }],
    );
  },
});

export const SingleChoiceNumberKey = meta.story({
  name: "(Test) Single choice submits with a number key",
  args: {
    tool: createQuestionnaireTool({ questions: [scheduleQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("1 of 1")).not.toBeInTheDocument();

    canvas.getByRole("button", { name: /Every hour/ }).focus();
    await userEvent.keyboard("4");

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [3], otherText: null }],
    );
  },
});

export const SingleChoiceCustomAnswer = meta.story({
  name: "(Test) Single choice turns Skip into Submit for a custom answer",
  args: {
    tool: createQuestionnaireTool({ questions: [environmentQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Skip" })).toBeVisible();

    await userEvent.type(
      canvas.getByLabelText("Something else"),
      "Preview environment",
    );
    await expect(
      canvas.queryByRole("button", { name: "Skip" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [], otherText: "Preview environment" }],
    );
  },
});

export const MultipleChoiceShortcut = meta.story({
  name: "(Test) Multiple choice submits with the keyboard shortcut",
  args: {
    tool: createQuestionnaireTool({ questions: [failureSignalsQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Submit" })).toBeDisabled();

    await userEvent.click(canvas.getByText("Empty output"));
    await expect(canvas.getByText("1 selected")).toBeVisible();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [1], otherText: null }],
    );
  },
});

export const MultipleChoiceCustomAnswer = meta.story({
  name: "(Test) Multiple choice checks the custom answer while it has text",
  args: {
    tool: createQuestionnaireTool({ questions: [failureSignalsQuestion] }),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const customAnswerCheckbox = canvas.getByRole("checkbox", {
      name: "Use a custom answer",
    });
    await expect(customAnswerCheckbox).not.toBeChecked();

    await userEvent.click(customAnswerCheckbox);
    await expect(canvas.getByLabelText("Something else")).toHaveFocus();
    await userEvent.keyboard("Timeouts");
    await expect(customAnswerCheckbox).toBeChecked();
    await expect(canvas.getByText("1 selected")).toBeVisible();

    await userEvent.click(customAnswerCheckbox);
    await expect(canvas.getByLabelText("Something else")).toHaveValue("");
    await expect(canvas.getByText("0 selected")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Something else"), "Timeouts");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [], otherText: "Timeouts" }],
    );
  },
});

export const AnswerAllSteps = meta.story({
  name: "(Test) Answers every step, jumps back, and submits once",
  args: {
    tool: createQuestionnaireTool(multiStepArgs),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 of 3")).toBeVisible();

    await userEvent.click(canvas.getByLabelText("Something else"));
    await userEvent.keyboard("Preview environment");
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(canvas.getByText("2 of 3")).toBeVisible();
    await userEvent.click(canvas.getByText("High latency"));
    await userEvent.click(canvas.getByText("Tool errors"));
    await expect(canvas.getByText("2 selected")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous question" }),
    );
    await expect(canvas.getByLabelText("Something else")).toHaveValue(
      "Preview environment",
    );
    // Picking an option replaces the typed answer and moves on.
    await userEvent.click(canvas.getByText("Staging"));

    await expect(canvas.getByText("2 selected")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(canvas.getByText("3 of 3")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledTimes(1);
    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [
        { selectedOptionIndexes: [1], otherText: null },
        { selectedOptionIndexes: [0, 2], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    );
  },
});

export const Dismiss = meta.story({
  name: "(Test) Dismiss submits every question as skipped",
  args: {
    tool: createQuestionnaireTool(multiStepArgs),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss questions" }),
    );
    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    );
    await expect(args.onRejectToolCall).not.toHaveBeenCalled();
  },
});

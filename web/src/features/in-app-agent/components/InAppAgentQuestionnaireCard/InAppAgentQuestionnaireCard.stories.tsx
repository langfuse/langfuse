import preview from "../../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  type InAppAgentQuestionnaireArgs,
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

const multiStepArgs: InAppAgentQuestionnaireArgs = {
  questions: [
    {
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
      allowOther: true,
    },
    {
      question: "Which signals should count as a failure?",
      options: [
        { label: "Tool errors", description: null, recommended: true },
        { label: "Empty output", description: null, recommended: false },
        { label: "High latency", description: null, recommended: false },
      ],
      allowMultiple: true,
      allowOther: false,
    },
    {
      question: "How often should it run?",
      options: [
        { label: "Every hour", description: null, recommended: false },
        { label: "Once a day", description: null, recommended: false },
      ],
      allowMultiple: false,
      allowOther: true,
    },
  ],
};

const meta = preview.meta({
  component: InAppAgentQuestionnaireCard,
  args: {
    tool: createQuestionnaireTool(multiStepArgs),
    onAnswerQuestionnaire: fn().mockResolvedValue(undefined),
    onRejectToolCall: fn().mockResolvedValue(undefined),
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
});

export const MultiStep = meta.story({});

export const SingleQuestion = meta.story({
  args: {
    tool: createQuestionnaireTool({ questions: [multiStepArgs.questions[0]] }),
  },
});

export const MultipleChoice = meta.story({
  args: {
    tool: createQuestionnaireTool({ questions: [multiStepArgs.questions[1]] }),
  },
});

export const Submitting = meta.story({
  args: {
    tool: createQuestionnaireTool(
      { questions: [multiStepArgs.questions[0]] },
      "submitting",
    ),
  },
});

export const MalformedArguments = meta.story({
  name: "(Test) Malformed arguments fall back to the tool call card",
  args: {
    tool: createQuestionnaireTool('{ "questions": "not a list" }'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /Next|Submit/ }),
    ).not.toBeInTheDocument();
  },
});

export const AnswerAllSteps = meta.story({
  name: "(Test) Answers every step and submits once",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1/3")).toBeVisible();

    await userEvent.click(canvas.getByLabelText("Other answer"));
    await userEvent.keyboard("Preview environment");
    await userEvent.click(canvas.getByRole("button", { name: /Next/ }));

    await expect(canvas.getByText("2/3")).toBeVisible();
    await userEvent.click(canvas.getByText("High latency"));
    await userEvent.click(canvas.getByText("Tool errors"));
    await userEvent.click(canvas.getByRole("button", { name: /Next/ }));

    await expect(canvas.getByText("3/3")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledTimes(1);
    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [
        { selectedOptionIndexes: [], otherText: "Preview environment" },
        { selectedOptionIndexes: [0, 2], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    );
  },
});

export const SingleQuestionShortcut = meta.story({
  name: "(Test) Single question submits with the keyboard shortcut",
  args: {
    tool: createQuestionnaireTool({ questions: [multiStepArgs.questions[0]] }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("1/1")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByText("Staging"));
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    await expect(args.onAnswerQuestionnaire).toHaveBeenCalledWith(
      "approval-questionnaire-1",
      [{ selectedOptionIndexes: [1], otherText: null }],
    );
  },
});

export const Dismiss = meta.story({
  name: "(Test) Dismiss rejects the questionnaire",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss questions" }),
    );
    await expect(args.onRejectToolCall).toHaveBeenCalledWith(
      "approval-questionnaire-1",
    );
    await expect(args.onAnswerQuestionnaire).not.toHaveBeenCalled();
  },
});

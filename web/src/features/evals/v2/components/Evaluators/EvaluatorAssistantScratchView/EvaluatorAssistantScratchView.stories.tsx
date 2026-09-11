import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantScratchView } from "./EvaluatorAssistantScratchView";

const meta = preview.meta({ component: EvaluatorAssistantScratchView });

export const CodeEvaluator = meta.story({
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const JudgeEvaluator = meta.story({
  args: {
    evaluatorType: "LLM_AS_JUDGE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const Compact = meta.story({
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const Loading = meta.story({
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(() => new Promise<boolean>(() => undefined)),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", {
        name: "Describe the evaluator you want",
      }),
      "Score answer helpfulness",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create evaluator" }),
    );
  },
});

export const ExampleSelection = meta.story({
  name: "(Test) Selects Example Without Submitting",
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const composer = canvas.getByRole("group", {
      name: "Evaluator request composer",
    });
    const examples = canvas.getByRole("region", {
      name: "Try one of these",
    });

    await expect(
      within(composer).getByRole("button", { name: "Create evaluator" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(examples).getByRole("button", {
        name: "Score helpfulness 1–5 with a one-sentence reason",
      }),
    );
    await expect(
      within(composer).getByRole("textbox", {
        name: "Describe the evaluator you want",
      }),
    ).toHaveValue("Score helpfulness 1–5 with a one-sentence reason");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

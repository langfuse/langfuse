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

export const ConfigureManually = meta.story({
  name: "(Test) Configure Manually",
  args: {
    evaluatorType: "LLM_AS_JUDGE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Configure it manually instead",
      }),
    );
    await expect(args.onConfigureManually).toHaveBeenCalledOnce();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

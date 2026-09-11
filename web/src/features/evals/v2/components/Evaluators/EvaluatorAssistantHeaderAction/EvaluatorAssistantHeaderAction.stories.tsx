import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantHeaderAction } from "./EvaluatorAssistantHeaderAction";

const meta = preview.meta({ component: EvaluatorAssistantHeaderAction });

export const Create = meta.story({
  args: {
    mode: "create",
    onClick: fn(),
  },
});

export const ExistingCodeEvaluator = meta.story({
  args: {
    mode: "edit",
    triggerRef: { current: null },
    onClick: fn(),
  },
});

export const ExistingJudgeEvaluator = meta.story({
  args: {
    mode: "edit",
    triggerRef: { current: null },
    onClick: fn(),
  },
});

export const TriggersChangeDescription = meta.story({
  name: "(Test) Triggers Change Description",
  args: {
    mode: "edit",
    triggerRef: { current: null },
    onClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "or say what should change",
      }),
    );
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

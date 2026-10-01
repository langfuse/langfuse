import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantHeaderAction } from "./EvaluatorAssistantHeaderAction";

const meta = preview.meta({
  component: EvaluatorAssistantHeaderAction,
  render: (args) => (
    <h2 className="text-primary inline-flex flex-wrap items-baseline gap-x-2 text-lg leading-7 font-bold">
      <span>Configure evaluator</span>
      <EvaluatorAssistantHeaderAction {...args} />
    </h2>
  ),
});

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
    const action = canvas.getByRole("button", {
      name: "or describe what should change",
    });
    const label = within(action).getByText("or describe what should change");
    const icon = action.querySelector("svg.lucide-bot-message-square");

    await expect(icon).toHaveAttribute("aria-hidden", "true");
    await expect(
      label.compareDocumentPosition(icon as SVGElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(action);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

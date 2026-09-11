import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../../../../.storybook/preview";
import { EvaluatorAssistantEditDialog } from "./EvaluatorAssistantEditDialog";

const meta = preview.meta({ component: EvaluatorAssistantEditDialog });

const sharedArgs = {
  open: true,
  onOpenChange: fn(),
  onAssistantSubmit: fn(async () => true),
};

export const CodeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    evaluatorType: "code",
  },
});

export const JudgeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    evaluatorType: "judge",
  },
});

export const DismissesFromBackdrop = meta.story({
  name: "(Test) Dismisses From Backdrop",
  args: {
    ...sharedArgs,
    evaluatorType: "code",
    onOpenChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const overlay = canvasElement.ownerDocument.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    );

    await expect(overlay).not.toBeNull();
    await userEvent.click(overlay!);
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
});

export const EmbeddedSendPending = meta.story({
  name: "(Test) Embedded Send Pending",
  args: {
    ...sharedArgs,
    evaluatorType: "judge",
    onAssistantSubmit: fn(() => new Promise<boolean>(() => undefined)),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog");
    const composer = within(dialog).getByRole("group", {
      name: "Evaluator request composer",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe how to change this LLM-as-a-judge evaluator",
    });

    await expect(
      dialog.querySelector(".dialog-footer"),
    ).not.toBeInTheDocument();
    await expect(
      within(dialog).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    await userEvent.type(input, "Use a five-point score");
    await userEvent.click(
      within(composer).getByRole("button", { name: "Open Assistant" }),
    );

    await expect(args.onAssistantSubmit).toHaveBeenCalledOnce();
    await expect(composer).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();
    await expect(
      within(composer).getByRole("button", { name: "Open Assistant" }),
    ).toBeDisabled();
  },
});

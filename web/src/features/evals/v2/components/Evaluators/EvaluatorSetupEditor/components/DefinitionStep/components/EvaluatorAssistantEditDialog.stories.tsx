import { useRef, useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

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
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          Edit evaluator
        </button>
        <EvaluatorAssistantEditDialog
          {...args}
          open={open}
          returnFocusRef={triggerRef}
          onOpenChange={(nextOpen) => {
            args.onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
        />
      </>
    );
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = body.getByRole("button", { name: "Edit evaluator" });
    const getOverlay = () =>
      canvasElement.ownerDocument.querySelector<HTMLElement>(
        '[data-state="open"].fixed.inset-0',
      );

    await expect(getOverlay()).not.toBeNull();
    await userEvent.click(getOverlay()!);
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    await userEvent.click(trigger);
    await userEvent.click(
      within(body.getByRole("dialog")).getAllByRole("button", {
        name: "Close",
      })[0],
    );
    await waitFor(() => {
      expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  },
});

export const EmbeddedSendPending = meta.story({
  name: "(Test) Embedded Send Pending",
  args: {
    ...sharedArgs,
    evaluatorType: "code",
    onAssistantSubmit: fn(async () => true),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    let finishSubmission: (started: boolean) => void = () => undefined;
    args.onAssistantSubmit.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishSubmission = resolve;
        }),
    );
    const dialog = body.getByRole("dialog");
    const composer = within(dialog).getByRole("group", {
      name: "Evaluator request composer",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe how to change this code evaluator",
    });
    const submit = within(composer).getByRole("button", {
      name: "Open Assistant",
    });

    await expect(
      dialog.querySelector(".dialog-footer"),
    ).not.toBeInTheDocument();
    await expect(
      within(dialog).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    await expect(submit).toBeDisabled();
    await userEvent.type(input, "  Also fail when the output is empty  ");
    await userEvent.keyboard("{Enter}");
    fireEvent.submit(input.closest("form")!);

    await expect(args.onAssistantSubmit).toHaveBeenCalledOnce();
    await expect(args.onAssistantSubmit).toHaveBeenCalledWith(
      "Also fail when the output is empty",
    );
    await expect(composer).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();
    await expect(submit).toBeDisabled();

    const overlay = canvasElement.ownerDocument.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    );
    await userEvent.click(overlay!);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(body.getByRole("dialog")).getAllByRole("button", {
        name: "Close",
      })[0],
    );
    await expect(body.getByRole("dialog")).toBeInTheDocument();

    finishSubmission(false);
    await waitFor(() => {
      expect(composer).toHaveAttribute("aria-busy", "false");
      expect(input).toBeEnabled();
      expect(body.getByRole("dialog")).toBeInTheDocument();
    });
  },
});

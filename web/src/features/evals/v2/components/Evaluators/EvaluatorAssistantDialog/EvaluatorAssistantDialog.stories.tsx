import { useRef, useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantDialog } from "./EvaluatorAssistantDialog";

const meta = preview.meta({ component: EvaluatorAssistantDialog });

const sharedArgs = {
  open: true,
  returnFocusRef: { current: null },
  onOpenChange: fn(),
  onAssistantSubmit: fn(async () => true),
};

export const CreateCodeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    mode: "create",
    evaluatorType: "code",
  },
});

export const CreateJudgeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    mode: "create",
    evaluatorType: "judge",
  },
});

export const EditCodeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    mode: "edit",
    evaluatorType: "code",
  },
});

export const EditJudgeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    mode: "edit",
    evaluatorType: "judge",
  },
});

export const SelectsCreateExampleWithoutSubmitting = meta.story({
  name: "(Test) Selects Create Example Without Submitting",
  args: {
    ...sharedArgs,
    mode: "create",
    evaluatorType: "judge",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog");
    const input = within(dialog).getByRole("textbox", {
      name: "Describe the LLM-as-a-judge evaluator you want",
    });
    const examples = within(dialog).getByRole("region", {
      name: "Try one of these",
    });

    await expect(within(dialog).getByText("Create with AI")).toBeVisible();
    await userEvent.click(
      within(examples).getByRole("button", {
        name: "Score helpfulness 1–5 with a one-sentence reason",
      }),
    );
    await expect(input).toHaveValue(
      "Score helpfulness 1–5 with a one-sentence reason",
    );
    await expect(args.onAssistantSubmit).not.toHaveBeenCalled();
  },
});

export const SelectsEditExampleWithoutSubmitting = meta.story({
  name: "(Test) Selects Edit Example Without Submitting",
  args: {
    ...sharedArgs,
    mode: "edit",
    evaluatorType: "code",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog");
    const input = within(dialog).getByRole("textbox", {
      name: "Describe how to change this code evaluator",
    });
    const examples = within(dialog).getByRole("region", {
      name: "Try one of these",
    });

    await expect(within(dialog).getByText("Edit with AI")).toBeVisible();
    await userEvent.click(
      within(examples).getByRole("button", {
        name: "Make the evaluation criterion stricter",
      }),
    );
    await expect(input).toHaveValue("Make the evaluation criterion stricter");
    await expect(args.onAssistantSubmit).not.toHaveBeenCalled();
  },
});

export const DismissesWhenIdleAndRestoresFocus = meta.story({
  name: "(Test) Dismisses When Idle And Restores Focus",
  args: {
    ...sharedArgs,
    mode: "edit",
    evaluatorType: "code",
    onOpenChange: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          Edit with AI
        </button>
        <EvaluatorAssistantDialog
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
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", {
      name: "Edit with AI",
      hidden: true,
    });
    const getOverlay = () =>
      canvasElement.ownerDocument.querySelector<HTMLElement>(
        '[data-state="open"].fixed.inset-0',
      );

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
  },
});

export const LocksDismissalAndDuplicateSubmitWhilePending = meta.story({
  name: "(Test) Locks Dismissal And Duplicate Submit While Pending",
  args: {
    ...sharedArgs,
    mode: "edit",
    evaluatorType: "code",
    onAssistantSubmit: fn(async () => true),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    let finishSubmission: (started: boolean) => void = () => undefined;
    const onAssistantSubmit = args.onAssistantSubmit as ReturnType<typeof fn>;
    onAssistantSubmit.mockImplementationOnce(
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

    await expect(
      within(dialog).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    await userEvent.type(input, "  Also fail when the output is empty  ");
    await userEvent.keyboard("{Enter}");
    fireEvent.submit(input.closest("form")!);

    await expect(onAssistantSubmit).toHaveBeenCalledOnce();
    await expect(onAssistantSubmit).toHaveBeenCalledWith(
      "Also fail when the output is empty",
    );
    await expect(composer).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();

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
    await expect(onAssistantSubmit).toHaveBeenCalledOnce();

    finishSubmission(false);
    await waitFor(() => {
      expect(composer).toHaveAttribute("aria-busy", "false");
      expect(input).toBeEnabled();
    });
  },
});

import { useRef, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantHeaderAction } from "./EvaluatorAssistantHeaderAction";
import { EvaluatorAssistantEditDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/EvaluatorAssistantEditDialog";

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
    await expect(label.nextElementSibling).toBe(icon);

    await userEvent.click(action);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

export const PreservesManualDraft = meta.story({
  name: "(Test) Preserves Manual Draft",
  args: {
    mode: "create",
    onClick: fn(),
  },
  render: function Render(args) {
    const [draft, setDraft] = useState("Keep this judge draft");

    return (
      <>
        <input
          aria-label="Evaluator draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <EvaluatorAssistantHeaderAction {...args} />
      </>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "or describe what should change",
      }),
    );

    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(canvas.getByLabelText("Evaluator draft")).toHaveValue(
      "Keep this judge draft",
    );
  },
});

export const OpensExistingEvaluatorDialog = meta.story({
  name: "(Test) Opens Existing Evaluator Dialog",
  args: {
    mode: "edit",
    triggerRef: { current: null },
    onClick: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <EvaluatorAssistantHeaderAction
          mode="edit"
          triggerRef={triggerRef}
          onClick={() => {
            args.onClick();
            setOpen(true);
          }}
        />
        <EvaluatorAssistantEditDialog
          open={open}
          evaluatorType="judge"
          returnFocusRef={triggerRef}
          onOpenChange={setOpen}
          onAssistantSubmit={fn(async () => true)}
        />
      </>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "or describe what should change",
      }),
    );

    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(body.getByRole("dialog")).toBeInTheDocument();
    await expect(
      body.getByLabelText(
        "Describe how to change this LLM-as-a-judge evaluator",
      ),
    ).toBeInTheDocument();
  },
});

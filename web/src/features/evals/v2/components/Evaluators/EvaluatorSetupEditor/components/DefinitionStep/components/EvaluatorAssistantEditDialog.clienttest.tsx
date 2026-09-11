import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluatorAssistantEditDialog } from "./EvaluatorAssistantEditDialog";

function DialogHarness({
  onAssistantSubmit = vi.fn(async () => true),
}: {
  onAssistantSubmit?: (request: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <TooltipProvider>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Edit evaluator
      </button>
      <EvaluatorAssistantEditDialog
        open={open}
        evaluatorType="code"
        returnFocusRef={triggerRef}
        onOpenChange={setOpen}
        onAssistantSubmit={onAssistantSubmit}
      />
    </TooltipProvider>
  );
}

describe("EvaluatorAssistantEditDialog", () => {
  it("dismisses from the backdrop, Escape, and canonical close control", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Edit evaluator" });

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const overlay = document.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    );
    expect(overlay).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: "mouse" });
    fireEvent.click(overlay!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "Close",
      })[0],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses only the embedded send action and locks handoff while pending", async () => {
    let finishSubmission: (started: boolean) => void = () => undefined;
    const onAssistantSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSubmission = resolve;
        }),
    );

    render(<DialogHarness onAssistantSubmit={onAssistantSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit evaluator" }));

    const dialog = screen.getByRole("dialog");
    const composer = within(dialog).getByRole("group", {
      name: "Evaluator request composer",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe how to change this code evaluator",
    });
    const submit = within(composer).getByRole("button", {
      name: "Open Assistant",
    });

    expect(dialog.querySelector(".dialog-footer")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(input, {
      target: { value: "  Also fail when the output is empty  " },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);

    expect(onAssistantSubmit).toHaveBeenCalledOnce();
    expect(onAssistantSubmit).toHaveBeenCalledWith(
      "Also fail when the output is empty",
    );
    expect(composer).toHaveAttribute("aria-busy", "true");
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();

    const overlay = document.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    );
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: "mouse" });
    fireEvent.click(overlay!);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "Close",
      })[0],
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    finishSubmission(false);
    await waitFor(() => {
      expect(composer).toHaveAttribute("aria-busy", "false");
      expect(input).toBeEnabled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

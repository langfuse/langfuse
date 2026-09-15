import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EvaluatorAssistantHeaderAction } from "./EvaluatorAssistantHeaderAction";
import { EvaluatorAssistantEditDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/EvaluatorAssistantEditDialog";
import { TooltipProvider } from "@/src/components/ui/tooltip";

describe("EvaluatorAssistantHeaderAction", () => {
  it("switches a manual draft to AI entry without clearing draft state", () => {
    const onSwitchToAssistant = vi.fn();

    function DraftHarness() {
      const [draft, setDraft] = useState("Keep this judge draft");

      return (
        <>
          <input
            aria-label="Evaluator draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <EvaluatorAssistantHeaderAction
            mode="create"
            onClick={onSwitchToAssistant}
          />
        </>
      );
    }

    render(<DraftHarness />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "or describe what should change",
      }),
    );

    expect(onSwitchToAssistant).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Evaluator draft")).toHaveValue(
      "Keep this judge draft",
    );
  });

  it("opens the existing evaluator change dialog", () => {
    function ExistingEvaluatorHarness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);

      return (
        <>
          <EvaluatorAssistantHeaderAction
            mode="edit"
            triggerRef={triggerRef}
            onClick={() => setOpen(true)}
          />
          <EvaluatorAssistantEditDialog
            open={open}
            evaluatorType="judge"
            returnFocusRef={triggerRef}
            onOpenChange={setOpen}
            onAssistantSubmit={vi.fn(async () => true)}
          />
        </>
      );
    }

    render(
      <TooltipProvider>
        <ExistingEvaluatorHarness />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "or describe what should change",
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Describe how to change this LLM-as-a-judge evaluator",
      ),
    ).toBeInTheDocument();
  });
});

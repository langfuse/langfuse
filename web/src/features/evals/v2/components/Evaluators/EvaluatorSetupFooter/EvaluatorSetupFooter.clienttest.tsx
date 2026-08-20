import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorSetupFooter } from "./EvaluatorSetupFooter";

describe("EvaluatorSetupFooter", () => {
  it("does not allow saving a code evaluator with client validation errors", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    store.getState().actions.setName("Invalid code evaluator");

    render(
      <TooltipProvider>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot=""
          isEditing={false}
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={{ isValid: false, isPending: false }}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeDisabled();
  });
});

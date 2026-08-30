import { fireEvent, render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";
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

  it("explains that empty category names block evaluator creation", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "LLM_AS_JUDGE",
      mode: "create",
    });
    store.getState().actions.setName("Categorical evaluator");
    store.getState().actions.setScoreOutput({
      dataType: ScoreDataTypeEnum.CATEGORICAL,
      scoreDescription: "Classify the response",
      reasoningDescription: "Explain the classification",
      choices: [{ label: "" }, { label: "" }],
      shouldAllowMultipleMatches: false,
      minValue: "",
      maxValue: "",
    });

    render(
      <TooltipProvider delayDuration={0}>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot=""
          isEditing={false}
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    const createButton = screen.getByRole("button", {
      name: "Create evaluator",
    });
    expect(createButton).toBeDisabled();

    fireEvent.focus(createButton.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Category names cannot be empty.",
    );
  });

  it("states the next step after creating an evaluator", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    store.getState().actions.setName("Named evaluator");

    render(
      <TooltipProvider>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot=""
          isEditing={false}
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={{ isValid: true, isPending: false }}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText(
        "Next: attach a rule to run this evaluator on incoming traffic.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeInTheDocument();
  });

  it("does not show the create next-step line when editing", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Existing evaluator",
        description: null,
        definition: {
          type: "CODE",
          sourceCode: "return { value: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      mode: "edit",
    });

    render(
      <TooltipProvider>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot=""
          isEditing={true}
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByText(
        "Next: attach a rule to run this evaluator on incoming traffic.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});

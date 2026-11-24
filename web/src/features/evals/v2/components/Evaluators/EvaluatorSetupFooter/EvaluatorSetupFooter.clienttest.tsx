import { act, fireEvent, render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum, TopicsTargetObject } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { evaluatorSetupSnapshot } from "@/src/features/evals/v2/fns/evaluators/evaluatorSetupSnapshot";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorSetupFooter } from "./EvaluatorSetupFooter";

describe("EvaluatorSetupFooter", () => {
  it("allows saving an existing evaluator when only a trace JSON path changes", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Helpfulness",
        description: null,
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [{ role: "user", content: "Judge {{output}}" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Helpfulness" },
            reasoning: { description: "Explain the score" },
          },
        },
      },
      mode: "edit",
    });
    const initialSnapshot = evaluatorSetupSnapshot(store.getState());
    const { actions } = store.getState();
    actions.setTargetObject(TopicsTargetObject);

    render(
      <TooltipProvider>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot={initialSnapshot}
          isEditing
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={null}
          fallbackDecisionModel={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    act(() =>
      actions.setTraceVariableField("output", {
        selectedColumnId: "threads",
        jsonSelector: "$[0].messages[-1:]",
      }),
    );

    expect(saveButton).toBeEnabled();
  });

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
          fallbackDecisionModel={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeDisabled();
  });

  it("explains that empty prompt messages block evaluator creation", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "LLM_AS_JUDGE",
      mode: "create",
    });
    store.getState().actions.setName("LLM evaluator");
    store.getState().actions.setPromptMessage(0, { role: "user", content: "" });

    render(
      <TooltipProvider delayDuration={0}>
        <EvaluatorSetupFooter
          store={store}
          initialSnapshot=""
          isEditing={false}
          isSaving={false}
          nameAIAssistanceAvailable={false}
          codeValidation={null}
          fallbackDecisionModel={null}
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
      "Add content to every prompt message before saving.",
    );
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
          fallbackDecisionModel={null}
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
});

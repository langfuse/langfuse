import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { numericOutputDefinitionDefaults } from "@/src/features/evals/utils/template-form-defaults";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/prepareEvaluatorDraft";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorSetupFooter } from "./EvaluatorSetupFooter";

describe("EvaluatorSetupFooter", () => {
  it("enables saving after editing an existing evaluator", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Has output",
        description: "Checks for output",
        definition: {
          type: "CODE",
          sourceCode: "return { score: output ? 1 : 0 };",
          sourceCodeLanguage: "TYPESCRIPT",
          variableMapping: null,
        },
      },
    });
    const initialState = store.getState();
    const initialSnapshot = JSON.stringify({
      name: initialState.name.trim(),
      description: initialState.description.trim() || null,
      definition: prepareEvaluatorDraft(initialState).definition,
    });

    render(
      <EvaluatorSetupFooter
        store={store}
        initialSnapshot={initialSnapshot}
        isEditing
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    act(() =>
      store
        .getState()
        .actions.setSourceCode("return { score: output ? 0.5 : 0 };"),
    );

    expect(saveButton).toBeEnabled();
  });

  it("enables saving an existing judge that uses legacy default descriptions", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Quality",
        description: null,
        definition: {
          type: "LLM_AS_JUDGE",
          prompt: "Judge {{output}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: [
            {
              templateVariable: "output",
              selectedColumnId: "output",
              jsonSelector: null,
            },
          ],
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: {
              description: numericOutputDefinitionDefaults.scoreDescription,
            },
            reasoning: {
              description: numericOutputDefinitionDefaults.reasoningDescription,
            },
          },
        },
      },
    });
    const initialState = store.getState();
    const initialSnapshot = JSON.stringify({
      name: initialState.name.trim(),
      description: null,
      definition: prepareEvaluatorDraft(initialState).definition,
    });

    render(
      <EvaluatorSetupFooter
        store={store}
        initialSnapshot={initialSnapshot}
        isEditing
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const saveButton = screen.getByRole("button", { name: "Save changes" });

    act(() => store.getState().actions.setPrompt("Judge {{output}} carefully"));

    expect(saveButton).toBeEnabled();
  });
});

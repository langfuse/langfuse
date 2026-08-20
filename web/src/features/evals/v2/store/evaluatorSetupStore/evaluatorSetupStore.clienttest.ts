import { describe, expect, it } from "vitest";

import { getDefaultCodeEvalSource } from "@/src/features/evals/utils/code-eval-template-starter-examples";
import { EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS } from "@/src/features/evals/v2/constants/experimentAndEvalFilters";
import { createEvaluatorSetupStore } from "./evaluatorSetupStore";

describe("createEvaluatorSetupStore", () => {
  it("starts new evaluator descriptions empty", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    expect(store.getState().scoreOutput).toMatchObject({
      scoreDescription: "",
      reasoningDescription: "",
    });
  });

  it("keeps prompt and code drafts when switching evaluator type", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();

    actions.setPrompt("Judge {{output}}");
    actions.setSourceCode("return { score: 1 };");
    actions.setType("CODE");
    actions.setType("LLM_AS_JUDGE");

    expect(store.getState()).toMatchObject({
      type: "LLM_AS_JUDGE",
      prompt: "Judge {{output}}",
      sourceCode: "return { score: 1 };",
    });
  });

  it("initializes an existing code evaluator", () => {
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
      mode: "edit",
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      name: "Has output",
      description: "Checks for output",
      sourceCode: "return { score: output ? 1 : 0 };",
      sourceCodeLanguage: "TYPESCRIPT",
      sampleFilter: [],
    });
  });

  it("starts a blank code evaluator from the gallery", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      sourceCodeLanguage: "TYPESCRIPT",
      sourceCode: getDefaultCodeEvalSource("TYPESCRIPT"),
    });
  });

  it("keeps sample filters available for the rule creation handoff", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const sampleFilter = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ];

    store.getState().actions.setSampleFilter(sampleFilter);

    expect(store.getState().sampleFilter).toBe(sampleFilter);
  });

  it("prefills sample filters for new evaluators", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    expect(store.getState().sampleFilter).toEqual([
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
      ...EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS,
    ]);
  });

  it("keeps configured parameters for the selected model and resets them when the model changes", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();

    actions.configureModel(
      { provider: "OpenAI", model: "gpt-4.1-mini" },
      { temperature: 0.2 },
    );
    actions.selectModel({ provider: "OpenAI", model: "gpt-4.1-mini" });
    expect(store.getState().modelParams).toEqual({ temperature: 0.2 });

    actions.selectModel({ provider: "OpenAI", model: "gpt-4.1" });
    expect(store.getState().modelParams).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { createEvaluatorSetupStore } from "./evaluatorSetupStore";

describe("createEvaluatorSetupStore", () => {
  it("keeps prompt and code drafts when switching evaluator type", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
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
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      name: "Has output",
      description: "Checks for output",
      sourceCode: "return { score: output ? 1 : 0 };",
      sourceCodeLanguage: "TYPESCRIPT",
    });
  });

  it("starts a blank code evaluator from the gallery", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
    });

    expect(store.getState().type).toBe("CODE");
  });
});

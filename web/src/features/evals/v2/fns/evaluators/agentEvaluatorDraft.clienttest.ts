import { describe, expect, it } from "vitest";

import { agentEvaluatorDraftToSetupDraft } from "./agentEvaluatorDraft";

describe("agentEvaluatorDraftToSetupDraft", () => {
  it("keeps name, prompt, mappings, and score output for the setup form", () => {
    const draft = agentEvaluatorDraftToSetupDraft({
      name: "Helpfulness",
      description: "Scores whether the answer helps the user.",
      definition: {
        type: "LLM_AS_JUDGE",
        prompt: "Score {{output}} given {{input}}",
        provider: null,
        model: null,
        modelParams: null,
        vars: ["output", "input"],
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: null,
          },
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
        outputDefinition: {
          version: 2,
          dataType: "NUMERIC",
          reasoning: { description: "Explain the score." },
          score: {
            description: "Helpfulness from 0 to 1.",
            minValue: 0,
            maxValue: 1,
          },
        },
      },
    });

    expect(draft.name).toBe("Helpfulness");
    expect(draft.definition.type).toBe("LLM_AS_JUDGE");
    if (draft.definition.type !== "LLM_AS_JUDGE") {
      throw new Error("expected LLM evaluator");
    }
    expect(draft.definition.prompt).toContain("{{output}}");
    expect(draft.definition.variableMapping).toEqual([
      {
        templateVariable: "output",
        selectedColumnId: "output",
        jsonSelector: null,
      },
      {
        templateVariable: "input",
        selectedColumnId: "input",
        jsonSelector: null,
      },
    ]);
    expect(draft.definition.outputDefinition).toMatchObject({
      dataType: "NUMERIC",
      score: { minValue: 0, maxValue: 1 },
    });
  });
});

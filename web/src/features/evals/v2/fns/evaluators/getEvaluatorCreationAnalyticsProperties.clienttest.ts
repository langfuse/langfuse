import { describe, expect, it } from "vitest";

import { getEvaluatorCreationAnalyticsProperties } from "./getEvaluatorCreationAnalyticsProperties";

describe("getEvaluatorCreationAnalyticsProperties", () => {
  it("reports all evaluator creation attributes", () => {
    expect(
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType: "LLM_AS_JUDGE",
        creationSource: { type: "managed", templateKey: "hallucination" },
        evaluatorConfig: {
          usesDefaultModel: false,
          hasCustomModelParams: true,
          scoreType: "CATEGORICAL",
        },
        variableMapping: [
          {
            templateVariable: "question",
            selectedColumnId: "input",
            jsonSelector: null,
          },
          {
            templateVariable: "answer",
            selectedColumnId: "output",
            jsonSelector: "$",
          },
          {
            templateVariable: "context",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      }),
    ).toEqual({
      evaluatorType: "LLM_AS_JUDGE",
      managedTemplateKey: "hallucination",
      isCustomTemplate: false,
      isFromScratch: false,
      usesDefaultModel: false,
      hasCustomModelParams: true,
      scoreType: "CATEGORICAL",
      hasNarrowedVariableMapping: false,
      variableMappingSources: ["input", "output"],
    });

    expect(
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType: "CODE",
        creationSource: { type: "scratch" },
        sourceCodeLanguage: "PYTHON",
      }),
    ).toEqual({
      evaluatorType: "CODE",
      isCustomTemplate: false,
      isFromScratch: true,
      sourceCodeLanguage: "PYTHON",
    });
  });
});

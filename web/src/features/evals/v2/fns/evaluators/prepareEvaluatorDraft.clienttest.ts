import { ScoreDataTypeEnum } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { prepareEvaluatorDraft } from "./prepareEvaluatorDraft";

describe("prepareEvaluatorDraft", () => {
  it("prepares a complete judge definition", () => {
    const initialDefinition = {
      type: "LLM_AS_JUDGE" as const,
      prompt: "Judge {{output}}",
      provider: "openai",
      model: "gpt-test",
      modelParams: { temperature: 0.2 },
      vars: ["output"],
      variableMapping: [],
      outputDefinition: {
        dataType: ScoreDataTypeEnum.NUMERIC,
        score: { description: "Quality" },
        reasoning: { description: "Reasoning" },
      },
    };

    expect(
      prepareEvaluatorDraft({
        type: "LLM_AS_JUDGE",
        prompt: "Judge {{output}}",
        sourceCode: "",
        sourceCodeLanguage: "TYPESCRIPT",
        scoreOutput: {
          dataType: ScoreDataTypeEnum.NUMERIC,
          scoreDescription: "Quality",
          reasoningDescription: "Reasoning",
          choices: [],
          shouldAllowMultipleMatches: false,
          minValue: "0",
          maxValue: "1",
        },
        variableFields: {
          output: { selectedColumnId: "output", jsonSelector: "$.answer" },
        },
        modelMode: "custom",
        selectedModel: { provider: "openai", model: "gpt-test" },
        modelParams: { temperature: 0.2 },
        initialDefinition,
      }),
    ).toMatchObject({
      definition: {
        type: "LLM_AS_JUDGE",
        prompt: "Judge {{output}}",
        modelConfig: {
          provider: "openai",
          model: "gpt-test",
          modelParams: { temperature: 0.2 },
        },
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: "$.answer",
          },
        ],
      },
    });
  });
});

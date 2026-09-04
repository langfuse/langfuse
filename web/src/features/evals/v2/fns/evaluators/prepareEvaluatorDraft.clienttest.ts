import { ScoreDataTypeEnum } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { prepareEvaluatorDraft } from "./prepareEvaluatorDraft";

describe("prepareEvaluatorDraft", () => {
  it("prepares a complete judge definition", () => {
    const initialDefinition = {
      type: "LLM_AS_JUDGE" as const,
      promptMessages: [{ role: "user" as const, content: "Judge {{output}}" }],
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
        promptMessages: [{ role: "user", content: "Judge {{output}}" }],
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
        promptMessages: [{ role: "user", content: "Judge {{output}}" }],
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

  it("does not prepare a definition with a non-first system message", () => {
    const result = prepareEvaluatorDraft({
      type: "LLM_AS_JUDGE",
      promptMessages: [
        { role: "user", content: "Judge {{output}}" },
        { role: "system", content: "Be strict" },
      ],
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
        output: { selectedColumnId: "output", jsonSelector: null },
      },
      modelMode: "default",
      selectedModel: null,
      modelParams: null,
      initialDefinition: undefined,
    });

    expect(result.definition).toBeNull();
  });

  it("does not prepare a definition with an empty prompt message", () => {
    const result = prepareEvaluatorDraft({
      type: "LLM_AS_JUDGE",
      promptMessages: [
        { role: "user", content: "Judge {{output}}" },
        { role: "assistant", content: "   " },
      ],
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
        output: { selectedColumnId: "output", jsonSelector: null },
      },
      modelMode: "default",
      selectedModel: null,
      modelParams: null,
      initialDefinition: undefined,
    });

    expect(result.definition).toBeNull();
  });
});

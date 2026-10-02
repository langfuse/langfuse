import { DecisionModelQuestionType, ScoreDataTypeEnum } from "@langfuse/shared";
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
        questions: [],
        stateKeys: [],
        name: "",
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
      questions: [],
      stateKeys: [],
      name: "",
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
      questions: [],
      stateKeys: [],
      name: "",
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

  it("prepares a decision-model definition from questions and state", () => {
    const base = {
      type: "DECISION_MODEL" as const,
      promptMessages: [],
      questions: [
        {
          id: "q1",
          type: DecisionModelQuestionType.CHOICE,
          scoreName: "verdict",
          instructions: "Is `output` ready to send?",
          options: [
            { value: "ready", description: "" },
            { value: "not_ready", description: "Needs edits" },
          ],
          levels: [],
          criteria: { true: "", false: "" },
        },
      ],
      stateKeys: ["input", "output"],
      name: "",
      sourceCode: "",
      sourceCodeLanguage: "TYPESCRIPT" as const,
      scoreOutput: {
        dataType: ScoreDataTypeEnum.NUMERIC,
        scoreDescription: "",
        reasoningDescription: "",
        choices: [],
        shouldAllowMultipleMatches: false,
        minValue: "",
        maxValue: "",
      },
      variableFields: {
        output: { selectedColumnId: "output", jsonSelector: "$.answer" },
      },
      modelMode: "custom" as const,
      selectedModel: { provider: "typesafe", model: "jev-latest" },
      modelParams: null,
      initialDefinition: undefined,
    };

    expect(prepareEvaluatorDraft(base).definition).toEqual({
      type: "DECISION_MODEL",
      questions: [
        {
          id: "q1",
          type: "choice",
          scoreName: "verdict",
          instructions: "Is `output` ready to send?",
          options: [
            { value: "ready" },
            { value: "not_ready", description: "Needs edits" },
          ],
        },
      ],
      modelConfig: { provider: "typesafe", model: "jev-latest" },
      variableMapping: [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: "$.answer",
        },
      ],
    });

    // An unmapped state key blocks saving; the model would never see it.
    expect(
      prepareEvaluatorDraft({
        ...base,
        variableFields: {
          ...base.variableFields,
          input: { selectedColumnId: null, jsonSelector: null },
        },
      }).definition,
    ).toBeNull();
  });

  it("prepares decision-model state with constant values", () => {
    const result = prepareEvaluatorDraft({
      type: "DECISION_MODEL",
      promptMessages: [],
      questions: [
        {
          id: "q1",
          type: DecisionModelQuestionType.NOUL,
          scoreName: "matches_policy",
          instructions: "Does `output` follow `policy`?",
          options: [],
          levels: [],
          criteria: { true: "", false: "" },
        },
      ],
      stateKeys: ["output", "policy"],
      name: "",
      sourceCode: "",
      sourceCodeLanguage: "TYPESCRIPT",
      scoreOutput: {
        dataType: ScoreDataTypeEnum.NUMERIC,
        scoreDescription: "",
        reasoningDescription: "",
        choices: [],
        shouldAllowMultipleMatches: false,
        minValue: "",
        maxValue: "",
      },
      variableFields: {
        output: { selectedColumnId: "output", jsonSelector: null },
        policy: {
          selectedColumnId: null,
          jsonSelector: null,
          valueSource: "constant",
          constantValue: '{"tone":"friendly","maxWords":100}',
        },
      },
      modelMode: "custom",
      selectedModel: { provider: "typesafe", model: "jev-latest" },
      modelParams: null,
      initialDefinition: undefined,
    });

    expect(result.definition).toMatchObject({
      variableMapping: [
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
        {
          templateVariable: "policy",
          constantValue: { tone: "friendly", maxWords: 100 },
        },
      ],
    });
  });
});

import { describe, expect, it } from "vitest";
import { ScoreDataTypeEnum } from "../../domain/scores";
import {
  createDefaultScoreResultPredicate,
  deriveEvaluatorScoreDefinitions,
} from "./evaluatorScoreDefinitions";
import { EvalTemplateTypeEnum } from "./types";

describe("deriveEvaluatorScoreDefinitions", () => {
  it.each([
    {
      outputDefinition: { reasoning: "Why", score: "Score" },
      expected: {
        name: "legacy judge",
        dataType: ScoreDataTypeEnum.NUMERIC,
      },
    },
    {
      outputDefinition: {
        dataType: ScoreDataTypeEnum.BOOLEAN,
        reasoning: { description: "" },
        score: { description: "" },
      },
      expected: {
        name: "boolean judge",
        dataType: ScoreDataTypeEnum.BOOLEAN,
      },
    },
    {
      outputDefinition: {
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: { description: "" },
        score: {
          description: "",
          categories: ["safe", "unsafe"],
          shouldAllowMultipleMatches: false,
        },
      },
      expected: {
        name: "categorical judge",
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        allowedValues: ["safe", "unsafe"],
      },
    },
    {
      outputDefinition: {
        dataType: ScoreDataTypeEnum.NUMERIC,
        reasoning: { description: "" },
        score: { description: "", minValue: -1, maxValue: 5 },
      },
      expected: {
        name: "numeric judge",
        dataType: ScoreDataTypeEnum.NUMERIC,
        minValue: -1,
        maxValue: 5,
      },
    },
  ])("derives an LLM-as-a-judge $expected.dataType score", (testCase) => {
    expect(
      deriveEvaluatorScoreDefinitions({
        name: testCase.expected.name,
        type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        outputDefinition: testCase.outputDefinition,
      }),
    ).toEqual({ mode: "known", scores: [testCase.expected] });
  });

  it("derives one score for each saved decision-model question", () => {
    expect(
      deriveEvaluatorScoreDefinitions({
        name: "decision model",
        type: EvalTemplateTypeEnum.DECISION_MODEL,
        questions: [
          {
            id: "choice",
            scoreName: "verdict",
            type: "choice",
            instructions: "Choose",
            options: [{ value: "pass" }, { value: "fail" }],
          },
          {
            id: "score",
            scoreName: "quality",
            type: "score",
            instructions: "Score",
            levels: [
              { description: "bad" },
              { description: "okay" },
              { description: "great" },
            ],
          },
          {
            id: "noul",
            scoreName: "probability",
            type: "noul",
            instructions: "Decide",
          },
        ],
      }),
    ).toEqual({
      mode: "known",
      scores: [
        {
          name: "verdict",
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          allowedValues: ["pass", "fail"],
        },
        {
          name: "quality",
          dataType: ScoreDataTypeEnum.NUMERIC,
          minValue: 0,
          maxValue: 2,
        },
        {
          name: "probability",
          dataType: ScoreDataTypeEnum.NUMERIC,
          minValue: 0,
          maxValue: 1,
        },
      ],
    });
  });

  it("marks code evaluators as freeform and facets as unsupported", () => {
    expect(
      deriveEvaluatorScoreDefinitions({
        name: "code",
        type: EvalTemplateTypeEnum.CODE,
      }),
    ).toEqual({ mode: "freeform", scores: [] });
    expect(
      deriveEvaluatorScoreDefinitions({
        name: "facet",
        type: EvalTemplateTypeEnum.FACET,
      }),
    ).toEqual({ mode: "unsupported", scores: [] });
  });

  it.each([
    {
      definition: {
        name: "judge",
        type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        outputDefinition: { dataType: "TEXT" },
      },
    },
    {
      definition: {
        name: "decision model",
        type: EvalTemplateTypeEnum.DECISION_MODEL,
        questions: [{ type: "score", scoreName: "broken" }],
      },
    },
    {
      definition: {
        name: "judge",
        type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        outputDefinition: null,
      },
    },
  ])(
    "returns no known scores for malformed saved definitions",
    ({ definition }) => {
      expect(deriveEvaluatorScoreDefinitions(definition)).toEqual({
        mode: "known",
        scores: [],
      });
    },
  );
});

describe("createDefaultScoreResultPredicate", () => {
  it.each([
    {
      score: { name: "flag", dataType: ScoreDataTypeEnum.BOOLEAN } as const,
      expected: {
        scoreName: "flag",
        dataType: ScoreDataTypeEnum.BOOLEAN,
        operator: "=",
        value: false,
      },
    },
    {
      score: {
        name: "bounded",
        dataType: ScoreDataTypeEnum.NUMERIC,
        minValue: -2,
        maxValue: 2,
      } as const,
      expected: {
        scoreName: "bounded",
        dataType: ScoreDataTypeEnum.NUMERIC,
        operator: "=",
        value: -2,
      },
    },
    {
      score: { name: "number", dataType: ScoreDataTypeEnum.NUMERIC } as const,
      expected: {
        scoreName: "number",
        dataType: ScoreDataTypeEnum.NUMERIC,
        operator: "=",
        value: 0,
      },
    },
    {
      score: {
        name: "label",
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        allowedValues: ["first", "second"],
      } as const,
      expected: {
        scoreName: "label",
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        operator: "=",
        value: "first",
      },
    },
    {
      score: { name: "note", dataType: ScoreDataTypeEnum.TEXT } as const,
      expected: {
        scoreName: "note",
        dataType: ScoreDataTypeEnum.TEXT,
        operator: "=",
        value: "",
      },
    },
  ])("creates a default $score.dataType predicate", ({ score, expected }) => {
    expect(createDefaultScoreResultPredicate(score)).toEqual(expected);
  });
});

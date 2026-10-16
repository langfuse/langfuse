import { ScoreDataTypeEnum } from "../../domain/scores";
import {
  DecisionModelQuestionType,
  parseDecisionModelQuestions,
} from "./decisionModel";
import {
  EvalOutputDefinitionSchema,
  LegacyEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
} from "./outputDefinition";
import type { ScoreResultPredicate } from "./scoreResultTrigger";
import { EvalTemplateTypeEnum } from "./types";

export type TriggerableScoreDefinition =
  | {
      name: string;
      dataType: typeof ScoreDataTypeEnum.BOOLEAN;
    }
  | {
      name: string;
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      minValue?: number;
      maxValue?: number;
    }
  | {
      name: string;
      dataType: typeof ScoreDataTypeEnum.CATEGORICAL;
      allowedValues: readonly [string, ...string[]];
    }
  | {
      name: string;
      dataType: typeof ScoreDataTypeEnum.TEXT;
    };

export type EvaluatorScoreDefinitions =
  | {
      mode: "known";
      scores: TriggerableScoreDefinition[];
    }
  | {
      mode: "freeform";
      scores: [];
    }
  | {
      mode: "unsupported";
      scores: [];
    };

export type SavedEvaluatorDefinitionForScoreDerivation = {
  name: string;
  type: (typeof EvalTemplateTypeEnum)[keyof typeof EvalTemplateTypeEnum];
  outputDefinition?: unknown;
  questions?: unknown;
};

export function deriveEvaluatorScoreDefinitions(
  definition: SavedEvaluatorDefinitionForScoreDerivation,
): EvaluatorScoreDefinitions {
  switch (definition.type) {
    case EvalTemplateTypeEnum.LLM_AS_JUDGE:
      return deriveLlmAsJudgeScoreDefinitions(definition);
    case EvalTemplateTypeEnum.DECISION_MODEL:
      return deriveDecisionModelScoreDefinitions(definition.questions);
    case EvalTemplateTypeEnum.CODE:
      return { mode: "freeform", scores: [] };
    case EvalTemplateTypeEnum.FACET:
      return { mode: "unsupported", scores: [] };
  }
}

function deriveLlmAsJudgeScoreDefinitions(
  definition: SavedEvaluatorDefinitionForScoreDerivation,
): EvaluatorScoreDefinitions {
  const hasDataType =
    typeof definition.outputDefinition === "object" &&
    definition.outputDefinition !== null &&
    "dataType" in definition.outputDefinition;
  const parsed = (
    hasDataType ? EvalOutputDefinitionSchema : LegacyEvalOutputDefinitionSchema
  ).safeParse(definition.outputDefinition);
  if (!parsed.success) return { mode: "known", scores: [] };

  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  switch (resolved.dataType) {
    case ScoreDataTypeEnum.BOOLEAN:
      return {
        mode: "known",
        scores: [
          { name: definition.name, dataType: ScoreDataTypeEnum.BOOLEAN },
        ],
      };
    case ScoreDataTypeEnum.NUMERIC:
      return {
        mode: "known",
        scores: [
          {
            name: definition.name,
            dataType: ScoreDataTypeEnum.NUMERIC,
            ...(resolved.minValue !== undefined
              ? { minValue: resolved.minValue }
              : {}),
            ...(resolved.maxValue !== undefined
              ? { maxValue: resolved.maxValue }
              : {}),
          },
        ],
      };
    case ScoreDataTypeEnum.CATEGORICAL: {
      const [firstValue, ...remainingValues] = resolved.categories;
      if (!firstValue) return { mode: "known", scores: [] };
      return {
        mode: "known",
        scores: [
          {
            name: definition.name,
            dataType: ScoreDataTypeEnum.CATEGORICAL,
            allowedValues: [firstValue, ...remainingValues],
          },
        ],
      };
    }
  }
}

function deriveDecisionModelScoreDefinitions(
  questions: unknown,
): EvaluatorScoreDefinitions {
  const parsed = parseDecisionModelQuestions(questions);
  if (!parsed.success) return { mode: "known", scores: [] };

  return {
    mode: "known",
    scores: parsed.data.map((question): TriggerableScoreDefinition => {
      switch (question.type) {
        case DecisionModelQuestionType.CHOICE: {
          const [firstOption, ...remainingOptions] = question.options;
          return {
            name: question.scoreName,
            dataType: ScoreDataTypeEnum.CATEGORICAL,
            allowedValues: [
              firstOption.value,
              ...remainingOptions.map((option) => option.value),
            ],
          };
        }
        case DecisionModelQuestionType.SCORE:
          return {
            name: question.scoreName,
            dataType: ScoreDataTypeEnum.NUMERIC,
            minValue: 0,
            maxValue: question.levels.length - 1,
          };
        case DecisionModelQuestionType.NOUL:
          return {
            name: question.scoreName,
            dataType: ScoreDataTypeEnum.NUMERIC,
            minValue: 0,
            maxValue: 1,
          };
      }
    }),
  };
}

export function createDefaultScoreResultPredicate(
  score: TriggerableScoreDefinition,
): ScoreResultPredicate {
  switch (score.dataType) {
    case ScoreDataTypeEnum.BOOLEAN:
      return {
        scoreName: score.name,
        dataType: score.dataType,
        operator: "=",
        value: false,
      };
    case ScoreDataTypeEnum.NUMERIC:
      return {
        scoreName: score.name,
        dataType: score.dataType,
        operator: "=",
        value: score.minValue ?? 0,
      };
    case ScoreDataTypeEnum.CATEGORICAL:
      return {
        scoreName: score.name,
        dataType: score.dataType,
        operator: "=",
        value: score.allowedValues[0],
      };
    case ScoreDataTypeEnum.TEXT:
      return {
        scoreName: score.name,
        dataType: score.dataType,
        operator: "=",
        value: "",
      };
  }
}

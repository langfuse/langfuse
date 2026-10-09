import {
  createDefaultScoreResultPredicate,
  deriveEvaluatorScoreDefinitions,
  type EvaluatorScoreDefinitions,
  type SavedEvaluatorDefinitionForScoreDerivation,
  type ScoreResultPredicate,
  type TriggerableScoreDefinition,
} from "@langfuse/shared";

export const DEFAULT_SCORE_RESULT_PREDICATE: ScoreResultPredicate = {
  scoreName: "",
  dataType: "BOOLEAN",
  operator: "=",
  value: false,
};

export function prepareEvaluatorResultPredicates(
  definition: SavedEvaluatorDefinitionForScoreDerivation,
): {
  scoreDefinitions: EvaluatorScoreDefinitions;
  predicates: ScoreResultPredicate[];
} {
  const scoreDefinitions = deriveEvaluatorScoreDefinitions(definition);

  if (scoreDefinitions.mode === "known") {
    return {
      scoreDefinitions,
      predicates: scoreDefinitions.scores.map(
        createDefaultScoreResultPredicate,
      ),
    };
  }

  if (scoreDefinitions.mode === "freeform") {
    return {
      scoreDefinitions,
      predicates: [DEFAULT_SCORE_RESULT_PREDICATE],
    };
  }

  return {
    scoreDefinitions,
    predicates: [],
  };
}

export function predicateForScoreName(
  scoreName: string,
  scoreDefinitions: TriggerableScoreDefinition[],
) {
  const definition = scoreDefinitions.find((score) => score.name === scoreName);
  return definition ? createDefaultScoreResultPredicate(definition) : null;
}

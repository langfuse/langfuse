import {
  createDefaultScoreResultPredicate,
  deriveEvaluatorScoreDefinitions,
  type EvaluatorScoreDefinitions,
  type SavedEvaluatorDefinitionForScoreDerivation,
  type ScoreResultPredicate,
} from "@langfuse/shared";

import { createDefaultFreeformScoreResultPredicate } from "@/src/features/evals/v2/fns/rules/createDefaultFreeformScoreResultPredicate";

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
      predicates: [createDefaultFreeformScoreResultPredicate()],
    };
  }

  return {
    scoreDefinitions,
    predicates: [],
  };
}

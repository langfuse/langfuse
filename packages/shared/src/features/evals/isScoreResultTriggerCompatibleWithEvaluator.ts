import { ScoreDataTypeEnum } from "../../domain/scores";
import {
  deriveEvaluatorScoreDefinitions,
  type SavedEvaluatorDefinitionForScoreDerivation,
} from "./evaluatorScoreDefinitions";
import type { ScoreResultTrigger } from "./scoreResultTrigger";

export function isScoreResultTriggerCompatibleWithEvaluator(
  trigger: ScoreResultTrigger,
  evaluator: SavedEvaluatorDefinitionForScoreDerivation,
) {
  const definitions = deriveEvaluatorScoreDefinitions(evaluator);
  if (definitions.mode === "freeform") return true;
  if (definitions.mode === "unsupported") return false;

  return trigger.predicates.every((predicate) => {
    const definition = definitions.scores.find(
      (score) =>
        score.name === predicate.scoreName &&
        score.dataType === predicate.dataType,
    );
    if (!definition) return false;
    if (
      definition.dataType === ScoreDataTypeEnum.CATEGORICAL &&
      predicate.dataType === ScoreDataTypeEnum.CATEGORICAL
    ) {
      return definition.allowedValues.includes(predicate.value);
    }
    return true;
  });
}

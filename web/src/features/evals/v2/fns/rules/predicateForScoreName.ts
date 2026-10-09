import {
  createDefaultScoreResultPredicate,
  type TriggerableScoreDefinition,
} from "@langfuse/shared";

export function predicateForScoreName(
  scoreName: string,
  scoreDefinitions: TriggerableScoreDefinition[],
) {
  const definition = scoreDefinitions.find((score) => score.name === scoreName);
  return definition ? createDefaultScoreResultPredicate(definition) : null;
}

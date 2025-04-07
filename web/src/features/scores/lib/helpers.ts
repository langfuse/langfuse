import { type ScoreData } from "./types";
import { ScoreDataType, type ScoreTarget } from "@langfuse/shared";

export const isNumericDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;

export const isCategoricalDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

export const isBooleanDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.BOOLEAN;

export const isScoreUnsaved = (scoreId?: string): boolean => !scoreId;

export const toOrderedScoresList = (list: ScoreData[]): ScoreData[] =>
  list.sort((a, b) => a.key.localeCompare(b.key));

export const formatAnnotateDescription = <Target extends ScoreTarget>(
  scoreTarget: Target,
): string => {
  let sourceEntity = "session";
  if (scoreTarget.type === "trace") {
    sourceEntity = scoreTarget.observationId ? "observation" : "trace";
  }
  return `Annotate ${sourceEntity} with scores to capture human evaluation across different dimensions.`;
};

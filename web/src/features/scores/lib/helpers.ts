import { type ScoreData } from "./types";
import {
  ScoreDataType,
  type ScoreTargetTrace,
  type ScoreTarget,
  type ScoreTargetSession,
} from "@langfuse/shared";

export const isNumericDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;

export const isCategoricalDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

export const isBooleanDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.BOOLEAN;

export const isScoreUnsaved = (scoreId?: string): boolean => !scoreId;

export const toOrderedScoresList = (list: ScoreData[]): ScoreData[] =>
  list.sort((a, b) => a.key.localeCompare(b.key));

export const isTraceScore = (
  scoreTarget: ScoreTarget,
): scoreTarget is ScoreTargetTrace => scoreTarget.type === "trace";

export const isSessionScore = (
  scoreTarget: ScoreTarget,
): scoreTarget is ScoreTargetSession => scoreTarget.type === "session";

export const formatAnnotateDescription = <Target extends ScoreTarget>(
  scoreTarget: Target,
): string => {
  let sourceEntity = "session";
  if (isTraceScore(scoreTarget)) {
    sourceEntity = scoreTarget.observationId ? "observation" : "trace";
  }
  return `Annotate ${sourceEntity} with scores to capture human evaluation across different dimensions.`;
};

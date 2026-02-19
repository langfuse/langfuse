import { type ScoreData } from "./types";
import {
  type ScoreDataTypeType,
  type ScoreTargetTrace,
  type ScoreTarget,
  type ScoreTargetSession,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

export const isNumericDataType = (dataType: ScoreDataTypeType) =>
  dataType === ScoreDataTypeEnum.NUMERIC;

export const isCategoricalDataType = (dataType: ScoreDataTypeType) =>
  dataType === ScoreDataTypeEnum.CATEGORICAL;

export const isBooleanDataType = (dataType: ScoreDataTypeType) =>
  dataType === ScoreDataTypeEnum.BOOLEAN;

export const isScoreUnsaved = (scoreId?: string | null): boolean => !scoreId;

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

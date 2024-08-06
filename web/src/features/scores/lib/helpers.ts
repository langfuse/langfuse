import { ScoreDataType } from "@langfuse/shared";

export const isNumericDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;

export const isCategoricalDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

export const isBooleanDataType = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.BOOLEAN;

export const isScoreUnsaved = (scoreId?: string): boolean => !scoreId;

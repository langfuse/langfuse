import { ScoreDataType } from "@langfuse/shared";

export const isNumeric = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;

export const isCategorical = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

export const isPresent = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined && value !== "";

export const isScoreUnsaved = (scoreId?: string): boolean => !scoreId;
